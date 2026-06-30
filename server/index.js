import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(__dirname, 'database.sqlite');

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'riversoft_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://riversoft.top,https://riversoft.top,http://www.riversoft.top,https://www.riversoft.top')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const supportedPlatforms = new Set([
  'steam',
  'epic',
  'ea',
  'xbox',
  'playstation',
  'nintendo',
  'riot',
  'battlenet',
  'ubisoft',
  'discord',
  'twitch',
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

let db;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, item) => {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (!rawName) return cookies;

    try {
      cookies[rawName] = decodeURIComponent(rawValue.join('='));
    } catch {
      cookies[rawName] = rawValue.join('=');
    }

    return cookies;
  }, {});
}

function buildSessionCookie(sessionId, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];

  if (COOKIE_SECURE) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildClearSessionCookie() {
  return buildSessionCookie('', 0);
}

async function deleteExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

async function createSession(userId) {
  await deleteExpiredSessions();

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await db.run(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
    [sessionId, userId, expiresAt]
  );

  return sessionId;
}

async function ensureUserColumns() {
  const columns = await db.all('PRAGMA table_info(users)');
  const columnNames = new Set(columns.map((column) => column.name));
  const missingColumns = [
    ['avatar', 'TEXT'],
    ['bio', 'TEXT'],
    ['location', 'TEXT'],
    ['website', 'TEXT'],
  ].filter(([name]) => !columnNames.has(name));

  for (const [name, type] of missingColumns) {
    await db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
}

function sanitizeOptionalString(value, maxLength = 200) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizePlatform(value) {
  return String(value || '').trim().toLowerCase();
}

async function getUserProfile(userId) {
  const user = await db.get(
    'SELECT id, email, name, avatar, bio, location, website, created_at AS createdAt FROM users WHERE id = ?',
    [userId]
  );

  if (!user) return null;

  const platforms = await db.all(
    `SELECT platform, account_name AS accountName, profile_url AS profileUrl, updated_at AS updatedAt
     FROM platform_accounts
     WHERE user_id = ?
     ORDER BY platform ASC`,
    [userId]
  );

  return { ...user, platforms };
}

// Initialize database
async function initDb() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      bio TEXT,
      location TEXT,
      website TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      profile_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, platform),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts(user_id);
  `);

  await ensureUserColumns();
  console.log('Database initialized');
}

// Middleware to verify session cookie
const authenticateSession = async (req, res, next) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return res.sendStatus(401);
  }

  try {
    await deleteExpiredSessions();

    const session = await db.get(
      `SELECT sessions.id, users.id AS user_id, users.email, users.name, users.avatar
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
      [sessionId, Date.now()]
    );

    if (!session) {
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      return res.sendStatus(401);
    }

    req.sessionId = session.id;
    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      avatar: session.avatar,
    };
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error verifying session' });
  }
};

// API: Register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.run(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );

    const sessionId = await createSession(result.lastID);
    const user = await getUserProfile(result.lastID);

    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.status(201).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessionId = await createSession(user.id);
    const userPayload = await getUserProfile(user.id);

    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.json({ user: userPayload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// API: Logout
app.post('/api/logout', async (req, res) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  try {
    if (sessionId) {
      await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    }

    res.setHeader('Set-Cookie', buildClearSessionCookie());
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// API: Get Current User
app.get('/api/me', authenticateSession, async (req, res) => {
  const user = await getUserProfile(req.user.id);
  res.json({ user });
});

app.get('/api/profile', authenticateSession, async (req, res) => {
  const user = await getUserProfile(req.user.id);
  res.json({ user });
});

app.patch('/api/profile', authenticateSession, async (req, res) => {
  const name = sanitizeOptionalString(req.body.name, 64);
  const avatar = sanitizeOptionalString(req.body.avatar, 1000);
  const bio = sanitizeOptionalString(req.body.bio, 500);
  const location = sanitizeOptionalString(req.body.location, 80);
  const website = sanitizeOptionalString(req.body.website, 300);

  try {
    await db.run(
      `UPDATE users
       SET name = ?, avatar = ?, bio = ?, location = ?, website = ?
       WHERE id = ?`,
      [name, avatar, bio, location, website, req.user.id]
    );

    const user = await getUserProfile(req.user.id);
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

app.put('/api/profile/password', authenticateSession, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }

  try {
    const user = await db.get('SELECT id, password FROM users WHERE id = ?', [req.user.id]);
    const isValid = user && await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    await db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', [req.user.id, req.sessionId]);

    res.json({ message: 'Password updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating password' });
  }
});

app.put('/api/profile/platforms/:platform', authenticateSession, async (req, res) => {
  const platform = normalizePlatform(req.params.platform);
  const accountName = sanitizeOptionalString(req.body.accountName, 80);
  const profileUrl = sanitizeOptionalString(req.body.profileUrl, 500);

  if (!supportedPlatforms.has(platform)) {
    return res.status(400).json({ message: 'Unsupported platform' });
  }

  if (!accountName) {
    return res.status(400).json({ message: 'Platform account name is required' });
  }

  try {
    await db.run(
      `INSERT INTO platform_accounts (user_id, platform, account_name, profile_url, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, platform)
       DO UPDATE SET account_name = excluded.account_name,
                     profile_url = excluded.profile_url,
                     updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, platform, accountName, profileUrl]
    );

    const user = await getUserProfile(req.user.id);
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error linking platform account' });
  }
});

app.delete('/api/profile/platforms/:platform', authenticateSession, async (req, res) => {
  const platform = normalizePlatform(req.params.platform);

  if (!supportedPlatforms.has(platform)) {
    return res.status(400).json({ message: 'Unsupported platform' });
  }

  try {
    await db.run('DELETE FROM platform_accounts WHERE user_id = ? AND platform = ?', [req.user.id, platform]);
    const user = await getUserProfile(req.user.id);
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error unlinking platform account' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}).catch(console.error);

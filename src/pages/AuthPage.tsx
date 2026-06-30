import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { ArrowLeft, Check, Globe2, Loader2, Sparkles } from "lucide-react";

const backgroundVideo =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4";

const languageOptions = [
  { code: "zh", label: "中文", detail: "简体中文" },
  { code: "en", label: "English", detail: "English" },
] as const;

const authCopy = {
  en: {
    metaTitle: "Login | RIVERSOFT",
    metaDescription: "Sign in to your RIVERSOFT account.",
    backHome: "Back to Home",
    languageAria: "Select language",
    languageLabel: "Language",
    welcomeLogin: "Welcome back",
    welcomeRegister: "Join RIVERSOFT",
    loginSubtitle: "Enter your credentials to continue",
    registerSubtitle: "Create an account to join the studio community",
    emailLabel: "Email",
    passwordLabel: "Password",
    signIn: "Sign In",
    createAccount: "Create Account",
    switchToRegister: "Don't have an account? Sign up",
    switchToLogin: "Already have an account? Sign in",
    fallbackError: "An error occurred",
  },
  zh: {
    metaTitle: "登录 | RIVERSOFT",
    metaDescription: "登录你的 RIVERSOFT 账号。",
    backHome: "返回首页",
    languageAria: "选择语言",
    languageLabel: "语言",
    welcomeLogin: "欢迎回来",
    welcomeRegister: "加入 RIVERSOFT",
    loginSubtitle: "输入账号信息以继续",
    registerSubtitle: "创建账号，加入工作室社区",
    emailLabel: "邮箱",
    passwordLabel: "密码",
    signIn: "登录",
    createAccount: "创建账号",
    switchToRegister: "还没有账号？立即注册",
    switchToLogin: "已有账号？返回登录",
    fallbackError: "发生错误，请稍后重试。",
  },
} as const;

const zhErrorMessages: Record<string, string> = {
  "An error occurred": "发生错误，请稍后重试。",
  "Login failed": "登录失败，请检查邮箱或密码。",
  "Failed to login": "登录失败，请检查邮箱或密码。",
  "Registration failed": "注册失败，请稍后重试。",
  "Failed to register": "注册失败，请稍后重试。",
};

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  const { login, register } = useAuth();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const t = authCopy[language];

  useEffect(() => {
    document.title = t.metaTitle;

    const setMetaContent = (selector: string, content: string) => {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
    };

    setMetaContent('meta[name="description"]', t.metaDescription);
    setMetaContent('meta[property="og:title"]', t.metaTitle);
    setMetaContent('meta[property="og:description"]', t.metaDescription);
    setMetaContent('meta[name="twitter:title"]', t.metaTitle);
    setMetaContent('meta[name="twitter:description"]', t.metaDescription);
  }, [language]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate("/");
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : t.fallbackError;
      setError(language === "zh" ? zhErrorMessages[rawMessage] ?? rawMessage : rawMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-black font-body text-white flex items-center justify-center p-4">
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={backgroundVideo}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />
      <div className="absolute inset-0 z-[1] bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/80 transition-transform hover:scale-105 active:scale-95"
          >
            <ArrowLeft size={16} />
            {t.backHome}
          </Link>

          <div className="relative">
            <button
              onClick={() => setIsLanguageOpen((isOpen) => !isOpen)}
              className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
              aria-label={t.languageAria}
              aria-expanded={isLanguageOpen}
            >
              <Globe2 size={16} strokeWidth={1.7} />
            </button>

            {isLanguageOpen ? (
              <div className="liquid-glass absolute right-0 top-12 z-30 w-44 rounded-3xl p-2 text-white/80 shadow-2xl">
                <p className="px-3 pb-2 pt-1 font-body text-[0.65rem] uppercase tracking-[0.26em] text-white/45">
                  {t.languageLabel}
                </p>
                <div className="space-y-1">
                  {languageOptions.map((languageOption) => {
                    const isSelected = language === languageOption.code;

                    return (
                      <button
                        key={languageOption.code}
                        onClick={() => {
                          setLanguage(languageOption.code);
                          setIsLanguageOpen(false);
                          setError("");
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "bg-white/15 text-white"
                            : "text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>
                          <span className="block font-display text-sm font-medium tracking-[-0.02em]">
                            {languageOption.label}
                          </span>
                          <span className="mt-0.5 block font-body text-[0.65rem] text-white/45">
                            {languageOption.detail}
                          </span>
                        </span>
                        {isSelected ? <Check size={14} strokeWidth={1.8} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="liquid-glass-strong rounded-[2.5rem] p-8 lg:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 mb-4">
              <Sparkles size={24} className="text-white" />
            </span>
            <h1 className="font-display text-3xl font-medium tracking-tight text-white">
              {isLogin ? t.welcomeLogin : t.welcomeRegister}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {isLogin ? t.loginSubtitle : t.registerSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl bg-red-500/20 p-3 text-sm text-red-200 text-center border border-red-500/30">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/80 pl-1">{t.emailLabel}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="liquid-glass w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:bg-white/10 focus:ring-1 focus:ring-white/20"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/80 pl-1">{t.passwordLabel}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="liquid-glass w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:bg-white/10 focus:ring-1 focus:ring-white/20"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 font-display text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>{isLogin ? t.signIn : t.createAccount}</>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              {isLogin ? t.switchToRegister : t.switchToLogin}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

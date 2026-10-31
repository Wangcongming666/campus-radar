import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Chrome,
  Eye,
  EyeOff,
  Github,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  Radar,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { apiRequest, login } from "../../api/auth";
import { loginDestination } from "../../lib/access";
import { LeftAnimation } from "./LeftAnimation";
import "./login.css";
export type AuthMode = "login" | "register";
const rememberedEmailKey = "campus-radar:remembered-email";
function readRememberedEmail() {
  try {
    return localStorage.getItem(rememberedEmailKey) ?? "";
  } catch {
    return "";
  }
}
const formMotion = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 30,
    filter: "blur(3px)",
  }),
  visible: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: -direction * 22,
    filter: "blur(2px)",
  }),
};
export function AnimatedAuthPage() {
  const location = useLocation();
  const mode: AuthMode =
    location.pathname === "/register" ? "register" : "login";
  const direction = mode === "register" ? 1 : -1;
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [email, setEmail] = useState(readRememberedEmail),
    [displayName, setDisplayName] = useState(""),
    [progress, setProgress] = useState(0),
    [registered, setRegistered] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const previousMode = useRef(mode);
  const suffix = location.search;
  const loginHref = `/login${suffix}`,
    registerHref = `/register${suffix}`;
  useEffect(() => {
    setFocused(false);
    setProgress(0);
    setRegistered(false);
    if (previousMode.current !== mode) {
      panel.current?.scrollTo({ top: 0, behavior: "instant" });
      previousMode.current = mode;
    }
  }, [mode]);
  function captureFocus(target: EventTarget | null) {
    return (
      target instanceof HTMLInputElement &&
      ["email", "password", "displayName", "confirmPassword"].includes(
        target.name,
      )
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <main
        className={`radar-login auth-shell auth-mode-${mode}`}
        data-mode={mode}
        data-busy={submitting}
        onClickCapture={(event) => {
          if (submitting && event.target instanceof Element) {
            const link = event.target.closest("a");
            if (
              link &&
              /^\/(login|register)/.test(link.getAttribute("href") ?? "")
            )
              event.preventDefault();
          }
        }}
      >
        <LeftAnimation
          mode={mode}
          engaged={focused || submitting}
          submitting={submitting}
          progress={progress}
          complete={registered}
        />
        <section
          ref={panel}
          className="login-form-panel"
          aria-label={mode === "register" ? "创建账号" : "账号登录"}
        >
          <header className="login-panel-header">
            <Link to="/" className="login-back">
              <ArrowLeft />
              返回首页
            </Link>
          </header>
          <Link to="/" className="login-brand login-mobile-brand">
            <Radar />
            校招雷达<span>.</span>
          </Link>
          <div className="auth-form-stage">
            <nav className="auth-mode-tabs" aria-label="登录与注册切换">
              {[
                ["login", "登录", loginHref],
                ["register", "注册", registerHref],
              ].map(([value, label, href]) => (
                <Link
                  key={value}
                  to={href}
                  aria-current={mode === value ? "page" : undefined}
                  aria-disabled={submitting}
                >
                  {mode === value && (
                    <motion.span
                      layoutId="auth-mode-selection"
                      className="auth-mode-selection"
                      transition={{
                        type: "spring",
                        stiffness: 360,
                        damping: 34,
                      }}
                    />
                  )}
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <div
              className="auth-transition-stage"
              onFocusCapture={(event) => {
                if (captureFocus(event.target)) setFocused(true);
              }}
              onBlurCapture={(event) => {
                if (
                  captureFocus(event.target) &&
                  !captureFocus(event.relatedTarget)
                )
                  setFocused(false);
              }}
            >
              <AnimatePresence initial={false} mode="wait" custom={direction}>
                <motion.div
                  key={mode}
                  className="auth-route-form"
                  custom={direction}
                  variants={formMotion}
                  initial={reduced ? false : "enter"}
                  animate="visible"
                  exit="exit"
                  transition={{
                    duration: reduced ? 0.1 : 0.32,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {mode === "login" ? (
                    <LoginForm
                      email={email}
                      setEmail={setEmail}
                      switchHref={registerHref}
                      onFocusChange={setFocused}
                      onBusyChange={setSubmitting}
                    />
                  ) : (
                    <RegisterForm
                      email={email}
                      setEmail={setEmail}
                      displayName={displayName}
                      setDisplayName={setDisplayName}
                      loginHref={loginHref}
                      onBusyChange={setSubmitting}
                      onProgress={setProgress}
                      onRegistered={setRegistered}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <footer className="login-panel-footer">
            <ShieldCheck />
            安全连接 · 你的求职进度，由你掌握
          </footer>
        </section>
      </main>
    </MotionConfig>
  );
}
function LoginForm({
  onFocusChange,
  onBusyChange,
  email,
  setEmail,
  switchHref,
}: {
  onFocusChange: (value: boolean) => void;
  onBusyChange: (value: boolean) => void;
  email: string;
  setEmail: (value: string) => void;
  switchHref: string;
}) {
  const [remember, setRemember] = useState(() => !!readRememberedEmail()),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate(),
    location = useLocation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget),
      address = String(data.get("email") ?? "").trim(),
      password = String(data.get("password") ?? "");
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const user = await login(address, password);
      try {
        if (remember) localStorage.setItem(rememberedEmailKey, address);
        else localStorage.removeItem(rememberedEmailKey);
      } catch {
        /* Email convenience must not block authentication. */
      }
      navigate(
        loginDestination(
          user.role,
          new URLSearchParams(location.search).get("returnTo"),
        ),
        { replace: true },
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "登录失败，请稍后重试。",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  function isCredentialField(target: EventTarget | null) {
    return (
      target instanceof HTMLInputElement &&
      ["email", "password"].includes(target.name)
    );
  }
  return (
    <div className="login-form-content">
      <div className="login-welcome-mark">
        <Radar />
      </div>
      <h1>
        欢迎回来<span>。</span>
      </h1>
      <p className="login-intro">
        下一站，理想的自己。
        <br />
        登录后，继续追踪你的求职进展。
      </p>
      <form
        onSubmit={submit}
        aria-busy={busy}
        onFocusCapture={(e) => {
          if (isCredentialField(e.target)) onFocusChange(true);
        }}
        onBlurCapture={(e) => {
          if (
            isCredentialField(e.target) &&
            !isCredentialField(e.relatedTarget)
          )
            onFocusChange(false);
        }}
      >
        <fieldset disabled={busy}>
          <label className="login-field">
            <span>邮箱</span>
            <div className="login-input-shell">
              <Mail />
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="请输入你的邮箱"
                required
                maxLength={254}
                spellCheck={false}
                autoCapitalize="none"
              />
            </div>
          </label>
          <label className="login-field">
            <span>密码</span>
            <div className="login-input-shell">
              <LockKeyhole />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="请输入登录密码"
                required
                minLength={1}
                maxLength={128}
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          <div className="login-form-options">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span aria-hidden="true">
                {remember && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <Check />
                  </motion.span>
                )}
              </span>
              记住邮箱
            </label>
            <Link to="/forgot-password">忘记密码？</Link>
          </div>
          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                className="login-error"
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <TriangleAlert />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            type="submit"
            className="login-submit"
            aria-label={busy ? "验证中..." : "登录"}
            disabled={busy}
            whileHover={
              busy
                ? undefined
                : { y: -2, boxShadow: "0 12px 25px rgba(37,99,235,.25)" }
            }
            whileTap={busy ? undefined : { scale: 0.985 }}
          >
            {busy ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <LoaderCircle />
                </motion.span>
                验证中...
              </>
            ) : (
              <>
                登录，继续出发 <ArrowRight />
              </>
            )}
          </motion.button>
        </fieldset>
      </form>
      <div className="login-registration">
        初次来到校招雷达？{" "}
        <Link to={switchHref}>
          免费创建账号 <ArrowRight />
        </Link>
      </div>
      <div className="login-social-divider">
        <span />
        其他登录方式
        <span />
      </div>
      <div className="login-social-buttons" aria-label="第三方登录暂未开通">
        {[
          { label: "微信", icon: MessageCircle },
          { label: "GitHub", icon: Github },
          { label: "Google", icon: Chrome },
        ].map((provider) => (
          <button
            type="button"
            key={provider.label}
            disabled
            aria-label={`${provider.label} 登录暂未开通`}
            title={`${provider.label} 登录暂未开通`}
          >
            <provider.icon />
          </button>
        ))}
      </div>
      <p className="login-social-note">第三方登录暂未开通，请使用邮箱登录</p>
    </div>
  );
}

function RegisterForm({
  email,
  setEmail,
  displayName,
  setDisplayName,
  loginHref,
  onBusyChange,
  onProgress,
  onRegistered,
}: {
  email: string;
  setEmail: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  loginHref: string;
  onBusyChange: (value: boolean) => void;
  onProgress: (value: number) => void;
  onRegistered: (value: boolean) => void;
}) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);
  useEffect(() => {
    const completed =
      Number(!!displayName.trim()) +
      Number(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) +
      Number(password.length >= 12) +
      Number(!!confirm && confirm === password);
    onProgress(completed / 4);
  }, [displayName, email, password, confirm, onProgress]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!displayName.trim()) {
      setError("请填写一个昵称。");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }
    if (password.length < 12) {
      setError("密码至少需要 12 个字符。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const result = await apiRequest<{ accepted: boolean }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            displayName: displayName.trim(),
            password,
          }),
        },
      );
      if (!result.accepted) throw new Error("注册申请暂未受理，请稍后重试。");
      if (mounted.current) {
        setDone(true);
        onRegistered(true);
        setPassword("");
        setConfirm("");
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "注册暂时不可用，请稍后重试。",
        );
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  if (done)
    return (
      <div className="login-form-content auth-register-success" role="status">
        <motion.div
          className="auth-success-mark"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          <Check />
        </motion.div>
        <h1>
          注册完成，
          <br />
          账号已就绪<span>。</span>
        </h1>
        <p className="login-intro">
          现在可以直接登录，开始记录你的求职进展。
          <br />
          登录邮箱：
        </p>
        <strong className="auth-success-email">{email.trim()}</strong>
        <p className="auth-success-note">
          若该邮箱已有账号，请使用原密码登录或找回密码。
        </p>
        <Link to={loginHref} className="login-submit auth-link-button">
          前往登录
          <ArrowRight />
        </Link>
      </div>
    );
  return (
    <div className="login-form-content auth-register-content">
      <h1>
        开启你的下一站<span>。</span>
      </h1>
      <p className="login-intro">
        让每一次认真准备，都有所积累。
        <br />
        创建账号后即可登录，开始你的求职旅程。
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <label className="login-field">
            <span>昵称</span>
            <div className="login-input-shell">
              <UserRound />
              <input
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="我们该怎么称呼你"
                autoComplete="nickname"
                maxLength={40}
                required
              />
            </div>
          </label>
          <label className="login-field">
            <span>邮箱</span>
            <div className="login-input-shell">
              <Mail />
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="用于登录和找回密码"
                autoComplete="email"
                maxLength={254}
                spellCheck={false}
                autoCapitalize="none"
                required
              />
            </div>
          </label>
          <label className="login-field">
            <span>密码</span>
            <div className="login-input-shell">
              <LockKeyhole />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="设置至少 12 个字符的密码"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                aria-describedby="register-password-hint"
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          <label className="login-field">
            <span>确认密码</span>
            <div className="login-input-shell">
              <ShieldCheck />
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="再输入一次密码"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </div>
          </label>
          <p className="auth-password-hint" id="register-password-hint">
            <LockKeyhole />
            密码至少 12 个字符，建议组合字母、数字和符号。
          </p>
          {error && (
            <motion.div
              role="alert"
              className="login-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <TriangleAlert />
              <span>{error}</span>
            </motion.div>
          )}
          <motion.button
            type="submit"
            className="login-submit"
            aria-label={busy ? "正在创建账号" : "创建账号"}
            disabled={busy}
            whileHover={busy ? undefined : { y: -2 }}
            whileTap={busy ? undefined : { scale: 0.985 }}
          >
            {busy ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <LoaderCircle />
                </motion.span>
                正在创建账号...
              </>
            ) : (
              <>
                创建账号，开始准备
                <ArrowRight />
              </>
            )}
          </motion.button>
        </fieldset>
      </form>
      <div className="login-registration">
        已经有账号？
        <Link to={loginHref}>
          直接登录
          <ArrowRight />
        </Link>
      </div>
      <div className="auth-register-note">
        <ShieldCheck />
        <p>
          账号仅用于保存你的求职进度。
          <br />
          私有简历与学习笔记，仅在授权范围内访问。
        </p>
      </div>
    </div>
  );
}

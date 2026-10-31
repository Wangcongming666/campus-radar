import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Radar } from "lucide-react";
import { Button, Field, PageHeader, Panel, Avatar } from "../components/ui";
import {
  apiRequest,
  logout,
  currentAccount,
  ApiError,
  clearCsrf,
  type CurrentAccount,
} from "../api/auth";
import "./public.css";
import "./account.css";
import type { components } from "../api/generated";
import { setThemePreference, type ThemePreference } from "../lib/theme";

const texts: Record<
  string,
  { title: string; description: string; action: string }
> = {
  "/forgot-password": {
    title: "找回你的账号",
    description: "我们将向符合条件的账号发送密码重置邮件。",
    action: "发送重置邮件",
  },
  "/reset-password": {
    title: "设置新的密码",
    description: "设置至少 12 个字符的新密码，旧会话将全部退出。",
    action: "重置密码",
  },
};
export function ApiAuthPage() {
  const location = useLocation();
  const path = location.pathname;
  const text = texts[path] ?? texts["/forgot-password"];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const tokenRef = useRef("");
  useEffect(() => {
    setError("");
    setDone("");
    const hash = new URLSearchParams(location.hash.slice(1));
    const search = new URLSearchParams(location.search);
    tokenRef.current = hash.get("token") ?? search.get("token") ?? "";
    if (tokenRef.current) {
      search.delete("token");
      hash.delete("token");
      const rest = search.toString();
      const fragment = hash.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${path}${rest ? `?${rest}` : ""}${fragment ? `#${fragment}` : ""}`,
      );
    }
  }, [path, location.key]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setBusy(true);
    setError("");
    try {
      const resetting = path === "/reset-password";
      if (
        resetting &&
        (tokenRef.current.length < 32 || tokenRef.current.length > 128)
      )
        throw new Error("链接缺少有效令牌，请重新申请邮件。");
      await apiRequest(`/api/v1/auth${path}`, {
        method: "POST",
        body: JSON.stringify(
          resetting
            ? { token: tokenRef.current, newPassword: password }
            : { email },
        ),
      });
      if (resetting) {
        clearCsrf();
        window.dispatchEvent(new Event("campus:account-changed"));
      }
      setDone(
        resetting
          ? "密码已重置，请使用新密码登录。"
          : "申请已受理。如果该邮箱符合条件，将收到邮件，请检查收件箱与垃圾邮件。",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "操作失败，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  const emailNeeded = path !== "/reset-password";
  const passwordNeeded = path === "/reset-password";
  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link to="/" className="landing-brand">
          <Radar />
          校招雷达<span>.</span>
        </Link>
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            每一次准备，
            <br />
            都更接近新的可能。
          </h1>
          <p>让机会有迹可循，让成长清晰可见。</p>
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-form">
          <Link to="/" className="muted small">
            ← 返回首页
          </Link>
          <h1>{text.title}</h1>
          <p className="muted">{text.description}</p>
          {done ? (
            <div role="status" className="stack">
              <p>{done}</p>
              <Link className="button primary" to="/login">
                前往登录
              </Link>
            </div>
          ) : (
            <form
              key={path}
              onSubmit={submit}
              className="stack"
              aria-busy={busy}
            >
              <fieldset
                disabled={busy}
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 18,
                }}
              >
                {emailNeeded && (
                  <Field label="邮箱">
                    <input
                      className="input"
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                    />
                  </Field>
                )}
                {passwordNeeded && (
                  <Field label="新密码">
                    <input
                      className="input"
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                    <span className="muted small">至少 12 个字符。</span>
                  </Field>
                )}
                {error && <p role="alert">{error}</p>}
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "正在处理…" : text.action}
                </Button>
              </fieldset>
            </form>
          )}
          <div className="row" style={{ marginTop: 24, flexWrap: "wrap" }}>
            <Link to="/register">创建账号</Link>
            <Link to="/forgot-password">忘记密码</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Account pages share the server session; authentication tokens are never persisted in browser storage.
function useAccount() {
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [error, setError] = useState("");
  const [unauthenticated, setUnauthenticated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    currentAccount(controller.signal)
      .then((user) => {
        setAccount(user);
        setThemePreference(user.theme.toLowerCase() as ThemePreference);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "无法加载账号。");
          setUnauthenticated(
            reason instanceof ApiError && reason.status === 401,
          );
        }
      });
    return () => controller.abort();
  }, []);
  return { account, setAccount, error, unauthenticated };
}
function AccountLoading({
  error,
  unauthenticated,
}: {
  error: string;
  unauthenticated: boolean;
}) {
  const { pathname } = useLocation();
  return (
    <div className="stack">
      {error ? (
        <>
          <p role="alert">{error}</p>
          {unauthenticated ? (
            <Link
              className="button primary"
              to={`/login?returnTo=${encodeURIComponent(pathname)}`}
            >
              登录账号
            </Link>
          ) : (
            <Button onClick={() => window.location.reload()}>重新加载</Button>
          )}
        </>
      ) : (
        <p role="status">正在加载账号…</p>
      )}
    </div>
  );
}
export function ApiMePage() {
  const { account, error, unauthenticated } = useAccount();
  const [overview, setOverview] = useState<
    components["schemas"]["Overview"] | null
  >(null);
  const [overviewError, setOverviewError] = useState("");
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    apiRequest<components["schemas"]["Overview"]>("/api/v1/me/overview", {
      signal: controller.signal,
    })
      .then(setOverview)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setOverviewError(
            reason instanceof Error ? reason.message : "无法加载概览。",
          );
      });
    return () => controller.abort();
  }, [account]);
  if (!account)
    return <AccountLoading error={error} unauthenticated={unauthenticated} />;
  return (
    <div className="stack">
      <Panel className="profile-hero">
        <div className="between">
          <div className="row">
            <Avatar name={account.displayName} size="lg" />
            <div>
              <h1>{account.displayName}</h1>
              <p className="muted">
                {account.school || "尚未填写学校"}
                {account.graduationYear
                  ? ` · ${account.graduationYear} 届`
                  : ""}
              </p>
              <p className="small muted">{account.emailMasked}</p>
            </div>
          </div>
          <Link className="button" to="/settings">
            编辑资料
          </Link>
        </div>
      </Panel>
      <PageHeader
        title="我的求职概览"
        description="从真实的投递与收藏记录，查看当前进展。"
      />
      {overviewError && <p role="alert">{overviewError}</p>}
      {overview && (
        <div className="metric-grid">
          {[
            ["投递记录", overview.applications],
            ["面试安排", overview.interviews],
            ["收到 Offer", overview.offers],
            ["收藏", overview.favorites],
          ].map(([label, value]) => (
            <Panel key={label}>
              <p className="muted">{label}</p>
              <h2>{value}</h2>
            </Panel>
          ))}
        </div>
      )}
      <Panel title="继续你的下一步">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link className="button primary" to="/pipeline">
            管理投递
          </Link>
          <Link className="button" to="/favorites">
            查看收藏
          </Link>
          <Link className="button" to="/jobs">
            寻找岗位
          </Link>
          <Link className="button" to="/notifications">
            消息 {overview ? `(${overview.unreadNotifications})` : ""}
          </Link>
        </div>
      </Panel>
      {overview && (
        <Panel title="最近的投递进展">
          {overview.recentEvents.length ? (
            <ul>
              {overview.recentEvents.map((event) => (
                <li key={event.id}>
                  {event.toStage} ·{" "}
                  {new Date(event.occurredAt).toLocaleString("zh-CN")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">暂无投递进展，添加一份投递后会记录在这里。</p>
          )}
        </Panel>
      )}
    </div>
  );
}
export { ApiSettingsPage } from "./settings-page";
export function ApiOnboardingPage() {
  const { account, error, unauthenticated } = useAccount();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFailure("");
    try {
      await apiRequest("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({
          version: account.version,
          school: String(data.get("school") ?? "").trim() || null,
          graduationYear: Number(data.get("year")),
          onboardingStep: 4,
          preferences: {
            roles: [String(data.get("role"))],
            cities: [String(data.get("city"))],
            recruitmentTypes: ["CAMPUS"],
            graduationYear: Number(data.get("year")),
          },
        }),
      });
      window.dispatchEvent(new Event("campus:account-changed"));
      navigate("/me", { replace: true });
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  if (!account)
    return <AccountLoading error={error} unauthenticated={unauthenticated} />;
  return (
    <div className="stack">
      <PageHeader
        title="认识你的求职目标"
        description="先填写基础偏好，之后可以随时在设置中修改。"
      />
      <Panel>
        <form className="stack" onSubmit={submit}>
          <fieldset
            disabled={busy}
            style={{
              border: 0,
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 18,
            }}
          >
            <Field label="学校">
              <input
                className="input"
                name="school"
                defaultValue={account.school ?? ""}
                maxLength={100}
              />
            </Field>
            <Field label="毕业年份">
              <input
                className="input"
                name="year"
                type="number"
                min={2000}
                max={2100}
                defaultValue={
                  account.graduationYear ?? new Date().getFullYear() + 1
                }
                required
              />
            </Field>
            <Field label="求职方向">
              <select name="role" className="input">
                {[
                  "前端开发",
                  "后端开发",
                  "算法",
                  "产品",
                  "设计",
                  "测试开发",
                ].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field label="意向城市">
              <input
                className="input"
                name="city"
                defaultValue={account.preferences.cities[0] ?? "上海"}
                required
                maxLength={64}
              />
            </Field>
            {failure && <p role="alert">{failure}</p>}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "正在保存…" : "完成设置"}
            </Button>
          </fieldset>
        </form>
      </Panel>
    </div>
  );
}

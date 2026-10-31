import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserRound,
  SlidersHorizontal,
  Palette,
  ShieldCheck,
  Database,
  Check,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { useAccount } from "../app/api-shell";
import {
  apiRequest,
  ApiError,
  clearCsrf,
  logout,
  type CurrentAccount,
} from "../api/auth";
import { Button, Field, PageHeader, Panel } from "../components/ui";
import { setThemePreference, type ThemePreference } from "../lib/theme";
import { ApiAccountDataTools } from "./account-data-api";
import "./settings.css";

type Tab = "profile" | "preferences" | "appearance" | "security" | "data";
function values(user: CurrentAccount) {
  return {
    displayName: user.displayName,
    school: user.school ?? "",
    education: user.education ?? "",
    graduationYear: user.graduationYear?.toString() ?? "",
    roles: user.preferences.roles.join("，"),
    cities: user.preferences.cities.join("，"),
    recruitmentTypes: [...user.preferences.recruitmentTypes],
    buddyDiscoverable: user.buddyDiscoverable,
    theme: user.theme,
    timezone: user.timezone,
  };
}
type Draft = ReturnType<typeof values>;
// Private form values live only in memory, including during a same-account reconnect.
let memory: {
  owner: string;
  role: string;
  version: number;
  draft: Draft;
  tab: Tab;
} | null = null;
if (typeof window !== "undefined")
  window.addEventListener("campus:account-changed", () => {
    memory = null;
  });
const sections = [
  {
    key: "profile",
    label: "个人资料",
    description: "昵称、学校与毕业信息",
    icon: UserRound,
  },
  {
    key: "preferences",
    label: "求职偏好",
    description: "目标方向、城市与招聘类型",
    icon: SlidersHorizontal,
  },
  {
    key: "appearance",
    label: "外观与时区",
    description: "主题显示与时间格式",
    icon: Palette,
  },
  {
    key: "security",
    label: "账号安全",
    description: "登录信息与密码管理",
    icon: ShieldCheck,
  },
  {
    key: "data",
    label: "数据管理",
    description: "备份、恢复与工作区管理",
    icon: Database,
  },
] as const;
export function ApiSettingsPage() {
  const { user } = useAccount();
  return user ? <Settings key={`${user.id}:${user.role}`} user={user} /> : null;
}
function Settings({ user }: { user: CurrentAccount }) {
  const navigate = useNavigate();
  const [initial] = useState(() => {
    if (memory?.owner !== user.id || memory.role !== user.role)
      memory = {
        owner: user.id,
        role: user.role,
        version: user.version,
        draft: values(user),
        tab: "profile",
      };
    return memory;
  });
  const [draft, setDraft] = useState(initial.draft);
  const [version, setVersion] = useState(initial.version);
  const [tab, setTab] = useState<Tab>(
    user.role === "USER" || !["preferences", "data"].includes(initial.tab)
      ? initial.tab
      : "profile",
  );
  const [dataVisited, setDataVisited] = useState(tab === "data");
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<CurrentAccount | null>(null);
  const controller = useRef(new AbortController());
  const lock = useRef(false);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    memory = { owner: user.id, role: user.role, version, draft: next, tab };
    setMessage("");
  }
  function select(next: Tab) {
    setTab(next);
    setDataVisited((v) => v || next === "data");
    setMessage("");
    setFailure("");
    setConflict(null);
    memory = { owner: user.id, role: user.role, version, draft, tab: next };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setFailure("");
    setMessage("");
    setConflict(null);
    const list = (value: string) => [
      ...new Set(
        value
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
    const roles = list(draft.roles),
      cities = list(draft.cities);
    if (tab === "profile" && !draft.displayName.trim()) {
      setFailure("请填写昵称，不能只包含空格。");
      return;
    }
    if (
      tab === "preferences" &&
      (roles.length > 10 ||
        roles.some((v) => v.length > 32) ||
        cities.length > 20 ||
        cities.some((v) => v.length > 64))
    ) {
      setFailure(
        "求职方向最多 10 个、每个不超过 32 字；城市最多 20 个、每个不超过 64 字。",
      );
      return;
    }
    const payload =
      tab === "profile"
        ? {
            version,
            displayName: draft.displayName.trim(),
            school: draft.school.trim() || null,
            education: draft.education || null,
            graduationYear: draft.graduationYear
              ? Number(draft.graduationYear)
              : null,
          }
        : tab === "preferences"
          ? {
              version,
              preferences: {
                roles,
                cities,
                recruitmentTypes: draft.recruitmentTypes,
                graduationYear: user.graduationYear,
              },
              buddyDiscoverable: draft.buddyDiscoverable,
            }
          : { version, theme: draft.theme, timezone: draft.timezone.trim() };
    lock.current = true;
    setBusy(true);
    const signal = controller.current.signal;
    try {
      const saved = await apiRequest<CurrentAccount>("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
        signal,
      });
      if (signal.aborted) return;
      setVersion(saved.version);
      memory = {
        owner: user.id,
        role: user.role,
        version: saved.version,
        draft,
        tab,
      };
      setThemePreference(saved.theme.toLowerCase() as ThemePreference);
      setMessage("设置已保存。");
      window.dispatchEvent(new Event("focus"));
    } catch (reason) {
      if (signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 409) {
        setFailure(
          "资料已在其他页面更新。当前输入已保留，可先复制需要的内容，再加载最新资料。",
        );
        try {
          const latest = await apiRequest<CurrentAccount>("/api/v1/me", {
            signal,
          });
          if (!signal.aborted) setConflict(latest);
        } catch {
          /* Keep the original conflict and draft. */
        }
      } else
        setFailure(
          reason instanceof Error ? reason.message : "保存失败，请重试。",
        );
    } finally {
      if (!signal.aborted) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setFailure("");
    setMessage("");
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setFailure("两次输入的新密码不一致，请检查后重试。");
      return;
    }
    lock.current = true;
    setBusy(true);
    const signal = controller.current.signal;
    try {
      await apiRequest("/api/v1/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        }),
        signal,
      });
      if (signal.aborted) return;
      clearCsrf();
      form.reset();
      memory = null;
      window.dispatchEvent(new Event("campus:account-changed"));
      navigate("/login", { replace: true });
    } catch (reason) {
      if (!signal.aborted)
        setFailure(
          reason instanceof Error ? reason.message : "修改失败，请重试。",
        );
    } finally {
      if (!signal.aborted) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function reloadAfterDataChange() {
    // A completed replacement invalidates drafts; ordinary reconnects keep them.
    memory = null;
    const signal = controller.current.signal;
    const latest = await apiRequest<CurrentAccount>("/api/v1/me", { signal });
    if (signal.aborted) return;
    const next = values(latest);
    setDraft(next);
    setVersion(latest.version);
    setConflict(null);
    setFailure("");
    setMessage("");
    memory = {
      owner: latest.id,
      role: latest.role,
      version: latest.version,
      draft: next,
      tab: "data",
    };
    setThemePreference(latest.theme.toLowerCase() as ThemePreference);
    window.dispatchEvent(new Event("focus"));
  }
  const current = sections.find((s) => s.key === tab)!;
  return (
    <div className="settings-page">
      <PageHeader
        title={user.role === "USER" ? "偏好设置" : "账号设置"}
        description="让资料、使用习惯与账号安全各就其位。选择分类后，修改并保存设置。"
      />
      <div className="settings-workspace">
        <aside className="settings-sidebar">
          <nav aria-label="设置分类">
            {sections
              .filter(
                (s) =>
                  user.role === "USER" ||
                  !["preferences", "data"].includes(s.key),
              )
              .map(({ key, label, description, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => select(key)}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              ))}
          </nav>
          <p className="settings-sidebar-note">
            各分类单独保存。切换分类会保留本页输入，刷新页面前请先保存。
          </p>
        </aside>
        <div className="settings-content">
          {failure && (
            <div
              className="settings-feedback settings-feedback-error"
              role="alert"
            >
              {failure}
              {conflict && (
                <Button
                  onClick={() => {
                    const next = values(conflict);
                    setDraft(next);
                    setVersion(conflict.version);
                    memory = {
                      owner: user.id,
                      role: user.role,
                      version: conflict.version,
                      draft: next,
                      tab,
                    };
                    setConflict(null);
                    setFailure("");
                    setMessage("已加载最新资料，请重新编辑后保存。");
                  }}
                >
                  放弃本页输入，加载最新资料
                </Button>
              )}
            </div>
          )}
          {message && (
            <p
              className="settings-feedback settings-feedback-success"
              role="status"
            >
              <Check size={18} aria-hidden="true" />
              {message}
            </p>
          )}
          {tab !== "data" && tab !== "security" && (
            <Panel className="settings-editor">
              <div className="settings-section-heading">
                <h2>{current.label}</h2>
                <p>
                  {tab === "profile"
                    ? "补充基础信息，方便在求职过程中使用。除昵称外，其余信息均可选填。"
                    : tab === "preferences"
                      ? "记录你关注的机会；留空表示暂不设置偏好。"
                      : "选择适合你的界面主题，并确认日程使用的时区。"}
                </p>
              </div>
              <form onSubmit={save}>
                <fieldset disabled={busy} className="settings-fields">
                  {tab === "profile" ? (
                    <div className="settings-form-grid">
                      <Field
                        label="昵称"
                        hint="1–40 个字符，用一个容易辨认的名字。"
                      >
                        <input
                          aria-label="昵称"
                          className="input"
                          value={draft.displayName}
                          onChange={(e) =>
                            update({ displayName: e.target.value })
                          }
                          required
                          maxLength={40}
                          placeholder="例如：小林同学"
                          autoComplete="nickname"
                        />
                      </Field>
                      <Field label="学校" hint="选填，填写学校全称。">
                        <input
                          aria-label="学校"
                          className="input"
                          value={draft.school}
                          onChange={(e) => update({ school: e.target.value })}
                          maxLength={100}
                          placeholder="例如：浙江大学"
                          autoComplete="organization"
                        />
                      </Field>
                      <Field
                        label="学历"
                        hint="选填，选择正在攻读或已获得的学历。"
                      >
                        <select
                          aria-label="学历"
                          className="input"
                          value={draft.education}
                          onChange={(e) =>
                            update({ education: e.target.value })
                          }
                        >
                          <option value="">暂不填写</option>
                          <option value="ASSOCIATE">专科</option>
                          <option value="BACHELOR">本科</option>
                          <option value="MASTER">硕士</option>
                          <option value="DOCTORATE">博士</option>
                        </select>
                      </Field>
                      <Field
                        label="毕业年份"
                        hint="选填，填写四位年份，如 2027。"
                      >
                        <input
                          aria-label="毕业年份"
                          className="input"
                          type="number"
                          min={2000}
                          max={2100}
                          step={1}
                          value={draft.graduationYear}
                          onChange={(e) =>
                            update({ graduationYear: e.target.value })
                          }
                          placeholder="例如：2027"
                        />
                      </Field>
                    </div>
                  ) : tab === "preferences" ? (
                    <>
                      <div className="settings-form-grid">
                        <Field
                          label="求职方向"
                          hint="多个方向用逗号分隔，最多 10 个。"
                        >
                          <input
                            aria-label="求职方向"
                            className="input"
                            value={draft.roles}
                            onChange={(e) => update({ roles: e.target.value })}
                            maxLength={330}
                            placeholder="例如：后端开发，前端开发"
                          />
                        </Field>
                        <Field
                          label="意向城市"
                          hint="多个城市用逗号分隔，最多 20 个。"
                        >
                          <input
                            aria-label="意向城市"
                            className="input"
                            value={draft.cities}
                            onChange={(e) => update({ cities: e.target.value })}
                            maxLength={1300}
                            placeholder="例如：杭州，上海"
                          />
                        </Field>
                      </div>
                      <fieldset className="settings-choice-group">
                        <legend>招聘类型</legend>
                        <p>可多选；不选择表示暂不限类型。</p>
                        <div className="settings-choices">
                          {(
                            [
                              ["CAMPUS", "校园招聘"],
                              ["INTERNSHIP", "实习岗位"],
                            ] as const
                          ).map(([value, label]) => (
                            <label key={value}>
                              <input
                                type="checkbox"
                                checked={draft.recruitmentTypes.includes(value)}
                                onChange={(e) =>
                                  update({
                                    recruitmentTypes: e.target.checked
                                      ? [...draft.recruitmentTypes, value]
                                      : draft.recruitmentTypes.filter(
                                          (v) => v !== value,
                                        ),
                                  })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label className="settings-discovery">
                        <input
                          type="checkbox"
                          checked={draft.buddyDiscoverable}
                          onChange={(e) =>
                            update({ buddyDiscoverable: e.target.checked })
                          }
                        />
                        <span>
                          <strong>允许同路人发现我</strong>
                          <small>
                            开启后，其他用户可在邀请候选中搜索你的公开昵称与方向。
                          </small>
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <fieldset className="settings-choice-group">
                        <legend>界面主题</legend>
                        <div className="settings-theme-options">
                          {(
                            [
                              { value: "LIGHT", label: "清晰亮色", icon: Sun },
                              { value: "DARK", label: "深空暗色", icon: Moon },
                              {
                                value: "SYSTEM",
                                label: "跟随系统",
                                icon: Monitor,
                              },
                            ] as const
                          ).map(({ value, label, icon: Icon }) => (
                            <label
                              key={value}
                              className={
                                draft.theme === value ? "selected" : ""
                              }
                            >
                              <input
                                type="radio"
                                name="theme"
                                value={value}
                                checked={draft.theme === value}
                                onChange={() => update({ theme: value })}
                              />
                              <Icon aria-hidden="true" />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        <p>
                          点击保存后生效；“跟随系统”会自动使用设备的外观设置。
                        </p>
                      </fieldset>
                      <Field
                        label="日程时区"
                        hint="使用 IANA 时区名称，如 Asia/Shanghai（中国标准时间）。"
                      >
                        <input
                          aria-label="日程时区"
                          className="input"
                          value={draft.timezone}
                          onChange={(e) => update({ timezone: e.target.value })}
                          required
                          maxLength={64}
                          list="settings-timezones"
                          placeholder="例如：Asia/Shanghai"
                        />
                        <datalist id="settings-timezones">
                          {[
                            "Asia/Shanghai",
                            "Asia/Hong_Kong",
                            "Asia/Tokyo",
                            "Europe/London",
                            "America/New_York",
                            "UTC",
                          ].map((zone) => (
                            <option key={zone} value={zone} />
                          ))}
                        </datalist>
                      </Field>
                    </>
                  )}
                  <footer className="settings-form-footer">
                    <span>仅保存当前分类的修改</span>
                    <Button type="submit" variant="primary" disabled={busy}>
                      {busy ? "正在保存…" : "保存设置"}
                    </Button>
                  </footer>
                </fieldset>
              </form>
            </Panel>
          )}
          {tab === "security" && (
            <div className="settings-security">
              <Panel className="settings-editor">
                <div className="settings-section-heading">
                  <h2>修改密码</h2>
                  <p>修改成功后，所有设备将退出登录。请使用新密码重新登录。</p>
                </div>
                <form onSubmit={password}>
                  <fieldset disabled={busy} className="settings-fields">
                    <Field label="当前密码">
                      <input
                        className="input"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                        maxLength={128}
                        placeholder="输入当前登录密码"
                      />
                    </Field>
                    <div className="settings-form-grid">
                      <Field
                        label="新密码"
                        hint="12–128 个字符，建议结合字母、数字与符号。"
                      >
                        <input
                          aria-label="新密码"
                          className="input"
                          name="newPassword"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                          placeholder="设置新的登录密码"
                        />
                      </Field>
                      <Field label="确认新密码" hint="再次输入，确认没有输错。">
                        <input
                          aria-label="确认新密码"
                          className="input"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                          placeholder="再次输入新密码"
                        />
                      </Field>
                    </div>
                    <footer className="settings-form-footer">
                      <span>请勿与其他网站共用密码</span>
                      <Button type="submit" variant="primary" disabled={busy}>
                        {busy ? "正在处理…" : "更新密码并重新登录"}
                      </Button>
                    </footer>
                  </fieldset>
                </form>
              </Panel>
              <Panel className="settings-session">
                <div>
                  <h2>当前登录账号</h2>
                  <p>{user.emailMasked}</p>
                </div>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    try {
                      await logout();
                      navigate("/login", { replace: true });
                    } catch (reason) {
                      if (!controller.current.signal.aborted)
                        setFailure(
                          reason instanceof Error
                            ? reason.message
                            : "退出失败。",
                        );
                    } finally {
                      if (!controller.current.signal.aborted) {
                        lock.current = false;
                        setBusy(false);
                      }
                    }
                  }}
                >
                  退出当前登录
                </Button>
              </Panel>
            </div>
          )}
          {user.role === "USER" && dataVisited && (
            <div hidden={tab !== "data"}>
              <ApiAccountDataTools onWorkspaceChanged={reloadAfterDataChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

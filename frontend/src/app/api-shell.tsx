import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { Link, NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import {
  Radar,
  Menu,
  Search,
  Sun,
  Moon,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { navigationFor, titleFor } from "./navigation";
import {
  currentAccount,
  logout,
  type CurrentAccount,
  ApiError,
} from "../api/auth";
import { accountHome, isManagementRole } from "../lib/access";
import { useTheme } from "../lib/theme";
import { Avatar, Modal, Button } from "../components/ui";
import { useApi } from "../components/api-ui";
import type { components } from "../api/generated";
const AccountContext = createContext<{
  user: CurrentAccount | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}>({ user: null, loading: true, error: "", refresh: () => {} });
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentAccount | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const version = ++generation.current;
    setLoading(true);
    return currentAccount(controller.signal)
      .then((value) => {
        if (version !== generation.current || controller.signal.aborted) return;
        setUser(value);
        setError("");
      })
      .catch((reason) => {
        if (version !== generation.current || controller.signal.aborted) return;
        setUser(null);
        setError(
          reason instanceof ApiError && reason.status === 401
            ? ""
            : reason.message,
        );
      })
      .finally(() => {
        if (version === generation.current && !controller.signal.aborted)
          setLoading(false);
      });
  }, []);
  useEffect(() => {
    let active = true;
    const reload = () => {
      if (active && !document.hidden) void refresh();
    };
    const offline = () => {
      if (active) {
        generation.current++;
        requestController.current?.abort();
        setUser(null);
        setLoading(false);
        setError("后端连接不可用，已隐藏未能重新验证的数据。");
      }
    };
    reload();
    window.addEventListener("campus:account-changed", reload);
    window.addEventListener("campus:api-unavailable", offline);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    const timer = window.setInterval(reload, 10000);
    return () => {
      active = false;
      generation.current++;
      requestController.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("campus:account-changed", reload);
      window.removeEventListener("campus:api-unavailable", offline);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh]);
  return (
    <AccountContext.Provider
      value={{
        user,
        loading,
        error,
        refresh: () => {
          void refresh();
        },
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
export const useAccount = () => useContext(AccountContext);
export function RequireAccount({
  children,
  audience = "any",
  admin = false,
}: {
  children: ReactNode;
  audience?: "any" | "user" | "admin" | "management";
  admin?: boolean;
}) {
  const account = useAccount(),
    location = useLocation();
  const expected = admin ? "management" : audience;
  if (account.loading && !account.user)
    return <p role="status">正在确认登录状态…</p>;
  if (account.error)
    return (
      <div className="page-error" role="alert">
        <h1>后端连接不可用</h1>
        <p>{account.error}</p>
        <Button onClick={account.refresh}>重新连接</Button>
      </div>
    );
  if (!account.user)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (expected === "user" && account.user.role !== "USER")
    return <Navigate to={accountHome(account.user.role)} replace />;
  if (expected === "admin" && account.user.role !== "ADMIN")
    return (
      <div className="page-error" role="alert">
        <h1>无管理权限</h1>
        <Link to={accountHome(account.user.role)}>返回工作台</Link>
      </div>
    );
  if (expected === "management" && !isManagementRole(account.user.role))
    return (
      <div className="page-error" role="alert">
        <h1>无管理权限</h1>
        <Link to="/me">返回个人中心</Link>
      </div>
    );
  return <>{children}</>;
}
export function ApiShell() {
  const account = useAccount(),
    location = useLocation();
  const management = isManagementRole(account.user?.role);
  const groups =
    account.error || (account.loading && !account.user)
      ? []
      : navigationFor(account.user?.role);
  const [menu, setMenu] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(false),
    [q, setQ] = useState("");
  const theme = useTheme();
  const hits = useApi<components["schemas"]["SearchResult"]>(
    search && q.trim().length >= 2
      ? `/api/v1/search?q=${encodeURIComponent(q.trim())}&limit=20`
      : null,
  );
  useEffect(() => {
    setMenu(false);
    document.title = titleFor(location.pathname) + " · 校招雷达";
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !management
      ) {
        e.preventDefault();
        setSearch((x) => !x);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [management]);
  const tabs = management
    ? groups
        .flatMap((g) => g.items)
        .filter((item) =>
          ["/admin", "/admin/users", "/settings"].includes(item.path),
        )
    : groups
        .flatMap((g) => g.items)
        .filter((item) =>
          ["/jobs", "/pipeline", "/calendar", "/me"].includes(item.path),
        );
  if (
    management &&
    !(
      /^\/admin(?:\/|$)/.test(location.pathname) ||
      location.pathname === "/settings" ||
      location.pathname === "/community" ||
      /^\/experiences(?:\/|$)/.test(location.pathname)
    )
  )
    return <Navigate to="/admin" replace />;
  return (
    <div
      className={`app-frame ${collapsed ? "collapsed" : ""} ${menu ? "menu-open" : ""}`}
    >
      <button
        className="menu-backdrop"
        aria-label="关闭导航"
        onClick={() => setMenu(false)}
      />
      <aside className="app-sidebar">
        <Link to={management ? "/admin" : "/"} className="brand">
          <span className="brand-mark">
            {management ? <ShieldCheck /> : <Radar />}
          </span>
          <span className="brand-copy">
            <span className="brand-name">
              校招雷达<b>.</b>
            </span>
            <span className="brand-en">
              {management ? "MANAGEMENT CONSOLE" : "CAMPUS RADAR"}
            </span>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="主导航">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-name">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path !== "/submissions"}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  title={item.label}
                >
                  <item.icon />
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-profile">
          <Avatar name={account.user?.displayName ?? "访"} size="sm" />
          <div className="profile-copy">
            <strong>{account.user?.displayName ?? "欢迎来到校招雷达"}</strong>
            <p className="small muted">
              {management
                ? account.user?.role === "ADMIN"
                  ? "平台管理员"
                  : "内容审核员"
                : (account.user?.emailMasked ?? "登录后保存求职进度")}
            </p>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="row api-topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <button
              className="icon-button"
              aria-label="收起侧栏"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            </button>
            <span className="api-topbar-title">
              {titleFor(location.pathname)}
            </span>
          </div>
          <div className="row api-topbar-actions">
            {!management && !account.error && (
              <button
                className="search-trigger"
                onClick={() => setSearch(true)}
              >
                <Search />
                <span>搜索岗位、公司、知识</span>
                <kbd>⌘ K</kbd>
              </button>
            )}
            <button
              className="icon-button"
              aria-label="切换主题"
              onClick={() =>
                theme.setTheme(theme.resolved === "dark" ? "light" : "dark")
              }
            >
              {theme.resolved === "dark" ? <Sun /> : <Moon />}
            </button>
            {!management && !account.error && (
              <Link
                className="icon-button"
                aria-label="通知中心"
                to="/notifications"
              >
                <Bell />
              </Link>
            )}
            {account.user ? (
              <>
                <Link to={management ? "/settings" : "/me"}>
                  <Avatar name={account.user.displayName} size="sm" />
                </Link>
                <button
                  className="text-button"
                  aria-label="退出登录"
                  onClick={() => void logout().catch((e) => alert(e.message))}
                >
                  <LogOut /> 退出
                </button>
              </>
            ) : (
              <Link className="button button-primary" to="/login">
                登录
              </Link>
            )}
          </div>
        </header>
        <main className="page-content" id="main-content">
          {account.error ? (
            <div className="page-error" role="alert">
              <h1>后端连接不可用</h1>
              <p>当前内容已隐藏，请启动后端后重试。</p>
              <Button onClick={account.refresh}>重新连接</Button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <nav className="mobile-tabs">
          {tabs.map((item) => (
            <NavLink key={item.path} to={item.path}>
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <Modal
        open={search && !management}
        onClose={() => setSearch(false)}
        title="搜索公开内容"
      >
        <input
          className="input"
          autoFocus
          placeholder="输入至少两个字符"
          aria-label="搜索公开内容"
          maxLength={100}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q.trim().length < 2 ? (
          <p className="muted">输入关键词，寻找岗位、公司、面经和知识。</p>
        ) : hits.error ? (
          <p role="alert">{hits.error}</p>
        ) : hits.loading ? (
          <p role="status">正在搜索…</p>
        ) : hits.data?.items.length === 0 ? (
          <p>暂无匹配内容。</p>
        ) : (
          hits.data?.items.map((hit) => (
            <Link
              className="list-row"
              key={hit.type + hit.id}
              to={hit.href}
              onClick={() => setSearch(false)}
            >
              <span>{hit.title}</span>
              <small>{hit.subtitle}</small>
            </Link>
          ))
        )}
      </Modal>
    </div>
  );
}

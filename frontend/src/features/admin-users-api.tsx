import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../api/auth";
import type { components } from "../api/generated";
import { Button, Field, Modal, PageHeader, Panel } from "../components/ui";
type AdminUser = components["schemas"]["AdminUser"];
type PageResult = { data: AdminUser[]; page: components["schemas"]["Page"] };
const statusLabels: Record<string, string> = {
  PENDING: "待启用",
  ACTIVE: "正常",
  FROZEN: "已冻结",
  DELETING: "注销中",
  DISABLED: "已停用",
};
export function ApiAdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? ""),
    [status, setStatus] = useState(params.get("status") ?? "");
  const [result, setResult] = useState<PageResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<AdminUser | null>(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const page = Math.max(1, Number(params.get("page")) || 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError("");
    const query = new URLSearchParams(params);
    query.set("page", String(page));
    query.set("size", "20");
    fetch(`/api/v1/admin/users?${query}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message ?? "无法读取用户列表");
        return body as PageResult;
      })
      .then(setResult)
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(reason.message);
          setResult(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, page, revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const fields = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { version: editing.version };
    for (const key of [
      "displayName",
      "school",
      "education",
      "graduationYear",
      "status",
    ]) {
      const raw = fields.get(key);
      if (raw === null) continue;
      const value =
        key === "graduationYear"
          ? raw
            ? Number(raw)
            : null
          : key === "school" || key === "education"
            ? String(raw).trim() || null
            : String(raw).trim();
      if (value !== editing[key as keyof AdminUser]) body[key] = value;
    }
    if (Object.keys(body).length === 1) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/admin/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setMessage("用户资料已更新，操作已记录审计。");
      setRevision((v) => v + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      if (reason instanceof ApiError && reason.status === 409)
        setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title="用户管理"
        description="管理账号基础资料与状态，不查看用户简历、投递笔记或私人文件。"
      />
      <form
        className="row"
        style={{ flexWrap: "wrap" }}
        onSubmit={(event) => {
          event.preventDefault();
          const query = new URLSearchParams();
          if (q.trim()) query.set("q", q.trim());
          if (status) query.set("status", status);
          setParams(query);
        }}
      >
        <input
          className="input"
          aria-label="搜索用户"
          style={{ flex: "1 1 240px", minWidth: 0 }}
          placeholder="搜索邮箱或昵称"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
        />
        <select
          className="input"
          aria-label="用户状态"
          style={{ flex: "1 1 180px", minWidth: 0 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary">
          查询
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading ? (
        <p role="status">正在读取账号…</p>
      ) : result?.data.length ? (
        result.data.map((user) => (
          <Panel key={user.id}>
            <div className="between" style={{ gap: 16, flexWrap: "wrap" }}>
              <div>
                <h3>{user.displayName}</h3>
                <p>{user.email}</p>
                <p className="muted small">
                  {user.role === "ADMIN"
                    ? "管理员"
                    : user.role === "REVIEWER"
                      ? "审核员"
                      : "普通用户"}{" "}
                  · {statusLabels[user.status]} · {user.school ?? "未填写学校"}
                </p>
                <p className="muted small">账号 ID：{user.id}</p>
              </div>
              <Button
                disabled={user.role !== "USER"}
                onClick={() => {
                  setError("");
                  setEditing(user);
                }}
              >
                {user.role === "USER" ? "编辑用户" : "管理账号只读"}
              </Button>
            </div>
          </Panel>
        ))
      ) : (
        <Panel>
          <p>暂无符合条件的账号。</p>
        </Panel>
      )}
      {result && (
        <div className="row">
          <Button
            disabled={page <= 1 || loading}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page - 1));
              setParams(next);
            }}
          >
            上一页
          </Button>
          <span>
            第 {page} 页 · 共 {result.page.total} 人
          </span>
          <Button
            disabled={!result.page.hasMore || loading}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page + 1));
              setParams(next);
            }}
          >
            下一页
          </Button>
        </div>
      )}
      <Modal
        open={!!editing}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title="编辑用户基础资料"
        description="状态变化会撤销该用户已有登录会话；不能修改角色或密码。"
      >
        {editing && (
          <form onSubmit={save} className="stack">
            <p>{editing.email}</p>
            <Field label="昵称">
              <input
                className="input"
                name="displayName"
                defaultValue={editing.displayName}
                maxLength={40}
                required
                disabled={busy}
              />
            </Field>
            <Field label="学校">
              <input
                className="input"
                name="school"
                defaultValue={editing.school ?? ""}
                maxLength={100}
                disabled={busy}
              />
            </Field>
            <Field label="学历">
              <select
                className="input"
                name="education"
                defaultValue={editing.education ?? ""}
                disabled={busy}
              >
                <option value="">未填写</option>
                <option value="ASSOCIATE">专科</option>
                <option value="BACHELOR">本科</option>
                <option value="MASTER">硕士</option>
                <option value="DOCTORATE">博士</option>
              </select>
            </Field>
            <Field label="毕业年份">
              <input
                type="number"
                className="input"
                name="graduationYear"
                defaultValue={editing.graduationYear ?? ""}
                min={2000}
                max={2100}
                disabled={busy}
              />
            </Field>
            <Field label="账号状态">
              <select
                className="input"
                name="status"
                defaultValue={editing.status}
                disabled={
                  busy ||
                  !["ACTIVE", "FROZEN", "DISABLED"].includes(editing.status)
                }
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={!["ACTIVE", "FROZEN", "DISABLED"].includes(value)}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "正在保存…" : "保存用户信息"}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}

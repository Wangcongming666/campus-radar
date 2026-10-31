import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { components } from "../api/generated";
import { useAccount } from "../app/api-shell";
import { isManagementRole } from "../lib/access";
import { LoadState, useApi, useCommand } from "../components/api-ui";
import { createApplication, favoriteJob } from "../api/applications";
import { apiRequest } from "../api/auth";
import { Badge, Button, Field, PageHeader, Panel } from "../components/ui";
import "./jobs.css";

type Job = components["schemas"]["Job"];
type PageResult<T> = {
  data: T[];
  page: { page: number; size: number; total: number; hasMore: boolean };
};
const filterKeys = [
  "q",
  "city",
  "role",
  "education",
  "recruitmentType",
  "graduationYear",
  "status",
  "sort",
  "companyId",
] as const;
const educationLabels: Record<string, string> = {
  ANY: "学历不限",
  ASSOCIATE: "大专",
  BACHELOR: "本科",
  MASTER: "硕士",
  DOCTORATE: "博士",
  UNKNOWN: "学历未注明",
};
const statusLabels = {
  OPEN: "正在招聘",
  CLOSED: "已结束招聘",
  UNKNOWN: "招聘状态未注明",
};
const roleLabels: Record<string, string> = {
  frontend: "前端开发",
  backend: "后端开发",
  algorithm: "算法",
  product: "产品",
  design: "设计",
  test: "测试开发",
};

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("无法连接岗位服务，请检查网络后重试。");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error?.message ??
        (response.status === 404
          ? "岗位不存在或已下架。"
          : "岗位服务暂时不可用，请稍后重试。"),
    );
  return body as T;
}

function officialUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function salaryLabel(salary: Job["salary"]) {
  if (!salary) return "薪资未注明";
  if (salary.negotiable) return "薪资面议";
  const amount = (value: number | null) =>
    value === null ? "未注明" : `${(value / 100).toLocaleString("zh-CN")} 元`;
  return `${amount(salary.minMinor)} – ${amount(salary.maxMinor)} / ${{ MONTH: "月", YEAR: "年", DAY: "天" }[salary.period]}${salary.months ? ` · ${salary.months} 薪` : ""}`;
}
function deadlineLabel(job: Job) {
  if (job.deadlinePrecision === "DATE" && job.deadlineDate)
    return `截止日期 ${job.deadlineDate}`;
  if (job.deadlinePrecision === "EXACT" && job.deadlineAt)
    return `截止时间 ${new Date(job.deadlineAt).toLocaleString("zh-CN", { timeZone: job.sourceTimezone })}（${job.sourceTimezone}）`;
  return "截止时间未注明";
}

/** Read the account's persisted state once per page, including later pages and archived applications. */
function useJobActivity() {
  const account = useAccount();
  const [saved, setSaved] = useState<string[]>([]),
    [applied, setApplied] = useState<string[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSaved([]);
    setApplied([]);
    setError("");
    if (!account.user || isManagementRole(account.user.role)) {
      setLoading(false);
      return () => controller.abort();
    }
    async function all<T>(path: string) {
      const items: T[] = [];
      let page = 1;
      for (;;) {
        const response = await request<PageResult<T>>(
          `${path}&page=${page++}&size=100`,
          controller.signal,
        );
        items.push(...response.data);
        if (!response.page.hasMore) return items;
      }
    }
    setLoading(true);
    Promise.all([
      all<components["schemas"]["Favorite"]>("/api/v1/favorites?type=JOB"),
      all<components["schemas"]["Application"]>(
        "/api/v1/applications?archived=false",
      ),
      all<components["schemas"]["Application"]>(
        "/api/v1/applications?archived=true",
      ),
    ])
      .then(([favorites, active, archived]) => {
        setSaved(favorites.map((x) => x.targetId));
        setApplied([...active, ...archived].map((x) => x.job.id));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(`无法读取收藏和投递状态：${e.message}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [account.user?.id, revision]);
  return {
    saved,
    applied,
    loading,
    error,
    retry: () => setRevision((x) => x + 1),
    setSaved,
    setApplied,
  };
}
type Activity = ReturnType<typeof useJobActivity>;
function ActivityState({ activity }: { activity: Activity }) {
  return activity.error ? (
    <div role="alert">
      <p>{activity.error}</p>
      <Button onClick={activity.retry}>重新读取状态</Button>
    </div>
  ) : activity.loading ? (
    <p role="status">正在读取收藏和投递状态…</p>
  ) : null;
}

export function ApiJobsPage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? ""])),
  );
  const [result, setResult] = useState<PageResult<Job> | null>(null),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const activity = useJobActivity();
  const page = Math.max(1, Number(params.get("page")) || 1);
  useEffect(() => {
    setDraft(
      Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? ""])),
    );
  }, [params]);
  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({ page: String(page), size: "20" });
    for (const key of filterKeys) {
      const v = params.get(key);
      if (v) search.set(key, v);
    }
    setLoading(true);
    setError("");
    setResult(null);
    request<PageResult<Job>>(`/api/v1/jobs?${search}`, controller.signal)
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, page, revision]);
  function search(e: FormEvent) {
    e.preventDefault();
    if ([...draft.q.trim()].length === 1) {
      setError("搜索关键词至少为两个字符。");
      return;
    }
    const next = new URLSearchParams();
    for (const key of filterKeys)
      if (draft[key].trim()) next.set(key, draft[key].trim());
    setParams(next);
  }
  function reset() {
    setDraft(Object.fromEntries(filterKeys.map((key) => [key, ""])));
    setError("");
    setParams(new URLSearchParams());
  }
  function changePage(next: number) {
    const p = new URLSearchParams(params);
    p.set("page", String(next));
    setParams(p);
  }
  const input = (key: string) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((previous) => ({ ...previous, [key]: e.target.value })),
  });
  return (
    <div className="stack api-jobs">
      <PageHeader
        title="岗位广场"
        description="浏览已发布的招聘信息，按方向、城市和招聘条件找到适合你的机会。"
        actions={
          <Link className="button" to="/subscriptions">
            创建岗位订阅
          </Link>
        }
      />
      <form className="stack api-jobs-form" onSubmit={search}>
        <div className="api-jobs-search">
          <input
            className="input"
            aria-label="搜索岗位"
            placeholder="搜索岗位、公司或技能关键词"
            {...input("q")}
            maxLength={100}
          />
          <Button type="submit" variant="primary">
            搜索
          </Button>
          <Button type="button" onClick={reset}>
            重置筛选
          </Button>
        </div>
        <div className="api-job-filters">
          <Field label="工作城市">
            <input
              className="input"
              placeholder="不限城市"
              {...input("city")}
              maxLength={300}
            />
          </Field>
          <Field label="岗位方向">
            <input
              className="input"
              aria-label="岗位方向"
              placeholder="如 backend、frontend"
              {...input("role")}
              maxLength={200}
              list="api-job-roles"
            />
            <datalist id="api-job-roles">
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="招聘类型">
            <select
              className="input"
              aria-label="招聘类型"
              {...input("recruitmentType")}
            >
              <option value="">全部类型</option>
              <option value="CAMPUS">校园招聘</option>
              <option value="INTERNSHIP">实习招聘</option>
            </select>
          </Field>
          <Field label="学历要求">
            <select
              className="input"
              aria-label="学历要求"
              {...input("education")}
            >
              <option value="">全部学历</option>
              {Object.entries(educationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="毕业届别">
            <input
              className="input"
              type="number"
              min="2000"
              max="2100"
              placeholder="不限届别"
              {...input("graduationYear")}
            />
          </Field>
          <Field label="招聘状态">
            <select
              className="input"
              aria-label="招聘状态"
              {...input("status")}
            >
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="排序方式">
            <select className="input" aria-label="排序方式" {...input("sort")}>
              <option value="">最新发布</option>
              <option value="DEADLINE">截止时间优先</option>
            </select>
          </Field>
        </div>
        {params.get("companyId") && (
          <p className="muted">已限定当前公司。重置筛选可浏览全部公司。</p>
        )}
      </form>
      <ActivityState activity={activity} />
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRevision((x) => x + 1)}
      >
        {result && (
          <>
            <p className="muted" aria-live="polite">
              共 {result.page.total} 个岗位
            </p>
            {result.data.length === 0 && (
              <Panel>
                <p>暂无符合条件的岗位。</p>
                <Button onClick={reset}>清除筛选</Button>
              </Panel>
            )}
            <div className="job-list">
              {result.data.map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-card-main">
                    <div className="job-copy">
                      <h2 className="job-title">
                        <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                      </h2>
                      <p className="job-company">
                        <Link to={`/company/${job.companyId}`}>
                          {job.company.name}
                        </Link>
                      </p>
                    </div>
                    <span className="job-salary">
                      {salaryLabel(job.salary)}
                    </span>
                  </div>
                  <p className="job-meta">
                    {job.cities.join("、") || "城市未注明"} ·{" "}
                    {educationLabels[job.education]} ·{" "}
                    {job.recruitmentType === "CAMPUS" ? "校园招聘" : "实习招聘"}{" "}
                    · {statusLabels[job.status]}
                  </p>
                  <div className="job-card-bottom">
                    <div className="tag-list">
                      {job.skills?.map((skill) => (
                        <Badge key={skill}>{skill}</Badge>
                      ))}
                    </div>
                    <JobActions job={job} activity={activity} />
                  </div>
                  <p className="job-card-footer">{deadlineLabel(job)}</p>
                </article>
              ))}
            </div>
            <div className="row">
              <Button disabled={page <= 1} onClick={() => changePage(page - 1)}>
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button
                disabled={!result.page.hasMore}
                onClick={() => changePage(page + 1)}
              >
                下一页
              </Button>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}

export function ApiJobDetailPage() {
  const account = useAccount();
  const { id } = useParams();
  const remote = useApi<Job>(`/api/v1/jobs/${encodeURIComponent(id ?? "")}`);
  const activity = useJobActivity();
  const job = remote.data,
    url = job && officialUrl(job.canonicalUrl);
  return (
    <div className="stack api-jobs">
      <Link to="/jobs">← 返回岗位广场</Link>
      <LoadState {...remote} retry={remote.refresh}>
        {job && (
          <>
            <PageHeader
              title={job.title}
              description={job.company.name}
              actions={
                <Link className="button" to={`/company/${job.companyId}`}>
                  查看公司资料
                </Link>
              }
            />
            <Panel>
              <div className="job-detail-meta">
                <span>{job.cities.join("、") || "城市未注明"}</span>
                <span>{educationLabels[job.education]}</span>
                <span>
                  {job.recruitmentType === "CAMPUS" ? "校园招聘" : "实习招聘"}
                </span>
                <span>{statusLabels[job.status]}</span>
              </div>
              <p>
                {roleLabels[job.role] ?? job.role} ·{" "}
                {job.graduationYears?.length
                  ? job.graduationYears.join("、") + " 届"
                  : "毕业届别未注明"}
              </p>
              <p className="detail-salary">{salaryLabel(job.salary)}</p>
              <p className="muted">{deadlineLabel(job)}</p>
              <div className="tag-list">
                {job.skills?.map((skill) => (
                  <Badge key={skill}>{skill}</Badge>
                ))}
              </div>
            </Panel>
            <Panel title="岗位描述">
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {job.descriptionMd || "岗位描述未提供。"}
              </div>
            </Panel>
            <Panel title="招聘来源">
              <p>{job.source?.name ?? "来源未注明"}</p>
              {url && (
                <a
                  className="button"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看招聘来源
                </a>
              )}
            </Panel>
            <ActivityState activity={activity} />
            <JobActions job={job} activity={activity} />
            {!isManagementRole(account.user?.role) && (
              <JobMatch jobId={job.id} />
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}
function JobMatch({ jobId }: { jobId: string }) {
  const account = useAccount();
  const remote = useApi<components["schemas"]["MatchResult"]>(
    account.user?.role === "USER" ? `/api/v1/jobs/${jobId}/match` : null,
  );
  const labels: Record<string, string> = {
    "preferences.roles": "意向方向",
    "preferences.cities": "意向城市",
    "preferences.recruitmentTypes": "招聘类型偏好",
    graduationYear: "毕业届别",
    education: "学历",
  };
  return (
    <Panel title="与你的匹配情况">
      {!account.user ? (
        <Link to={`/login?returnTo=${encodeURIComponent(`/jobs/${jobId}`)}`}>
          登录后查看个人条件匹配
        </Link>
      ) : (
        <LoadState {...remote} retry={remote.refresh}>
          {remote.data && (
            <div className="stack">
              <p>
                {remote.data.score === null
                  ? "已知条件不足，暂不计算匹配度"
                  : `已知条件匹配度 ${remote.data.score.toFixed(0)}%`}{" "}
                · 信息覆盖率 {remote.data.coverage.toFixed(0)}%
              </p>
              <ul>
                {remote.data.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {remote.data.missingFields.length > 0 && (
                <p className="muted">
                  待补充或未注明：
                  {remote.data.missingFields
                    .map((key) => labels[key] ?? key)
                    .join("、")}
                </p>
              )}
              <Link to="/settings">完善求职偏好</Link>
            </div>
          )}
        </LoadState>
      )}
    </Panel>
  );
}
function JobActions({ job, activity }: { job: Job; activity: Activity }) {
  const account = useAccount(),
    command = useCommand();
  const [key] = useState(() => crypto.randomUUID());
  const saved = activity.saved.includes(job.id),
    applied = activity.applied.includes(job.id);
  if (account.loading) return null;
  if (isManagementRole(account.user?.role))
    return (
      <Link className="button" to="/admin">
        在管理后台维护岗位
      </Link>
    );
  if (!account.user)
    return (
      <Link
        className="button button-secondary"
        to={`/login?returnTo=${encodeURIComponent(`/jobs/${job.id}`)}`}
      >
        登录后收藏或加入投递
      </Link>
    );
  const disabled = command.busy || activity.loading || !!activity.error;
  return (
    <div className="stack">
      <div className="row">
        <Button
          disabled={disabled}
          onClick={() =>
            void command.run(async () => {
              if (saved)
                await apiRequest(`/api/v1/favorites/JOB/${job.id}`, {
                  method: "DELETE",
                });
              else await favoriteJob(job.id);
              activity.setSaved((previous) =>
                saved
                  ? previous.filter((id) => id !== job.id)
                  : [...previous, job.id],
              );
            })
          }
        >
          {saved ? "取消收藏" : "收藏岗位"}
        </Button>
        <Button
          variant="primary"
          disabled={disabled || applied || job.status === "CLOSED"}
          onClick={() =>
            void command.run(async () => {
              await createApplication(job.id, key);
              activity.setApplied((previous) => [...previous, job.id]);
            })
          }
        >
          {applied
            ? "已加入投递"
            : job.status === "CLOSED"
              ? "招聘已结束"
              : "加入投递"}
        </Button>
        {applied && (
          <Link to="/pipeline" className="link">
            前往投递看板
          </Link>
        )}
      </div>
      {command.error && <p role="alert">{command.error}</p>}
    </div>
  );
}

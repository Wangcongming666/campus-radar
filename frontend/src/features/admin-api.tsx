import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Modal, PageHeader, Panel } from "../components/ui";
import {
  apiRequest as request,
  ApiError,
  type CurrentAccount,
} from "../api/auth";
import type { components } from "../api/generated";
import "./account.css";
import { useAccount } from "../app/api-shell";
import { startVisiblePolling } from "./social-visible-polling";
import {
  ModerationSyncNotice,
  moderationTypes,
  useModerationCount,
} from "./admin-moderation-sync";

type Resource =
  | "companies"
  | "jobs"
  | "questions"
  | "chapters"
  | "signals"
  | "sources"
  | "experiences";
type Tab =
  Resource | "moderation" | "reports" | "audit-logs" | "providers" | "comments";
type Row = Record<string, unknown> & { id: string; version: number };
type Result = { data: Row[]; page: components["schemas"]["Page"] };
type ModerationDetail = { item: Row; content: Record<string, unknown> };
type FieldSpec = {
  key: string;
  label: string;
  type?:
    | "textarea"
    | "number"
    | "date"
    | "datetime-local"
    | "checkbox"
    | "list"
    | "numbers"
    | "select"
    | "multiselect"
    | "url";
  nullable?: boolean;
  options?: [string, string][];
  max?: number;
  min?: number;
  required?: boolean;
};
const labels: Record<Tab, string> = {
  companies: "公司资料",
  jobs: "岗位录入",
  questions: "题库",
  chapters: "宝典章节",
  signals: "公司情报",
  sources: "内容来源",
  experiences: "面经维护",
  moderation: "内容审核",
  comments: "评论管理",
  reports: "举报处理",
  "audit-logs": "管理审计",
  providers: "提供者核验",
};
const resources: Resource[] = [
  "companies",
  "jobs",
  "questions",
  "chapters",
  "signals",
  "sources",
  "experiences",
];
const choices = (...values: string[]): [string, string][] =>
  values.map((value) => [value, value]);
const education: [string, string][] = [
  ["ANY", "不限"],
  ["ASSOCIATE", "专科"],
  ["BACHELOR", "本科"],
  ["MASTER", "硕士"],
  ["DOCTORATE", "博士"],
  ["UNKNOWN", "未知"],
];
async function list(
  tab: Exclude<Tab, "providers">,
  page: number,
  signal?: AbortSignal,
  size = 20,
  type = "",
): Promise<Result> {
  const response = await fetch(
    `/api/v1/admin/${tab}?page=${page}&size=${size}${tab === "moderation" && type ? `&type=${encodeURIComponent(type)}` : ""}`,
    { credentials: "same-origin", cache: "no-store", signal },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "无法加载管理记录。",
    );
  return body as Result;
}
function inputFields(
  resource: Resource,
  references: Partial<Record<Resource, Row[]>>,
  editing?: Row | null,
): FieldSpec[] {
  const companies = (references.companies ?? []).map(
    (row) => [row.id, String(row.name)] as [string, string],
  );
  const chapters = (references.chapters ?? [])
    .filter((row) => row.id !== editing?.id)
    .map((row) => [row.id, String(row.title)] as [string, string]);
  const sources = (references.sources ?? []).map(
    (row) => [row.id, String(row.name)] as [string, string],
  );
  switch (resource) {
    case "companies":
      return [
        {
          key: "slug",
          label: "网址标识（小写字母、数字或连字符）",
          max: 80,
          required: true,
        },
        { key: "name", label: "公司名称", max: 120, required: true },
        {
          key: "logoUrl",
          label: "标志图片链接",
          type: "url",
          nullable: true,
          max: 2000,
        },
        { key: "industry", label: "行业", nullable: true, max: 80 },
        { key: "sizeBand", label: "规模", nullable: true, max: 40 },
        { key: "cities", label: "城市（逗号分隔）", type: "list" },
        { key: "tags", label: "标签（逗号分隔）", type: "list" },
        {
          key: "descriptionMd",
          label: "公司介绍",
          type: "textarea",
          max: 20000,
        },
      ];
    case "sources":
      return [
        { key: "name", label: "来源名称", max: 120, required: true },
        {
          key: "baseUrl",
          label: "来源网站",
          type: "url",
          max: 2000,
          required: true,
        },
        {
          key: "contentMode",
          label: "允许收录范围",
          type: "select",
          options: [
            ["METADATA_LINK", "仅元信息与链接"],
            ["AUTHORIZED_FULL", "已获全文授权"],
            ["ORIGINAL", "原创内容"],
          ],
        },
        {
          key: "permissionNote",
          label: "许可依据与范围",
          type: "textarea",
          max: 2000,
          required: true,
        },
        {
          key: "enabled",
          label: "启用来源（停用后相关岗位不对公众展示）",
          type: "checkbox",
        },
      ];
    case "jobs":
      return [
        {
          key: "companyId",
          label: "公司",
          type: "select",
          options: companies,
          required: true,
        },
        ...(!editing
          ? [
              {
                key: "sourceId",
                label: "内容来源",
                type: "select" as const,
                options: sources,
                required: true,
              },
            ]
          : []),
        { key: "title", label: "岗位名称", max: 200, required: true },
        { key: "role", label: "岗位方向", max: 40 },
        { key: "cities", label: "工作城市（逗号分隔）", type: "list" },
        {
          key: "education",
          label: "学历要求",
          type: "select",
          options: education,
        },
        {
          key: "recruitmentType",
          label: "招聘类型",
          type: "select",
          options: [
            ["CAMPUS", "校招"],
            ["INTERNSHIP", "实习"],
          ],
        },
        {
          key: "graduationYears",
          label: "毕业年份（逗号分隔，可留空）",
          type: "numbers",
        },
        { key: "skills", label: "技能要求（逗号分隔）", type: "list" },
        {
          key: "descriptionMd",
          label: "岗位描述",
          type: "textarea",
          max: 100000,
        },
        {
          key: "canonicalUrl",
          label: "招聘原文链接",
          type: "url",
          max: 2000,
          required: true,
        },
        {
          key: "deadlinePrecision",
          label: "截止日期精度",
          type: "select",
          options: [
            ["UNKNOWN", "未知"],
            ["DATE", "仅日期"],
            ["EXACT", "精确时间"],
          ],
        },
        {
          key: "deadlineAt",
          label: "精确截止时间（本机时区，仅精确时间时使用）",
          type: "datetime-local",
          nullable: true,
        },
        {
          key: "deadlineDate",
          label: "截止日期（仅日期时使用）",
          type: "date",
          nullable: true,
        },
        { key: "sourceTimezone", label: "来源时区", max: 64, required: true },
        {
          key: "status",
          label: "招聘状态",
          type: "select",
          options: [
            ["OPEN", "在招"],
            ["CLOSED", "关闭"],
            ["UNKNOWN", "未知"],
          ],
        },
      ];
    case "experiences":
      return [
        {
          key: "companyId",
          label: "相关公司",
          type: "select",
          options: companies,
          nullable: true,
        },
        { key: "title", label: "面经标题", required: true, max: 200 },
        { key: "summary", label: "内容摘要", type: "textarea", max: 1000 },
        {
          key: "bodyMd",
          label: "面经正文",
          type: "textarea",
          required: true,
          max: 100000,
        },
        { key: "role", label: "岗位方向", max: 40 },
        { key: "roundType", label: "面试轮次", max: 40 },
        {
          key: "occurredOn",
          label: "面试日期（未知可留空）",
          type: "date",
          nullable: true,
        },
        { key: "tags", label: "标签（逗号分隔）", type: "list" },
        {
          key: "contentMode",
          label: "内容范围",
          type: "select",
          options: [
            ["ORIGINAL", "原创整理"],
            ["AUTHORIZED_FULL", "授权全文"],
            ["EXCERPT_LINK", "摘录与链接"],
          ],
        },
        {
          key: "sourceUrl",
          label: "来源链接",
          type: "url",
          nullable: true,
          max: 2000,
        },
        {
          key: "licenseNote",
          label: "来源与使用许可说明",
          type: "textarea",
          max: 1000,
        },
      ];
    case "questions":
      return [
        { key: "title", label: "题目名称", max: 200, required: true },
        { key: "promptMd", label: "题目正文", type: "textarea", max: 20000 },
        { key: "answerMd", label: "参考答案", type: "textarea", max: 20000 },
        { key: "role", label: "方向", max: 40 },
        {
          key: "difficulty",
          label: "难度",
          type: "select",
          options: [
            ["EASY", "基础"],
            ["MEDIUM", "进阶"],
            ["HARD", "困难"],
          ],
        },
        { key: "tags", label: "标签（逗号分隔）", type: "list" },
        {
          key: "companyIds",
          label: "相关公司（可多选）",
          type: "multiselect",
          options: companies,
        },
        {
          key: "chapterId",
          label: "相关宝典章节",
          type: "select",
          options: chapters,
          nullable: true,
        },
      ];
    case "chapters":
      return [
        {
          key: "parentId",
          label: "上级章节",
          type: "select",
          options: chapters,
          nullable: true,
        },
        { key: "slug", label: "网址标识", max: 100, required: true },
        { key: "title", label: "章节标题", max: 200, required: true },
        { key: "direction", label: "求职方向", max: 40 },
        {
          key: "sortOrder",
          label: "排序（从0开始）",
          type: "number",
          min: 0,
          max: 2147483647,
        },
        { key: "bodyMd", label: "章节正文", type: "textarea", max: 100000 },
      ];
    case "signals":
      return [
        {
          key: "companyId",
          label: "公司",
          type: "select",
          options: companies,
          required: true,
        },
        { key: "title", label: "情报标题", max: 200, required: true },
        { key: "body", label: "情报内容", type: "textarea", max: 5000 },
        {
          key: "kind",
          label: "情报类型",
          type: "select",
          options: [
            ["RECRUITING", "招聘"],
            ["INTERVIEW", "面试"],
            ["OFFER", "Offer"],
            ["NOTICE", "公告"],
          ],
        },
        {
          key: "sourceUrl",
          label: "来源链接",
          type: "url",
          max: 2000,
          required: true,
        },
        {
          key: "occurredAt",
          label: "发生时间（本机时区）",
          type: "datetime-local",
          required: true,
        },
      ];
  }
}
function localDatetime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function valueFor(row: Row | null, field: FieldSpec) {
  const value = row?.[field.key];
  if (Array.isArray(value))
    return field.type === "multiselect" ? value.map(String) : value.join("，");
  if (field.type === "datetime-local") return localDatetime(value);
  return value == null
    ? field.key === "sourceTimezone"
      ? "Asia/Shanghai"
      : field.type === "number"
        ? 0
        : ""
    : String(value);
}
function ContentForm({
  resource,
  row,
  references,
  busy,
  onSubmit,
}: {
  resource: Resource;
  row: Row | null;
  references: Partial<Record<Resource, Row[]>>;
  busy: boolean;
  onSubmit(body: Record<string, unknown>): Promise<void>;
}) {
  const fields = inputFields(resource, references, row);
  const salary = row?.salary as
    components["schemas"]["MoneyRange"] | null | undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = String(data.get(field.key) ?? "");
      body[field.key] =
        field.type === "checkbox"
          ? data.get(field.key) === "on"
          : field.type === "multiselect"
            ? data.getAll(field.key).map(String)
            : field.type === "list" || field.type === "numbers"
              ? raw
                  .split(/[,，\n]/)
                  .map((v) => v.trim())
                  .filter(Boolean)
                  .map((v) => (field.type === "numbers" ? Number(v) : v))
              : field.type === "number"
                ? Number(raw)
                : field.type === "datetime-local"
                  ? raw
                    ? new Date(raw).toISOString()
                    : null
                  : field.nullable && !raw
                    ? null
                    : raw;
    }
    if (resource === "jobs") {
      body.deadlineAt =
        body.deadlinePrecision === "EXACT" ? body.deadlineAt : null;
      body.deadlineDate =
        body.deadlinePrecision === "DATE" ? body.deadlineDate : null;
      body.salary =
        data.get("salaryKnown") === "on"
          ? {
              currency: "CNY",
              period: data.get("salaryPeriod"),
              minMinor: data.get("salaryMin")
                ? Math.round(Number(data.get("salaryMin")) * 100)
                : null,
              maxMinor: data.get("salaryMax")
                ? Math.round(Number(data.get("salaryMax")) * 100)
                : null,
              months: data.get("salaryMonths")
                ? Number(data.get("salaryMonths"))
                : null,
              negotiable: data.get("salaryNegotiable") === "on",
            }
          : null;
    }
    if (row) body.version = row.version;
    await onSubmit(body);
  }
  return (
    <form className="stack" onSubmit={submit}>
      <fieldset
        disabled={busy}
        style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 18 }}
      >
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            {field.type === "checkbox" ? (
              <input
                name={field.key}
                type="checkbox"
                defaultChecked={row?.[field.key] === true}
              />
            ) : field.type === "select" || field.type === "multiselect" ? (
              <select
                className="input"
                name={field.key}
                multiple={field.type === "multiselect"}
                defaultValue={valueFor(row, field)}
                required={field.required}
              >
                {field.type === "select" &&
                  (field.nullable || field.required) && (
                    <option value="">
                      {field.nullable ? "不关联" : "请选择"}
                    </option>
                  )}
                {field.options?.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                className="input"
                name={field.key}
                defaultValue={String(valueFor(row, field))}
                rows={5}
                maxLength={field.max}
                required={field.required}
              />
            ) : (
              <input
                className="input"
                name={field.key}
                type={
                  field.type === "list" || field.type === "numbers"
                    ? "text"
                    : (field.type ?? "text")
                }
                defaultValue={String(valueFor(row, field))}
                maxLength={field.type !== "number" ? field.max : undefined}
                max={field.type === "number" ? field.max : undefined}
                min={field.min}
                required={field.required}
              />
            )}
          </Field>
        ))}
        {resource === "jobs" && (
          <fieldset style={{ padding: 16, border: "1px solid var(--border)" }}>
            <legend>薪资信息</legend>
            <label>
              <input
                type="checkbox"
                name="salaryKnown"
                defaultChecked={!!salary}
              />{" "}
              已提供薪资（未知时不要勾选）
            </label>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <Field label="计薪周期">
                <select
                  name="salaryPeriod"
                  className="input"
                  defaultValue={salary?.period ?? "MONTH"}
                >
                  <option value="MONTH">月</option>
                  <option value="YEAR">年</option>
                  <option value="DAY">日</option>
                </select>
              </Field>
              <Field label="下限（元，可留空）">
                <input
                  name="salaryMin"
                  className="input"
                  type="number"
                  min={0}
                  max={10000000000}
                  step="0.01"
                  defaultValue={
                    salary?.minMinor == null ? "" : salary.minMinor / 100
                  }
                />
              </Field>
              <Field label="上限（元，可留空）">
                <input
                  name="salaryMax"
                  className="input"
                  type="number"
                  min={0}
                  max={10000000000}
                  step="0.01"
                  defaultValue={
                    salary?.maxMinor == null ? "" : salary.maxMinor / 100
                  }
                />
              </Field>
              <Field label="薪资月数（可留空）">
                <input
                  name="salaryMonths"
                  className="input"
                  type="number"
                  min={1}
                  max={24}
                  step="0.01"
                  defaultValue={salary?.months ?? ""}
                />
              </Field>
              <label>
                <input
                  name="salaryNegotiable"
                  type="checkbox"
                  defaultChecked={salary?.negotiable ?? false}
                />{" "}
                可面议
              </label>
            </div>
          </fieldset>
        )}
        <p className="muted small">
          {resource === "companies" || resource === "sources"
            ? "资料维护将追加管理审计。"
            : "保存后进入待审核状态；内容通过审核后才对公众展示。"}
        </p>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "正在保存…" : row ? "保存修改" : "创建记录"}
        </Button>
      </fieldset>
    </form>
  );
}
async function allReferences(resource: Resource) {
  const data: Row[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await list(resource, page, undefined, 100);
    data.push(...result.data);
    if (!result.page.hasMore) break;
  }
  return data;
}
const detailLabels: Record<string, string> = {
  id: "记录ID",
  version: "版本",
  createdAt: "创建时间",
  updatedAt: "更新时间",
  title: "标题",
  name: "名称",
  bodyMd: "正文",
  body: "正文",
  description: "描述",
  summary: "摘要",
  promptMd: "题目",
  answerMd: "参考答案",
  role: "方向",
  roundType: "面试轮次",
  occurredOn: "发生日期",
  occurredAt: "发生时间",
  tags: "标签",
  authorId: "作者ID",
  status: "状态",
  companyId: "公司ID",
  companyIds: "关联公司ID",
  chapterId: "章节ID",
  company: "公司信息",
  source: "来源",
  sourceUrl: "来源链接",
  contentMode: "内容范围",
  licenseNote: "许可说明",
  slug: "网址标识",
  parentId: "上级ID",
  direction: "方向",
  sortOrder: "排序",
  contentVersion: "正文版本",
  kind: "类型",
  confidence: "可信度",
  verifiedAt: "核验时间",
  difficulty: "难度",
  likeCount: "点赞数量",
  commentCount: "公开评论数量",
  likedByMe: "当前账号已点赞",
  jobId: "岗位ID",
  providerId: "提供者ID",
  providerVerified: "提供者当前认证有效",
  expiresAt: "到期时间",
  city: "城市",
  cities: "城市",
  year: "年份",
  baseMonthlyMinor: "基本月薪（分）",
  salaryMonths: "薪资月数",
  bonusMinor: "奖金（分）",
  sourceNote: "信息依据",
  verification: "核验状态",
  education: "学历",
  recruitmentType: "招聘类型",
  graduationYears: "毕业年份",
  skills: "技能",
  salary: "薪资范围",
  canonicalUrl: "原文链接",
  deadlineAt: "截止时间",
  deadlineDate: "截止日期",
  deadlinePrecision: "截止日期精度",
  sourceTimezone: "来源时区",
  publishedAt: "发布时间",
  collectedAt: "录入时间",
  currency: "币种",
  period: "周期",
  minMinor: "下限（分）",
  maxMinor: "上限（分）",
  months: "薪资月数",
  negotiable: "可面议",
  logoUrl: "标志链接",
  industry: "行业",
  sizeBand: "规模",
  descriptionMd: "介绍",
  url: "来源链接",
};
function ContentInspection({ content }: { content: Record<string, unknown> }) {
  return (
    <dl>
      {Object.entries(content).map(([key, value]) => (
        <div key={key} style={{ marginTop: 12 }}>
          <dt className="muted small">{detailLabels[key] ?? key}</dt>
          <dd
            style={{
              margin: "4px 0 0",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {value == null ? (
              "未提供"
            ) : typeof value === "boolean" ? (
              value ? (
                "是"
              ) : (
                "否"
              )
            ) : Array.isArray(value) ? (
              value.join("、") || "无"
            ) : typeof value === "object" ? (
              <ContentInspection content={value as Record<string, unknown>} />
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function ApiAdminPage() {
  const { user } = useAccount();
  return user ? (
    <AdminContent key={`${user.id}:${user.role}`} account={user} />
  ) : null;
}
function AdminContent({ account }: { account: CurrentAccount }) {
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const active = new AbortController();
    lifetime.current = active;
    return () => active.abort();
  }, []);
  async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const signal = options.signal ?? lifetime.current.signal;
    const result = await request<T>(path, { ...options, signal });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return result;
  }
  const pending = useModerationCount(account.id);
  const [moderationType, setModerationType] = useState("");
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<Tab>("moderation");
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Result["page"] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{
    resource: Resource;
    row: Row | null;
  } | null>(null);
  const [references, setReferences] = useState<
    Partial<Record<Resource, Row[]>>
  >({});
  const [decision, setDecision] = useState<{
    row: Row;
    report: boolean;
    content?: Record<string, unknown>;
  } | null>(null);
  const [commentRemoval, setCommentRemoval] = useState<Row | null>(null);
  const [commentReason, setCommentReason] = useState("");
  const [deletion, setDeletion] = useState<{
    resource: Resource;
    row: Row;
  } | null>(null);
  const operation = useRef({ payload: "", key: crypto.randomUUID() });
  const admin = account?.role === "ADMIN";
  const allowed = admin || account?.role === "REVIEWER";
  const readGeneration = useRef(0);
  async function refresh(signal?: AbortSignal) {
    const generation = ++readGeneration.current;
    if (tab === "providers") {
      setRows([]);
      setPagination(null);
      return;
    }
    const activeSignal = signal ?? lifetime.current.signal;
    try {
      const result = await list(tab, page, activeSignal, 20, moderationType);
      if (
        activeSignal.aborted ||
        lifetime.current.signal.aborted ||
        generation !== readGeneration.current
      )
        return false;
      setRows(result.data);
      setPagination(result.page);
      return true;
    } catch (reason) {
      if (
        activeSignal.aborted ||
        lifetime.current.signal.aborted ||
        generation !== readGeneration.current
      )
        return false;
      throw reason;
    }
  }
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    refresh(controller.signal)
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setPagination(null);
          setError(reason instanceof Error ? reason.message : "加载失败。");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, allowed, moderationType, reload]);
  useEffect(() => {
    if (
      !allowed ||
      loading ||
      !["moderation", "comments"].includes(tab) ||
      busy ||
      editor ||
      decision ||
      commentRemoval ||
      deletion
    )
      return;
    let controller: AbortController | null = null;
    const read = () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      const active = controller;
      void refresh(active.signal)
        .then((applied) => {
          if (applied && !active.signal.aborted) setError("");
        })
        .catch((reason) => {
          if (!active.signal.aborted) {
            setRows([]);
            setPagination(null);
            setError(
              reason instanceof Error ? reason.message : "审核列表暂未同步。",
            );
          }
        });
    };
    const stop = startVisiblePolling(read);
    window.addEventListener("focus", read);
    return () => {
      controller?.abort();
      stop();
      window.removeEventListener("focus", read);
    };
  }, [
    allowed,
    tab,
    page,
    moderationType,
    busy,
    editor,
    decision,
    commentRemoval,
    deletion,
    reload,
    loading,
  ]);
  function syncModeration() {
    if (busy) return;
    pending.refresh();
    setReload((value) => value + 1);
  }
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      pending.refresh();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
      if (reason instanceof ApiError && reason.status === 409)
        await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function openEditor(resource: Resource, row: Row | null) {
    setError("");
    try {
      const keys: Resource[] =
        resource === "jobs"
          ? ["companies", "sources"]
          : resource === "questions"
            ? ["companies", "chapters"]
            : resource === "chapters"
              ? ["chapters"]
              : ["signals", "experiences"].includes(resource)
                ? ["companies"]
                : [];
      const records = await Promise.all(
        keys.map(async (key) => [key, await allReferences(key)] as const),
      );
      setReferences(Object.fromEntries(records));
      operation.current = { payload: "", key: crypto.randomUUID() };
      setEditor({ resource, row });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取关联资料。");
    }
  }
  async function openReview(type: string, id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const detail = await apiRequest<ModerationDetail>(
        `/api/v1/admin/moderation/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      );
      operation.current = { payload: "", key: crypto.randomUUID() };
      setDecision({ row: detail.item, report: false, content: detail.content });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取审核详情。");
    } finally {
      setBusy(false);
    }
  }
  function idempotency(body: unknown) {
    const payload = JSON.stringify(body);
    if (operation.current.payload && operation.current.payload !== payload)
      operation.current.key = crypto.randomUUID();
    operation.current.payload = payload;
    return operation.current.key;
  }
  async function save(body: Record<string, unknown>) {
    if (!editor) return;
    const target = editor;
    await act(async () => {
      await apiRequest(
        `/api/v1/admin/${target.resource}${target.row ? `/${target.row.id}` : ""}`,
        {
          method: target.row ? "PATCH" : "POST",
          headers: target.row ? {} : { "Idempotency-Key": idempotency(body) },
          body: JSON.stringify(body),
        },
      );
      setEditor(null);
      setMessage("内容已保存，管理操作已记录。");
    });
  }
  async function removeCatalog() {
    if (!deletion) return;
    const target = deletion;
    await act(async () => {
      try {
        await apiRequest(
          `/api/v1/admin/${target.resource}/${encodeURIComponent(target.row.id)}?version=${target.row.version}`,
          { method: "DELETE" },
        );
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 409)
          setDeletion(null);
        throw reason;
      }
      setDeletion(null);
      setMessage(
        `“${String(target.row.title ?? target.row.name ?? target.row.id)}”已删除，管理操作已记录。`,
      );
    });
  }
  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    const data = new FormData(event.currentTarget);
    const target = decision;
    const body = {
      version: target.row.version,
      reason: String(data.get("reason")),
      ...(target.report
        ? { state: data.get("decision") }
        : { decision: data.get("decision") }),
    };
    await act(async () => {
      await apiRequest(
        target.report
          ? `/api/v1/admin/reports/${target.row.id}`
          : `/api/v1/admin/moderation/${target.row.type}/${target.row.id}/decisions`,
        {
          method: target.report ? "PATCH" : "POST",
          headers: target.report
            ? {}
            : { "Idempotency-Key": idempotency(body) },
          body: JSON.stringify(body),
        },
      );
      setDecision(null);
      setMessage("处理结果与原因已记录。");
    });
  }
  async function certify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const verified = data.get("verified") === "on";
    const until = String(data.get("validUntil") ?? "");
    await act(async () => {
      await apiRequest(
        `/api/v1/admin/users/${encodeURIComponent(String(data.get("userId")))}/provider-certification`,
        {
          method: "PUT",
          body: JSON.stringify({
            version: Number(data.get("version")),
            verified,
            validUntil:
              verified && until ? new Date(until).toISOString() : null,
            evidenceNote: data.get("evidenceNote"),
          }),
        },
      );
      form.reset();
      setMessage("提供者认证已更新。此操作不会授予管理角色。");
    });
  }
  if (!account)
    return (
      <div className="stack">
        <PageHeader
          title="内容管理"
          description="审核公开内容与维护人工信息来源。"
        />
        {loading ? (
          <p role="status">正在确认管理权限…</p>
        ) : (
          <>
            <p role="alert">{error || "请先登录。"}</p>
            <Link className="button" to="/login?returnTo=%2Fadmin">
              登录账号
            </Link>
          </>
        )}
      </div>
    );
  if (!allowed)
    return (
      <div className="stack">
        <PageHeader
          title="内容管理"
          description="此页面需要审核员或管理员权限。"
        />
        <p role="alert">当前账号无管理权限。</p>
        <Link to="/me">返回个人中心</Link>
      </div>
    );
  const visibleTabs: Tab[] = [
    "moderation",
    "reports",
    ...resources.filter((resource) => resource !== "sources" || admin),
    ...(admin ? (["comments", "audit-logs", "providers"] as Tab[]) : []),
  ];
  return (
    <div className="stack">
      <PageHeader
        title="内容管理"
        description={
          admin
            ? "维护真实内容来源、人工录入与审核记录。"
            : "处理公开内容审核与举报，不访问用户私有附件。"
        }
        actions={
          admin ? (
            <Link className="button" to="/admin/services">
              服务与任务
            </Link>
          ) : undefined
        }
      />
      <ModerationSyncNotice
        busy={busy}
        state={pending}
        onOpen={() => {
          if (busy) return;
          setTab("moderation");
          setPage(1);
          setModerationType("");
          setReload((v) => v + 1);
        }}
        onRefresh={syncModeration}
      />
      <nav className="row" aria-label="管理模块" style={{ flexWrap: "wrap" }}>
        {visibleTabs.map((value) => (
          <Button
            key={value}
            size="sm"
            disabled={busy}
            variant={tab === value ? "primary" : "secondary"}
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setPage(1);
              setMessage("");
            }}
          >
            {labels[value]}
            {value === "moderation" && pending.total !== null
              ? ` · ${pending.total}`
              : ""}
          </Button>
        ))}
      </nav>
      {error && !editor && !decision && !commentRemoval && !deletion && (
        <p role="alert">{error}</p>
      )}
      {message && <p role="status">{message}</p>}
      {tab === "providers" ? (
        <Panel title="内推提供者核验">
          <p className="muted small">
            核对真实材料后填入目标账号ID与当前资料版本。认证必须设置未来有效期；撤销会立即影响内推可见性。
          </p>
          <form className="stack" onSubmit={certify}>
            <Field label="目标账号ID">
              <input
                name="userId"
                className="input"
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                disabled={busy}
              />
            </Field>
            <Field label="账号资料当前版本">
              <input
                name="version"
                className="input"
                type="number"
                min={1}
                required
                disabled={busy}
              />
            </Field>
            <label>
              <input name="verified" type="checkbox" disabled={busy} />{" "}
              认证为内推提供者（不勾选即撤销）
            </label>
            <Field label="认证有效期（本机时区）">
              <input
                name="validUntil"
                className="input"
                type="datetime-local"
                disabled={busy}
              />
            </Field>
            <Field label="核验依据或撤销原因">
              <textarea
                name="evidenceNote"
                className="input"
                required
                minLength={1}
                maxLength={2000}
                rows={4}
                disabled={busy}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              保存核验结果
            </Button>
          </form>
        </Panel>
      ) : (
        <>
          <div className="between">
            <h2>{labels[tab]}</h2>
            {admin && resources.includes(tab as Resource) && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => openEditor(tab as Resource, null)}
              >
                新增{labels[tab]}
              </Button>
            )}
          </div>
          {tab === "moderation" && (
            <div className="admin-moderation-filter">
              <Field label="审核内容类型">
                <select
                  className="input"
                  value={moderationType}
                  disabled={busy}
                  onChange={(event) => {
                    setModerationType(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">全部待审核内容</option>
                  {Object.entries(moderationTypes).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <p>
                这里只展示待审核记录；新内容会自动同步，审核弹窗内的输入会保留。
              </p>
            </div>
          )}
          {tab === "comments" && (
            <p className="muted">
              评论和回复直接发布，无需审核。这里可删除违规评论；撤回或删除后正文清空，回复关系保留。
            </p>
          )}
          {loading ? (
            <p role="status">正在加载记录…</p>
          ) : rows.length === 0 ? (
            <Panel>
              <p>
                暂无记录。
                {resources.includes(tab as Resource) && admin
                  ? "可从新增录入真实资料。"
                  : ""}
              </p>
            </Panel>
          ) : (
            <div
              className={
                tab === "comments" ? "stack admin-comment-list" : "stack"
              }
            >
              {rows.map((row) => (
                <Panel key={`${row.type ?? tab}:${row.id}`}>
                  <div className="between">
                    <div style={{ minWidth: 0 }}>
                      {["moderation", "comments"].includes(tab) && (
                        <p className="admin-review-kind">
                          {moderationTypes[
                            String(row.type) as keyof typeof moderationTypes
                          ] ??
                            (row.type === "POST_COMMENT"
                              ? "社区评论与回复"
                              : row.type === "EXPERIENCE_COMMENT"
                                ? "面经评论与回复"
                                : "待审核内容")}
                        </p>
                      )}
                      <h3>
                        {String(
                          row.title ??
                            row.name ??
                            row.action ??
                            row.reason ??
                            row.id,
                        )}
                      </h3>
                      <p
                        className="muted small"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        ID {row.id} · 版本 {row.version}
                        {row.type ? ` · ${String(row.type)}` : ""}
                        {row.status || row.state
                          ? ` · ${String(row.status ?? row.state)}`
                          : ""}
                      </p>
                      {tab === "reports" && (
                        <p>
                          {String(row.targetType)} · {String(row.targetId)}
                        </p>
                      )}
                      {tab === "audit-logs" && (
                        <p className="muted small">
                          {String(row.reason)} · {String(row.createdAt)} · 请求{" "}
                          {String(row.requestId)}
                        </p>
                      )}
                      {tab === "sources" && (
                        <p>
                          {String(row.contentMode)} ·{" "}
                          {row.enabled ? "已启用" : "停用"}
                        </p>
                      )}
                    </div>
                    <div className="row">
                      {admin &&
                        resources.includes(tab as Resource) &&
                        (tab !== "experiences" || row.authorId == null) && (
                          <>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => openEditor(tab as Resource, row)}
                            >
                              查看与编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              onClick={() => {
                                setError("");
                                setMessage("");
                                setDeletion({ resource: tab as Resource, row });
                              }}
                            >
                              删除
                            </Button>
                          </>
                        )}
                      {tab === "comments" && admin && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy || !row.body}
                          onClick={() => {
                            setError("");
                            setCommentReason("");
                            setCommentRemoval(row);
                          }}
                        >
                          删除评论
                        </Button>
                      )}
                      {tab === "moderation" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => openReview(String(row.type), row.id)}
                        >
                          审核
                        </Button>
                      )}
                      {tab === "reports" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            openReview(
                              String(row.targetType),
                              String(row.targetId),
                            )
                          }
                        >
                          查看被举报内容
                        </Button>
                      )}
                      {resources.includes(tab as Resource) &&
                        !["companies", "sources"].includes(tab) && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              openReview(
                                (
                                  {
                                    jobs: "JOB",
                                    questions: "QUESTION",
                                    chapters: "CHAPTER",
                                    signals: "SIGNAL",
                                    experiences: "EXPERIENCE",
                                  } as Record<string, string>
                                )[tab],
                                row.id,
                              )
                            }
                          >
                            查看审核状态
                          </Button>
                        )}
                      {tab === "reports" && row.state === "OPEN" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => setDecision({ row, report: true })}
                        >
                          处理举报
                        </Button>
                      )}
                    </div>
                  </div>
                  {!admin && resources.includes(tab as Resource) && (
                    <details style={{ marginTop: 16 }}>
                      <summary>查看内容</summary>
                      {inputFields(tab as Resource, {})
                        .filter((field) => field.type !== "checkbox")
                        .map((field) => (
                          <div key={field.key} style={{ marginTop: 12 }}>
                            <strong>{field.label}</strong>
                            <p
                              style={{
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {String(valueFor(row, field)) || "未填写"}
                            </p>
                          </div>
                        ))}
                    </details>
                  )}
                </Panel>
              ))}
            </div>
          )}
          {pagination && (
            <div className="row">
              <Button
                disabled={loading || busy || page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                上一页
              </Button>
              <span>
                第 {page} 页 · 共 {pagination.total} 条
              </span>
              <Button
                disabled={loading || busy || !pagination.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
      <Modal
        open={!!commentRemoval}
        title="删除评论"
        onClose={() => {
          if (!busy) setCommentRemoval(null);
        }}
      >
        <form
          className="stack admin-comment-removal"
          onSubmit={(event) => {
            event.preventDefault();
            if (!commentRemoval || !commentReason.trim()) return;
            const target = commentRemoval;
            void act(async () => {
              await apiRequest(`/api/v1/admin/comments/${target.id}`, {
                method: "DELETE",
                body: JSON.stringify({
                  version: target.version,
                  reason: commentReason.trim(),
                }),
              });
              setCommentRemoval(null);
              setCommentReason("");
              setMessage("评论正文已删除，回复关系保留，操作已记录审计。");
            });
          }}
        >
          <p>
            将清除这条评论正文并停止公开展示，不能恢复。已有回复和引用关系保留。
          </p>
          <blockquote
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {String(commentRemoval?.body ?? "")}
          </blockquote>
          <Field label="删除原因">
            <textarea
              className="input"
              value={commentReason}
              aria-label="删除原因"
              onChange={(event) => setCommentReason(event.target.value)}
              required
              maxLength={1000}
              rows={4}
              disabled={busy}
            />
          </Field>
          {error && <p role="alert">{error}</p>}
          <Button
            type="submit"
            variant="danger"
            disabled={busy || !commentReason.trim()}
          >
            {busy ? "正在删除…" : "确认删除评论"}
          </Button>
        </form>
      </Modal>
      <Modal
        open={!!deletion}
        onClose={() => {
          if (!busy) setDeletion(null);
        }}
        title="删除目录内容"
        description="永久删除后无法恢复；存在关联数据时系统会阻止删除。"
      >
        {deletion && (
          <div className="stack">
            <p>
              确定删除{labels[deletion.resource]}“
              {String(
                deletion.row.title ?? deletion.row.name ?? deletion.row.id,
              )}
              ”？
            </p>
            <p className="muted small" style={{ overflowWrap: "anywhere" }}>
              ID {deletion.row.id} · 版本 {deletion.row.version}
            </p>
            <p>
              仅删除这条目录记录及其从属关联。用户投递、笔记、学习进度等数据会保留；请先处理其他内容引用。
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="row">
              <Button disabled={busy} onClick={() => setDeletion(null)}>
                取消
              </Button>
              <Button variant="danger" disabled={busy} onClick={removeCatalog}>
                {busy ? "正在删除…" : "永久删除"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!editor}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        title={
          editor
            ? `${editor.row ? "编辑" : "新增"}${labels[editor.resource]}`
            : "内容编辑"
        }
      >
        {error && editor && <p role="alert">{error}</p>}
        {editor && (
          <ContentForm
            key={`${editor.resource}:${editor.row?.id ?? "new"}`}
            resource={editor.resource}
            row={editor.row}
            references={references}
            busy={busy}
            onSubmit={save}
          />
        )}
      </Modal>
      <Modal
        open={!!decision}
        onClose={() => {
          if (!busy) setDecision(null);
        }}
        title={decision?.report ? "处理举报" : "内容审核"}
      >
        {decision && (
          <form className="stack" onSubmit={submitDecision}>
            {error && <p role="alert">{error}</p>}
            <p>{String(decision.row.title ?? decision.row.reason)}</p>
            <p className="muted small">
              目标 {String(decision.row.type ?? decision.row.targetType)} ·{" "}
              {decision.row.id} · 版本 {decision.row.version}
            </p>
            {decision.content && (
              <Panel title="完整审核内容">
                <ContentInspection content={decision.content} />
              </Panel>
            )}
            <p className="muted small">
              当前状态：{String(decision.row.status ?? decision.row.state)}
              。请核对完整正文与来源后再处理。
            </p>
            <Field label="处理结果">
              <select
                name="decision"
                className="input"
                disabled={
                  busy ||
                  (!decision.report &&
                    !["PENDING", "PUBLISHED"].includes(
                      String(decision.row.status),
                    ))
                }
              >
                {decision.report ? (
                  <>
                    <option value="RESOLVED">已核查并处理</option>
                    <option value="DISMISSED">不予采纳</option>
                  </>
                ) : decision.row.status === "PUBLISHED" ? (
                  <option value="HIDE">下架内容</option>
                ) : decision.row.status === "PENDING" ? (
                  <>
                    <option value="APPROVE">通过并发布</option>
                    <option value="REJECT">退回修改</option>
                  </>
                ) : (
                  <option value="">当前状态不可审核</option>
                )}
              </select>
            </Field>
            <Field label="依据与原因">
              <textarea
                name="reason"
                className="input"
                required
                minLength={1}
                maxLength={1000}
                rows={4}
                disabled={busy}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                (!decision.report &&
                  !["PENDING", "PUBLISHED"].includes(
                    String(decision.row.status),
                  ))
              }
            >
              确认并记录审计
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}

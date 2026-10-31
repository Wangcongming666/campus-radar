import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { apiRequest, ApiError } from "../api/auth";
import { useAccount } from "../app/api-shell";
import { SubmissionInbox, type SubmissionSummary } from "./submissions";
import "./experience-submissions.css";
import { UserRound } from "lucide-react";
import { commentAccess } from "./comment-access";
import { CommentRemoval } from "./comment-removal";
import {
  ExperienceFeed,
  ExperienceArticle,
  experienceRounds,
  experienceRoundLabel,
  experienceDate,
  useReadingResource,
  ReadingState,
} from "./experience-reading";
import { type PageResult } from "../api/personal";
import { useApi, useCommand, LoadState, mutate } from "../components/api-ui";
import {
  Button,
  Field,
  Panel,
  PageHeader,
  Empty,
  Modal,
} from "../components/ui";
import type { components } from "../api/generated";
import "./extended.css";
type Schema<K extends keyof components["schemas"]> = components["schemas"][K];
const prefix = "/api/v1";
function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
    >
      <input
        className="input"
        aria-label="搜索内容"
        placeholder="至少两个字符"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
      />
      <Button type="submit">搜索</Button>
    </form>
  );
}
function usePages<T>(path: string) {
  const [page, setPage] = useState(1);
  const remote = useApi<T[]>(
    `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=20`,
  );
  useEffect(() => setPage(1), [path]);
  return { ...remote, page, setPage };
}
function Pager({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (n: number) => void;
  count: number;
}) {
  return (
    <div className="row">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
        上一页
      </Button>
      <span>第 {page} 页</span>
      <Button disabled={count < 20} onClick={() => setPage(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
type Experience = Schema<"Experience">;
type ExperienceFields = {
  title: string;
  summary: string;
  body: string;
  role: string;
  round: string;
  date: string;
  tags: string;
  company: string;
};
const experienceDrafts = new Map<
  string,
  {
    fields: ExperienceFields;
    baseline: string;
    request: { body: string; key: string };
  }
>();
const commentDrafts = new Map<
  string,
  {
    body: string;
    request: { body: string; key: string };
    parent?: Schema<"Comment">;
  }
>();
let draftOwner: string | null = null;
window.addEventListener("campus:account-changed", () => {
  experienceDrafts.clear();
  commentDrafts.clear();
  draftOwner = null;
});
window.addEventListener("beforeunload", (event) => {
  if (experienceDrafts.size || commentDrafts.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function useKnowledgeOwner() {
  const account = useAccount();
  const owner = account.user?.role === "USER" ? account.user.id : null;
  useEffect(() => {
    if (owner && owner !== draftOwner) {
      experienceDrafts.clear();
      commentDrafts.clear();
      draftOwner = owner;
    }
  }, [owner]);
  return owner;
}
function useKnowledgeCommand() {
  const owner = useKnowledgeOwner();
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  useEffect(() => {
    generation.current++;
    lock.current = false;
    setBusy(false);
    setError("");
    setConflict(false);
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [owner]);
  async function run<T>(
    request: (signal: AbortSignal) => Promise<T>,
    after: (value: T) => void,
  ) {
    if (!owner || lock.current) return;
    const ticket = generation.current,
      signalController = new AbortController();
    controller.current = signalController;
    lock.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const value = await request(signalController.signal);
      if (
        ticket === generation.current &&
        ownerRef.current === owner &&
        !signalController.signal.aborted
      )
        after(value);
    } catch (reason) {
      if (
        ticket === generation.current &&
        ownerRef.current === owner &&
        !signalController.signal.aborted
      ) {
        setError(
          reason instanceof Error ? reason.message : "操作未完成，请重试。",
        );
        setConflict(reason instanceof ApiError && reason.status === 409);
      }
    } finally {
      if (ticket === generation.current && ownerRef.current === owner) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  return {
    owner,
    busy,
    error,
    conflict,
    run,
    clear: () => {
      setError("");
      setConflict(false);
    },
  };
}
const experienceStatusLabels: Record<Experience["status"], string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  PUBLISHED: "已发布",
  REJECTED: "未通过",
  HIDDEN: "已下线",
};
function fieldsFrom(item?: Experience): ExperienceFields {
  return {
    title: item?.title ?? "",
    summary: item?.summary ?? "",
    body: item?.bodyMd ?? "",
    role: item?.role ?? "",
    round: item?.roundType ?? "",
    date: item?.occurredOn ?? "",
    tags: item?.tags.join("，") ?? "",
    company: item?.companyId ?? "",
  };
}
function discardExperience(owner: string, item?: Experience) {
  const key = `${owner}:${item?.id ?? "new"}`;
  if (
    experienceDrafts.has(key) &&
    !window.confirm("放弃尚未保存的面经输入吗？")
  )
    return false;
  experienceDrafts.delete(key);
  return true;
}

export function ApiExperiencesPage() {
  const owner = useKnowledgeOwner(),
    navigate = useNavigate();
  const [editorOwner, setEditorOwner] = useState<string | null>(null),
    [editorBusy, setEditorBusy] = useState(false);
  function open() {
    if (!owner) {
      navigate(`/login?returnTo=${encodeURIComponent("/experiences")}`);
      return;
    }
    setEditorOwner(owner);
  }
  return (
    <div className="stack ext-page experience-page">
      <ExperienceFeed onWrite={open} />
      <Modal
        open={!!owner && editorOwner === owner}
        onClose={() => {
          if (!editorBusy && owner && discardExperience(owner))
            setEditorOwner(null);
        }}
        title="整理原创面经"
        size="lg"
      >
        {owner && editorOwner === owner && (
          <ExperienceEditor
            owner={owner}
            onBusy={setEditorBusy}
            after={(saved) => {
              setEditorOwner(null);
              navigate("/experiences/submissions", {
                state: {
                  message: "面经草稿已保存，尚未提交审核。请检查后主动提交。",
                  savedId: saved.id,
                },
              });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

export function ApiExperienceSubmissionsPage() {
  const owner = useKnowledgeOwner(),
    location = useLocation();
  const command = useKnowledgeCommand();
  const [refreshKey, setRefreshKey] = useState(0),
    [editor, setEditor] = useState<{ owner: string; item?: Experience } | null>(
      null,
    ),
    [editorBusy, setEditorBusy] = useState(false),
    [feedback, setFeedback] = useState<{ owner: string; text: string } | null>(
      null,
    );
  const current = editor?.owner === owner ? editor : null;
  function changed(message: string) {
    if (owner) {
      setFeedback({ owner, text: message });
      setRefreshKey((value) => value + 1);
    }
  }
  function edit(summary: SubmissionSummary) {
    void command.run(
      (signal) =>
        apiRequest<Experience>(
          `${prefix}/experiences/${encodeURIComponent(summary.id)}`,
          { signal },
        ),
      (item) => {
        if (item.authorId !== owner) throw new Error("这不是当前账号的投稿。");
        if (owner) setEditor({ owner, item });
      },
    );
  }
  function submit(summary: SubmissionSummary) {
    if (!["DRAFT", "REJECTED"].includes(summary.status)) return;
    void command.run(
      async (signal) => {
        const result = await apiRequest<Experience>(
          `${prefix}/experiences/${encodeURIComponent(summary.id)}/submit`,
          {
            method: "POST",
            signal,
            body: JSON.stringify({ version: summary.version }),
          },
        );
        if (result.status !== "PENDING")
          throw new Error("服务器尚未确认审核受理，请刷新投稿状态后核对。");
        return result;
      },
      () => changed("面经已提交，正在等待审核。公开广场暂不展示待审内容。"),
    );
  }
  return (
    <div className="experience-submissions stack">
      {owner && feedback?.owner === owner && (
        <p role="status" className="experience-feedback">
          {feedback.text}
        </p>
      )}
      {!feedback && typeof location.state?.message === "string" && (
        <p role="status" className="experience-feedback">
          {location.state.message}
        </p>
      )}
      {command.error && (
        <div role="alert" className="experience-error">
          <p>{command.error}</p>
          <Button onClick={() => setRefreshKey((value) => value + 1)}>
            刷新投稿状态
          </Button>
        </div>
      )}
      <SubmissionInbox
        kind="EXPERIENCE"
        title="我的面经投稿"
        backPath="/experiences"
        refreshKey={refreshKey}
        actions={
          <Button
            variant="primary"
            disabled={command.busy}
            onClick={() => {
              if (owner) {
                command.clear();
                setEditor({ owner });
              }
            }}
          >
            写面经
          </Button>
        }
        renderActions={(summary: SubmissionSummary) => (
          <div className="row">
            <Button disabled={command.busy} onClick={() => edit(summary)}>
              编辑面经
            </Button>
            {["DRAFT", "REJECTED"].includes(summary.status) ? (
              <Button
                variant="primary"
                disabled={command.busy}
                onClick={() => submit(summary)}
              >
                提交审核
              </Button>
            ) : (
              <span className="muted small">
                {summary.status === "PENDING"
                  ? "待审核；保存修改将回到草稿。"
                  : summary.status === "PUBLISHED"
                    ? "已公开；保存修改后需重新审核。"
                    : "修改后可重新整理并提交。"}
              </span>
            )}
          </div>
        )}
      />
      <Modal
        open={!!owner && !!current}
        onClose={() => {
          if (!editorBusy && owner && discardExperience(owner, current?.item))
            setEditor(null);
        }}
        title={current?.item ? "编辑原创面经" : "整理原创面经"}
        size="lg"
      >
        {owner && current && (
          <ExperienceEditor
            key={current.item?.id ?? "new"}
            owner={owner}
            item={current.item}
            onBusy={setEditorBusy}
            after={() => {
              setEditor(null);
              changed("面经草稿已保存，尚未提交审核。请检查后主动提交。");
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ExperienceEditor({
  owner,
  item,
  after,
  onBusy,
}: {
  owner: string;
  item?: Experience;
  after: (saved: Experience) => void;
  onBusy: (busy: boolean) => void;
}) {
  const cacheKey = `${owner}:${item?.id ?? "new"}`;
  const cached = experienceDrafts.get(cacheKey);
  const [form, setForm] = useState(() => cached?.fields ?? fieldsFrom(item));
  const baseline = useRef(cached?.baseline ?? JSON.stringify(fieldsFrom(item)));
  const requestKey = useRef(
    cached?.request ?? { body: "", key: crypto.randomUUID() },
  );
  const command = useKnowledgeCommand();
  const companies = useApi<Schema<"Company">[]>(
    `${prefix}/companies?page=1&size=100`,
  );
  const [version, setVersion] = useState(item?.version),
    [status, setStatus] = useState(item?.status ?? "DRAFT"),
    [latest, setLatest] = useState<Experience | null>(null),
    [localError, setLocalError] = useState("");
  const dirty = JSON.stringify(form) !== baseline.current;
  useEffect(() => {
    onBusy(command.busy);
    return () => onBusy(false);
  }, [command.busy, onBusy]);
  useEffect(() => {
    if (dirty)
      experienceDrafts.set(cacheKey, {
        fields: form,
        baseline: baseline.current,
        request: requestKey.current,
      });
    else experienceDrafts.delete(cacheKey);
  }, [cacheKey, form, dirty]);
  function update<K extends keyof ExperienceFields>(
    key: K,
    value: ExperienceFields[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setLocalError("");
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const tags = form.tags
      .split(/[,，]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (tags.length > 20 || tags.some((value) => value.length > 40)) {
      setLocalError("标签最多20个，每个不超过40字，请缩短后重试。");
      return;
    }
    if (
      item &&
      !["DRAFT", "REJECTED"].includes(status) &&
      !window.confirm(
        status === "PUBLISHED"
          ? "保存修改会让这份面经退出公开展示并回到草稿，需要重新提交审核。确定保存吗？"
          : "保存修改会结束当前审核或展示状态并回到草稿，需要重新提交审核。确定保存吗？",
      )
    )
      return;
    const input = {
      title: form.title,
      summary: form.summary,
      bodyMd: form.body,
      role: form.role,
      roundType: form.round,
      occurredOn: form.date || null,
      tags,
      companyId: form.company || null,
      ...(item ? { version } : {}),
    };
    const json = JSON.stringify(input);
    if (requestKey.current.body !== json)
      requestKey.current = { body: json, key: crypto.randomUUID() };
    if (dirty)
      experienceDrafts.set(cacheKey, {
        fields: form,
        baseline: baseline.current,
        request: requestKey.current,
      });
    void command.run(
      async (signal) => {
        const saved = await apiRequest<Experience>(
          `${prefix}/experiences${item ? `/${item.id}` : ""}`,
          {
            method: item ? "PATCH" : "POST",
            signal,
            headers: item
              ? undefined
              : { "Idempotency-Key": requestKey.current.key },
            body: json,
          },
        );
        if (saved.status !== "DRAFT")
          throw new Error("服务器尚未确认保存为草稿，请保留输入并重试。");
        return saved;
      },
      (saved) => {
        experienceDrafts.delete(cacheKey);
        after(saved);
      },
    );
  }
  return (
    <form className="stack experience-editor" onSubmit={save}>
      <p className="muted">
        保存只会生成私人草稿，不会自动发布。保存后请到“我的面经投稿”主动提交审核。
      </p>
      {item && !["DRAFT", "REJECTED"].includes(status) && (
        <p className="experience-warning" role="note">
          当前状态：{experienceStatusLabels[status]}
          。保存修改后将回到草稿，需重新提交审核；已发布内容会退出公开展示。
        </p>
      )}
      {(localError || command.error) && (
        <p className="experience-error" role="alert">
          {localError || command.error} 输入仍保留。
        </p>
      )}
      <fieldset disabled={command.busy}>
        <div className="experience-form-grid">
          <Field label="标题">
            <input
              className="input"
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              required
              maxLength={200}
              placeholder="例如：后端开发校招一面复盘"
            />
          </Field>
          <Field label="公司">
            <select
              className="input"
              aria-label="公司"
              value={form.company}
              onChange={(event) => update("company", event.target.value)}
            >
              <option value="">不关联公司</option>
              {companies.data?.map((company) => (
                <option value={company.id} key={company.id}>
                  {company.name}
                </option>
              ))}
              {form.company &&
                !companies.data?.some(
                  (company) => company.id === form.company,
                ) && <option value={form.company}>保留原关联公司</option>}
            </select>
          </Field>
          <Field label="方向">
            <input
              className="input"
              value={form.role}
              onChange={(event) => update("role", event.target.value)}
              required
              maxLength={40}
              placeholder="例如：后端开发"
            />
          </Field>
          <Field label="面试轮次">
            <select
              className="input"
              aria-label="面试轮次"
              value={form.round}
              onChange={(event) => update("round", event.target.value)}
              required
            >
              <option value="">请选择面试轮次</option>
              {[...experienceRounds].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {form.round && !experienceRounds.has(form.round) && (
                <option value={form.round}>{form.round}</option>
              )}
            </select>
          </Field>
          <Field label="发生日期（可留空）">
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </Field>
          <Field label="标签（逗号分隔）">
            <input
              className="input"
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="例如：校招，一面，项目经历"
            />
          </Field>
        </div>
        <Field label="摘要">
          <textarea
            className="input"
            aria-label="摘要"
            rows={3}
            value={form.summary}
            onChange={(event) => update("summary", event.target.value)}
            required
            maxLength={1000}
            placeholder="概括面试方向、主要问题和你的收获。"
          />
        </Field>
        <Field label="正文">
          <textarea
            className="input"
            aria-label="正文"
            rows={10}
            value={form.body}
            onChange={(event) => update("body", event.target.value)}
            required
            maxLength={100000}
            placeholder="记录真实的面试过程、问题与复盘，避免包含他人的个人信息。"
          />
        </Field>
      </fieldset>
      {command.conflict && item && (
        <div className="experience-conflict">
          <p>版本已更新，当前输入未被替换。</p>
          <Button
            disabled={command.busy}
            onClick={() =>
              void command.run(
                (signal) =>
                  apiRequest<Experience>(`${prefix}/experiences/${item.id}`, {
                    signal,
                  }),
                setLatest,
              )
            }
          >
            查看服务器记录
          </Button>
        </div>
      )}
      {latest && (
        <div className="experience-conflict">
          <h3>服务器记录 · {experienceStatusLabels[latest.status]}</h3>
          <strong>{latest.title}</strong>
          <p>
            {latest.role} · {experienceRoundLabel(latest.roundType)} ·{" "}
            {latest.occurredOn ?? "日期未填写"}
          </p>
          <p>{latest.summary}</p>
          <details>
            <summary>查看服务器正文</summary>
            <p className="experience-server-body">{latest.bodyMd}</p>
          </details>
          <Button
            onClick={() => {
              setVersion(latest.version);
              setStatus(latest.status);
              setLatest(null);
              command.clear();
            }}
          >
            保留我的输入，使用最新版本重试
          </Button>
        </div>
      )}
      <div className="row">
        <Button
          variant="primary"
          type="submit"
          disabled={command.busy || command.conflict || !!latest}
        >
          {command.busy ? "正在保存…" : "保存草稿"}
        </Button>
        <span className="muted small">
          草稿仅自己可见；提交审核需要下一步确认。
        </span>
      </div>
    </form>
  );
}

export function ApiExperienceDetailPage() {
  const { id } = useParams();
  const owner = useKnowledgeOwner(),
    location = useLocation();
  const remote = useReadingResource<{ data: Experience }>(
    `/experiences/${encodeURIComponent(id ?? "")}`,
    owner ?? "anonymous",
  );
  const item = remote.data?.data;
  const candidate = location.state?.experienceReturnTo;
  const returnTo =
    typeof candidate === "string" &&
    /^\/experiences(?:\?|$)/.test(candidate) &&
    !/[\\\u0000-\u0020]/.test(candidate)
      ? candidate
      : "/experiences";
  return (
    <div className="stack experience-page">
      <ReadingState {...remote} retry={remote.refresh}>
        {item?.status === "PUBLISHED" ? (
          <ExperienceArticle
            item={item}
            owner={owner}
            returnTo={returnTo}
            comments={
              <ApiComments
                key={item.id}
                kind="experiences"
                id={item.id}
                authorId={item.authorId}
              />
            }
          />
        ) : (
          item && (
            <>
              <Link className="experience-back" to="/experiences">
                返回面经广场
              </Link>
              <Empty
                title="这份面经尚未公开"
                description="草稿和待审核内容仅在本人的投稿页管理。"
                action={
                  <Link
                    className="button button-secondary"
                    to={
                      owner === item.authorId
                        ? "/experiences/submissions"
                        : "/experiences"
                    }
                  >
                    {owner === item.authorId
                      ? "到我的面经投稿管理"
                      : "返回面经广场"}
                  </Link>
                }
              />
            </>
          )
        )}
      </ReadingState>
    </div>
  );
}
function ApiComments({
  kind,
  id,
  authorId,
}: {
  kind: "experiences" | "posts";
  id: string;
  authorId?: string | null;
}) {
  const { user: commentActor } = useAccount();
  const access = commentAccess(commentActor);
  const owner = useKnowledgeOwner(),
    navigate = useNavigate();
  const [page, setPage] = useState(1);
  const remote = useReadingResource<PageResult<Schema<"Comment">>>(
    `/${kind}/${id}/comments?page=${page}&size=20`,
  );
  const published =
    remote.data?.data.filter((comment) => comment.status === "PUBLISHED") ?? [];
  const [reply, setReply] = useState<{
    owner: string;
    comment: Schema<"Comment">;
  } | null>(null);
  const replyTo = reply?.owner === owner ? reply.comment : null;
  const [openOwner, setOpenOwner] = useState<string | null>(null);
  const cacheKey = owner
    ? `${owner}:${kind}:${id}${replyTo ? `:reply:${replyTo.id}` : ""}`
    : "";
  const [draft, setDraft] = useState({
    owner,
    cacheKey,
    body: commentDrafts.get(cacheKey)?.body ?? "",
  });
  const body =
    draft.owner === owner && draft.cacheKey === cacheKey
      ? draft.body
      : (commentDrafts.get(cacheKey)?.body ?? "");
  const command = useKnowledgeCommand();
  const [feedback, setFeedback] = useState<{
    owner: string;
    text: string;
  } | null>(null);
  const submissionPath = `/submissions?type=${kind === "experiences" ? "EXPERIENCE_COMMENT" : "POST_COMMENT"}`;
  const pendingReplies = owner
    ? Array.from(commentDrafts.entries()).filter(
        ([key, value]) =>
          key.startsWith(`${owner}:${kind}:${id}:reply:`) &&
          value.parent &&
          value.body.trim(),
      )
    : [];
  function open(comment?: Schema<"Comment">) {
    if (!owner) {
      navigate(
        `/login?returnTo=${encodeURIComponent(`/${kind}/${id}#experience-discussion`)}`,
      );
      return;
    }
    setReply(comment ? { owner, comment } : null);
    setOpenOwner(owner);
  }
  function close() {
    if (command.busy) return;
    if (body && !window.confirm("放弃尚未提交的评论吗？")) return;
    commentDrafts.delete(cacheKey);
    setDraft({ owner, cacheKey, body: "" });
    setOpenOwner(null);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!owner || !body.trim()) return;
    const input = JSON.stringify({ body, parentId: replyTo?.id ?? null });
    const previous = commentDrafts.get(cacheKey);
    const requestKey =
      previous?.request.body === input
        ? previous.request.key
        : crypto.randomUUID();
    commentDrafts.set(cacheKey, {
      body,
      parent: replyTo ?? undefined,
      request: { body: input, key: requestKey },
    });
    void command.run(
      async (signal) => {
        const result = await apiRequest<Schema<"Comment">>(
          `${prefix}/${kind}/${id}/comments`,
          {
            method: "POST",
            signal,
            headers: { "Idempotency-Key": requestKey },
            body: input,
          },
        );
        if (result.status !== "PUBLISHED")
          throw new Error("评论尚未发布，请保留输入并刷新后重试。");
        return result;
      },
      (result) => {
        commentDrafts.delete(cacheKey);
        setDraft({ owner, cacheKey, body: "" });
        setOpenOwner(null);
        setFeedback({
          owner,
          text: "评论已发布。",
        });
        if (result.status === "PUBLISHED") remote.refresh();
      },
    );
  }
  return (
    <section
      className="experience-discussion"
      id="experience-discussion"
      aria-label="评论与交流"
    >
      <header className="experience-discussion-heading">
        <div>
          <h2>
            评论与交流
            {remote.data && (
              <span className="experience-comment-count">
                {remote.data.page.total} 条
              </span>
            )}
          </h2>
          <p>评论与回复直接公开，按发布时间倒序展示。</p>
        </div>
        {access.canPublish && (
          <Button variant="primary" onClick={() => open()}>
            发表评论
          </Button>
        )}
      </header>
      <ReadingState {...remote} retry={remote.refresh}>
        {remote.data && !published.length && (
          <Empty
            title="暂无公开评论"
            description="分享你的看法，或交流这篇面经中的问题。"
          />
        )}
        <ol className="experience-comment-list">
          {published.map((comment) => {
            const parent = published.find(
              (value) => value.id === comment.parentId,
            );
            const label = (value: Schema<"Comment">) =>
              value.authorId === owner && owner
                ? "我"
                : value.authorId === authorId && authorId
                  ? "面经作者"
                  : value.authorId
                    ? `用户 ${value.authorId.slice(0, 6)}`
                    : "匿名用户";
            return (
              <li
                className={`experience-comment-item ${comment.parentId ? "experience-comment-reply" : ""}`}
                key={comment.id}
                id={`comment-${comment.id}`}
              >
                <header>
                  <span
                    className="experience-comment-avatar"
                    aria-hidden="true"
                  >
                    <UserRound size={16} />
                  </span>
                  <strong>{label(comment)}</strong>
                  {comment.authorId === authorId && authorId && (
                    <span className="experience-comment-author">作者</span>
                  )}
                  <time dateTime={comment.createdAt}>
                    {experienceDate(comment.createdAt)}
                  </time>
                </header>
                {comment.parentId && (
                  <blockquote>
                    {parent ? `回复 ${label(parent)}` : "回复较早的评论"}
                    {parent && <span>{parent.body}</span>}
                  </blockquote>
                )}
                <p>{comment.body}</p>
                {access.canPublish && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => open(comment)}
                    aria-label={`回复${label(comment)}的评论`}
                  >
                    回复
                  </Button>
                )}
                <CommentRemoval
                  comment={comment}
                  topic={{ kind, id }}
                  onRemoved={remote.refresh}
                />
              </li>
            );
          })}
        </ol>
        {remote.data && (page > 1 || remote.data.page.hasMore) && (
          <nav className="experience-pagination" aria-label="评论分页">
            <Button
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页评论
            </Button>
            <span>第 {page} 页</span>
            <Button
              disabled={!remote.data.page.hasMore || page >= 500}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页评论
            </Button>
          </nav>
        )}
      </ReadingState>
      {feedback?.owner === owner && (
        <p className="experience-feedback" role="status">
          {feedback.text}
        </p>
      )}
      {!!pendingReplies.length && (
        <div className="experience-resume-replies">
          {pendingReplies.map(([key, value]) => (
            <Button key={key} size="sm" onClick={() => open(value.parent)}>
              继续未提交的回复
            </Button>
          ))}
        </div>
      )}
      <footer className="experience-discussion-footer">
        <p>评论可自行撤回；违规内容可举报。</p>
        {access.canPublish && <Link to={submissionPath}>我的评论记录</Link>}
      </footer>
      <Modal
        open={!!owner && openOwner === owner}
        onClose={close}
        title={replyTo ? "回复评论" : "发表评论"}
      >
        <form className="stack experience-editor" onSubmit={submit}>
          {replyTo && (
            <div className="experience-comment-context">
              正在回复这条评论<p>{replyTo.body}</p>
            </div>
          )}
          <p className="muted">评论将直接公开，请勿填写个人敏感信息。</p>
          <Field label="评论内容">
            <textarea
              className="input"
              aria-label="评论内容"
              rows={6}
              value={body}
              onChange={(event) => {
                const value = event.target.value;
                setDraft({ owner, cacheKey, body: value });
                if (value)
                  commentDrafts.set(cacheKey, {
                    body: value,
                    parent: replyTo ?? undefined,
                    request: commentDrafts.get(cacheKey)?.request ?? {
                      body: "",
                      key: crypto.randomUUID(),
                    },
                  });
                else commentDrafts.delete(cacheKey);
              }}
              maxLength={2000}
              required
              disabled={command.busy}
            />
          </Field>
          <p className="muted small">最多 2000 字；发布后可自行撤回。</p>
          {command.error && (
            <p className="experience-error" role="alert">
              {command.error} 评论仍保留，可以重试。
            </p>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={command.busy || !body.trim()}
          >
            {command.busy ? "正在提交…" : "发表评论"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}

export function ApiQuestionsPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(""),
    [selected, setSelected] = useState<Schema<"Question"> | null>(null);
  useEffect(() => {
    const id = params.get("question");
    if (id)
      void apiRequest<Schema<"Question">>(
        `${prefix}/questions/${encodeURIComponent(id)}`,
      )
        .then(setSelected)
        .catch(() => {});
  }, [params]);
  const remote = usePages<Schema<"Question">>(
    `${prefix}/questions?q=${encodeURIComponent(q)}`,
  );
  return (
    <div className="stack ext-page">
      <PageHeader
        title="题库练习"
        description="按已发布题目学习，掌握度和笔记保存到你的账号。"
      />
      <SearchBox onSearch={setQ} />
      <LoadState {...remote} retry={remote.refresh}>
        {remote.data?.length === 0 && <Empty title="暂无题目" />}
        {remote.data?.map((x) => (
          <Panel key={x.id}>
            <div className="between">
              <div>
                <h2>{x.title}</h2>
                <p className="muted">
                  {x.role} · {x.difficulty}
                </p>
              </div>
              <Button onClick={() => setSelected(x)}>打开练习</Button>
            </div>
          </Panel>
        ))}
        <Pager {...remote} count={remote.data?.length ?? 0} />
      </LoadState>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "题目"}
      >
        {selected && <QuestionStudy item={selected} />}
      </Modal>
    </div>
  );
}
function QuestionStudy({ item }: { item: Schema<"Question"> }) {
  const [answer, setAnswer] = useState(false),
    [note, setNote] = useState(""),
    [mastery, setMastery] =
      useState<Schema<"QuestionProgress">["mastery"]>("UNSEEN"),
    [wrong, setWrong] = useState(false),
    [version, setVersion] = useState<number | null>(null),
    [error, setError] = useState("");
  const command = useCommand();
  useEffect(() => {
    let active = true;
    apiRequest<Schema<"QuestionProgress">>(
      `${prefix}/questions/${item.id}/progress`,
    )
      .then((p) => {
        if (active) {
          setVersion(p.version);
          setNote(p.note);
          setMastery(p.mastery);
          setWrong(p.isWrong);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && e.status === 404) setVersion(0);
          else setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [item.id]);
  return (
    <div className="stack">
      <div style={{ whiteSpace: "pre-wrap" }}>{item.promptMd}</div>
      <Button onClick={() => setAnswer(!answer)}>
        {answer ? "收起参考答案" : "查看参考答案"}
      </Button>
      {answer && <div style={{ whiteSpace: "pre-wrap" }}>{item.answerMd}</div>}
      {error && <p role="alert">{error}</p>}
      <Field label="掌握度">
        <select
          className="input"
          value={mastery}
          onChange={(e) => setMastery(e.target.value as typeof mastery)}
        >
          <option value="UNSEEN">未开始</option>
          <option value="LEARNING">学习中</option>
          <option value="MASTERED">已掌握</option>
        </select>
      </Field>
      <label>
        <input
          type="checkbox"
          checked={wrong}
          onChange={(e) => setWrong(e.target.checked)}
        />{" "}
        加入错题
      </label>
      <Field label="学习笔记">
        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={10000}
        />
      </Field>
      {command.error && <p role="alert">{command.error}</p>}
      <Button
        disabled={version === null || command.busy}
        onClick={() =>
          void command.run(async () => {
            const p = await mutate<Schema<"QuestionProgress">>(
              `${prefix}/questions/${item.id}/progress`,
              "PUT",
              { version, mastery, isWrong: wrong, note },
            );
            setVersion(p.version);
          })
        }
      >
        保存学习记录
      </Button>
    </div>
  );
}
export { ApiHandbookPage } from "./handbook-page";
export function ApiCompanyPage() {
  const { id } = useParams();
  const remote = useApi<Schema<"Company">>(`${prefix}/companies/${id}`);
  const jobs = useApi<Schema<"Job">[]>(
    `${prefix}/jobs?companyId=${id}&page=1&size=100`,
  );
  return (
    <div className="stack">
      <LoadState {...remote} retry={remote.refresh}>
        {remote.data && (
          <>
            <PageHeader
              title={remote.data.name}
              description={remote.data.industry ?? "公司资料"}
            />
            <Panel>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {remote.data.descriptionMd}
              </div>
              <div className="row">
                <Link className="button" to={`/pack/${remote.data.slug}`}>
                  准备资料包
                </Link>
                <Link className="button" to={`/style/${remote.data.slug}`}>
                  面试风格统计
                </Link>
              </div>
            </Panel>
          </>
        )}
      </LoadState>
      <Panel title="公开岗位">
        <LoadState {...jobs} retry={jobs.refresh}>
          {jobs.data?.length === 0 && <p>暂无公开岗位。</p>}
          {jobs.data?.map((j) => (
            <p key={j.id}>
              <Link to={`/jobs/${j.id}`}>{j.title}</Link>
            </p>
          ))}
        </LoadState>
      </Panel>
    </div>
  );
}
export function ApiCompanyPackPage() {
  const { companySlug: company } = useParams();
  const remote = useApi<Schema<"CompanyPack">>(
    `${prefix}/companies/by-slug/${company}/pack`,
  );
  return (
    <div className="stack">
      <PageHeader
        title="公司准备包"
        description="根据已发布内容关联，持续整理你的准备材料。"
      />
      <LoadState {...remote} retry={remote.refresh}>
        {remote.data && (
          <>
            <Panel title="面经">
              {remote.data.experiences.length === 0 && <p>暂无相关面经。</p>}
              {remote.data.experiences.map((e) => (
                <p key={e.id}>
                  <Link to={`/experiences/${e.id}`}>{e.title}</Link>
                </p>
              ))}
            </Panel>
            <Panel title="相关题目">
              {remote.data.questions.map((q) => (
                <p key={q.id}>{q.title}</p>
              ))}
            </Panel>
            <Panel title="相关章节">
              {remote.data.chapters.map((c) => (
                <p key={c.id}>
                  <Link to="/handbook">{c.title}</Link>
                </p>
              ))}
            </Panel>
          </>
        )}
      </LoadState>
    </div>
  );
}
export function ApiCompanyStylePage() {
  const { companySlug: company } = useParams();
  const remote = useApi<Schema<"CompanyStyle">>(
    `${prefix}/companies/by-slug/${company}/style`,
  );
  return (
    <div className="stack">
      <PageHeader
        title="面试风格统计"
        description="统计来自已发布面经，不代表公司官方标准。"
      />
      <LoadState {...remote} retry={remote.refresh}>
        {remote.data && (
          <Panel>
            <p>
              {remote.data.windowStart} 至 {remote.data.windowEnd} ·{" "}
              {remote.data.sampleSize} 份样本
            </p>
            {remote.data.rounds.map((r) => (
              <p key={r.roundType}>
                {experienceRoundLabel(r.roundType)}：{r.count}
              </p>
            ))}
            {remote.data.limitations.map((x) => (
              <p className="muted small" key={x}>
                {x}
              </p>
            ))}
          </Panel>
        )}
      </LoadState>
    </div>
  );
}

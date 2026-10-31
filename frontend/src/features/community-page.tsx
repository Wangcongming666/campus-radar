import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount } from "../app/api-shell";
import { apiRequest, ApiError, type CurrentAccount } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { Button, Empty, Field, Modal, PageHeader } from "../components/ui";
import { SubmissionInbox } from "./submissions";
import { MessageSquare, ThumbsUp, ArrowUpRight, UserRound } from "lucide-react";
import "./community.css";
import { CommentRemoval } from "./comment-removal";

type Post = Schema<"Post">;
type Comment = Schema<"Comment">;
type Draft = {
  owner: string;
  body: string;
  tags: string;
  editing: Post | null;
  key: string;
  open: boolean;
  payload?: string;
  topic?: string;
  parent?: string | null;
};
let draftOwner: string | null = null;
const drafts = new Map<string, Draft>();
let accountEpoch = 0;
if (typeof window !== "undefined")
  window.addEventListener("campus:account-changed", () => {
    drafts.clear();
    draftOwner = null;
    accountEpoch++;
  });
function ownedDraft(owner: string, slot: string, initial: () => Draft) {
  if (draftOwner !== owner) {
    drafts.clear();
    draftOwner = owner;
  }
  if (!drafts.has(slot)) drafts.set(slot, initial());
  return drafts.get(slot)!;
}
function useDraft(owner: string, slot: string) {
  const initial = () => ({
    owner,
    body: "",
    tags: "",
    editing: null,
    key: crypto.randomUUID(),
    open: false,
  });
  const [value, setValue] = useState<Draft>(() =>
    ownedDraft(owner, slot, initial),
  );
  const draft =
    value.owner === owner && drafts.get(slot) === value
      ? value
      : ownedDraft(owner, slot, initial);
  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    drafts.set(slot, next);
    setValue(next);
  }
  function reset() {
    const next = initial();
    drafts.set(slot, next);
    setValue(next);
  }
  return { draft, update, reset };
}
async function readAll<T>(path: string, signal: AbortSignal) {
  const rows: T[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=100`,
      "GET",
      undefined,
      signal,
    );
    rows.push(...result.data);
    if (!result.page.hasMore) return rows;
  }
  throw new Error("记录过多，请稍后重试。");
}
function useRows<T>(path: string | null, owner: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    owner: string | null;
    data: T[];
    error: string;
    loading: boolean;
  }>({ path, owner, data: [], error: "", loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, owner, data: [], error: "", loading: !!path });
    if (path)
      void readAll<T>(path, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ path, owner, data, error: "", loading: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              path,
              owner,
              data: [],
              error: error.message,
              loading: false,
            });
        });
    return () => controller.abort();
  }, [path, owner, tick]);
  const visible =
    state.path === path && state.owner === owner
      ? state
      : { data: [], error: "", loading: true };
  return { ...visible, reload: useCallback(() => setTick((t) => t + 1), []) };
}
function useWrite(owner: string | null) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = useRef(owner);
  current.current = owner;
  const live = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      requestController.current?.abort();
    };
  }, []);
  useEffect(() => {
    setBusy(false);
    setError("");
    return () => requestController.current?.abort();
  }, [owner]);
  async function run<T>(
    action: (signal: AbortSignal) => Promise<T>,
    after: (value: T) => void,
  ) {
    const startedOwner = owner,
      epoch = accountEpoch;
    if (!startedOwner || busy) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const value = await action(controller.signal);
      if (
        live.current &&
        current.current === startedOwner &&
        epoch === accountEpoch
      )
        after(value);
    } catch (reason) {
      if (
        live.current &&
        current.current === startedOwner &&
        epoch === accountEpoch
      )
        setError(
          reason instanceof ApiError && reason.status === 409
            ? "内容版本已变化，请关闭弹窗并刷新后重新编辑；当前输入仍保留，可先复制保存。"
            : reason instanceof Error
              ? reason.message
              : "操作失败，请重试。",
        );
    } finally {
      if (
        live.current &&
        current.current === startedOwner &&
        epoch === accountEpoch
      )
        setBusy(false);
    }
  }
  return { busy, error, run };
}
function Loading({
  loading,
  error,
  reload,
  children,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {loading ? (
        <div className="community-loading" role="status">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <p>正在加载…</p>
        </div>
      ) : error ? (
        <div className="community-read-error" role="alert">
          <p>{error}</p>
          <Button onClick={reload}>重新加载</Button>
        </div>
      ) : (
        children
      )}
    </>
  );
}
function submissionWrite<T = unknown>(
  path: string,
  method: string,
  value: unknown,
  key?: string,
  signal?: AbortSignal,
) {
  return apiRequest<T>(`/api/v1${path}`, {
    method,
    signal,
    body: value === undefined ? undefined : JSON.stringify(value),
    headers: key ? { "Idempotency-Key": key } : undefined,
  });
}
export function ApiCommunityPage() {
  const { user } = useAccount();
  const posts = useRows<Post>("/posts", user?.id ?? null);
  const publicPosts = posts.data.filter((post) => post.status === "PUBLISHED");
  return (
    <div className="stack ext-page community-page">
      <PageHeader
        title="校招社区"
        description="看看大家的求职进展。动态审核后公开，评论和回复发布后直接展示。"
        actions={
          user?.role === "USER" ? (
            <CommunityComposer owner={user.id} onSaved={posts.reload} />
          ) : !user ? (
            <Link className="button button-primary" to="/login">
              登录后分享
            </Link>
          ) : undefined
        }
      />
      <div className="community-layout">
        <section
          className="community-feed"
          aria-labelledby="community-feed-title"
        >
          <div className="community-feed-heading">
            <h2 id="community-feed-title">社区动态</h2>
            <span>仅展示已审核通过的内容</span>
          </div>
          <Loading {...posts}>
            {publicPosts.length === 0 ? (
              <Empty
                title="暂时没有公开动态"
                description="分享你的准备心得或求职进展，审核通过后会在这里展示。"
              />
            ) : (
              <div className="community-feed-list">
                {publicPosts.map((post) => (
                  <PublicPost
                    key={post.id}
                    post={post}
                    user={user}
                    refresh={posts.reload}
                  />
                ))}
              </div>
            )}
          </Loading>
        </section>
        <aside className="community-aside" aria-label="社区分享说明">
          <section>
            <h2>{user?.role === "USER" ? "我的社区投稿" : "社区入口"}</h2>
            <p>
              {user?.role === "USER"
                ? "动态的审核与编辑统一在“我的投稿”管理，评论和回复在独立页面查看。"
                : user
                  ? "通过内容管理维护公开内容与处理评论。"
                  : "登录后可以参与讨论，查看自己的动态与评论。"}
            </p>
            {user?.role === "USER" ? (
              <>
                <Link to="/submissions?type=POST">
                  我的社区投稿 <ArrowUpRight size={15} />
                </Link>
                <Link to="/submissions/comments">
                  我的评论与回复 <ArrowUpRight size={15} />
                </Link>
              </>
            ) : user ? (
              <Link to="/admin">进入内容管理</Link>
            ) : (
              <Link to="/login?returnTo=%2Fcommunity">
                登录后查看 <ArrowUpRight size={15} />
              </Link>
            )}
          </section>
          <section>
            <h2>在这里分享什么</h2>
            <ul>
              <li>备考方法、面试准备和真实求职进展。</li>
              <li>具体的问题和有帮助的建议，让讨论更容易继续。</li>
              <li>请勿公开电话、住址、聊天记录等个人敏感信息。</li>
            </ul>
            <p className="community-moderation-note">
              动态需要审核；评论和回复直接发布，可自行撤回，也可举报违规内容。自己的记录可在投稿中查看。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
function CommunityComposer({
  owner,
  onSaved,
  editRequest,
}: {
  owner: string;
  onSaved: () => void;
  editRequest?: { post: Post; token: number } | null;
}) {
  const { draft, update, reset } = useDraft(owner, "post"),
    write = useWrite(owner);
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [owner]);
  useEffect(() => {
    if (editRequest) {
      const post = editRequest.post;
      update({
        editing: post,
        body: post.bodyMd,
        tags: post.tags.join("，"),
        key: crypto.randomUUID(),
        open: true,
      });
    }
  }, [editRequest]);
  const tags = draft.tags
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
  async function submit() {
    if (
      !draft.body.trim() ||
      tags.length > 10 ||
      tags.some((t) => t.length > 40)
    )
      return;
    const value = { bodyMd: draft.body.trim(), tags };
    const payload = JSON.stringify(value),
      key =
        draft.payload && draft.payload !== payload
          ? crypto.randomUUID()
          : draft.key;
    update({ payload, key });
    await write.run(
      (signal) =>
        submissionWrite(
          draft.editing ? `/posts/${draft.editing.id}` : "/posts",
          draft.editing ? "PATCH" : "POST",
          draft.editing ? { ...value, version: draft.editing.version } : value,
          draft.editing ? undefined : key,
          signal,
        ),
      () => {
        reset();
        setSent(true);
        onSaved();
      },
    );
  }
  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          update({ open: true });
          setSent(false);
        }}
      >
        {draft.open || draft.body ? "继续填写求职进展" : "分享求职进展"}
      </Button>
      {sent && (
        <p className="community-receipt" role="status">
          动态已提交审核。<Link to="/submissions?type=POST">查看我的投稿</Link>
        </p>
      )}
      <Modal
        title={draft.editing ? "编辑动态" : "分享求职进展"}
        open={draft.open}
        onClose={() => update({ open: false })}
        description={
          draft.editing
            ? "保存后将重新进入审核，审核通过前不会出现在公开动态中。"
            : "分享准备心得、面试进展或求职困惑。审核通过后公开展示。"
        }
      >
        <form
          className="stack community-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            label="动态内容"
            hint="最多10000字。请勿填写电话、住址等个人敏感信息。"
          >
            <textarea
              className="input"
              rows={7}
              aria-label="动态内容"
              disabled={write.busy}
              required
              maxLength={10000}
              value={draft.body}
              onChange={(e) => update({ body: e.target.value })}
              placeholder="例如：今天完成了第一轮技术面，想和大家交流项目介绍的准备方法…"
            />
          </Field>
          <Field
            label="标签（选填）"
            hint="使用中文或英文逗号分隔，最多10个；每个最多40字。"
          >
            <input
              className="input"
              value={draft.tags}
              aria-label="标签（选填）"
              disabled={write.busy}
              onChange={(e) => update({ tags: e.target.value })}
              maxLength={410}
              placeholder="例如：面试准备，后端开发"
            />
          </Field>
          {(tags.length > 10 || tags.some((t) => t.length > 40)) && (
            <p role="alert">标签最多10个，每个最多40字，请调整后提交。</p>
          )}
          {write.error && <p role="alert">{write.error}</p>}
          <div className="community-form-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={
                write.busy ||
                !draft.body.trim() ||
                tags.length > 10 ||
                tags.some((t) => t.length > 40)
              }
            >
              {write.busy ? "正在提交…" : "提交审核"}
            </Button>
            <Button disabled={write.busy} onClick={reset}>
              放弃草稿
            </Button>
            <Button onClick={() => update({ open: false })}>稍后继续</Button>
          </div>
          <p className="muted small">
            关闭弹窗会在当前页面会话保留输入；刷新浏览器后不保留。
          </p>
        </form>
      </Modal>
    </>
  );
}
function PublicPost({
  post,
  user,
  refresh,
}: {
  post: Post;
  user: CurrentAccount | null;
  refresh: () => void;
}) {
  const write = useWrite(user?.id ?? null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#post-${post.id}`)
      document
        .getElementById(`post-${post.id}`)
        ?.scrollIntoView({ block: "start" });
  }, [hash, post.id]);
  return (
    <article
      className="community-post community-post-anchor"
      id={`post-${post.id}`}
      aria-label={`${authorLabel(post.authorId, user?.id)}的求职动态`}
    >
      <header className="community-post-header">
        <span className="community-author-icon" aria-hidden="true">
          <UserRound size={17} />
        </span>
        <strong>{authorLabel(post.authorId, user?.id)}</strong>
        <time dateTime={post.createdAt} title={formatDate(post.createdAt)}>
          {formatDate(post.createdAt)}
        </time>
      </header>
      <p className="community-body">{post.bodyMd}</p>
      {post.tags.length > 0 && (
        <div className="community-tags" aria-label="动态标签">
          {post.tags.map((tag, i) => (
            <span key={`${tag}-${i}`}>{tag}</span>
          ))}
        </div>
      )}
      <CommunityComments
        post={post.id}
        user={user}
        postAuthor={post.authorId}
        leadingAction={
          user?.role === "USER" ? (
            <Button
              variant="ghost"
              aria-pressed={post.likedByMe}
              disabled={!user || write.busy}
              onClick={() =>
                void write.run(
                  (signal) =>
                    submissionWrite(
                      `/posts/${post.id}/like`,
                      post.likedByMe ? "DELETE" : "PUT",
                      undefined,
                      undefined,
                      signal,
                    ),
                  refresh,
                )
              }
            >
              <ThumbsUp size={16} />
              {post.likedByMe ? "取消点赞" : "点赞"} · {post.likeCount}
            </Button>
          ) : null
        }
      />
      {write.error && (
        <p className="community-inline-error" role="alert">
          {write.error}
        </p>
      )}
    </article>
  );
}
function authorLabel(author: string | null, owner?: string) {
  return author && author === owner
    ? "我"
    : author
      ? `用户 ${author.slice(0, 8)}`
      : "用户身份未提供";
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未提供"
    : date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function CommunityComments({
  post,
  user,
  postAuthor,
  leadingAction,
}: {
  post: string;
  user: CurrentAccount | null;
  postAuthor: string | null;
  leadingAction: ReactNode;
}) {
  const [expanded, setExpanded] = useState(() =>
      Array.from(drafts.entries()).some(
        ([slot, value]) =>
          slot.startsWith(`comment:${post}:`) &&
          value.owner === user?.id &&
          value.open,
      ),
    ),
    [sent, setSent] = useState(false);
  const comments = useRows<Comment>(
    expanded ? `/posts/${post}/comments` : null,
    user?.id ?? null,
  );
  useEffect(() => {
    setSent(false);
  }, [user?.id]);
  return (
    <div className="community-comments">
      <div className="community-post-actions community-interactions">
        {leadingAction}
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={`comments-${post}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <MessageSquare size={16} />
          {expanded ? "收起评论" : "查看评论"}
        </Button>
        {user?.role === "USER" && (
          <CommentComposer
            owner={user.id}
            post={post}
            onSaved={() => {
              setSent(true);
              comments.reload();
            }}
          />
        )}
        {user?.role === "USER" && (
          <span className="community-report-action">
            <CommunityReport type="POST" id={post} owner={user.id} />
          </span>
        )}
      </div>
      {sent && (
        <p className="community-inline-receipt" role="status">
          评论已发布。
          <Link to="/submissions/comments">查看我的评论与回复</Link>
        </p>
      )}
      {expanded && (
        <section
          className="community-discussion"
          id={`comments-${post}`}
          aria-label="公开评论"
        >
          <header className="community-discussion-heading">
            <h3>
              评论{" "}
              <span>
                {comments.loading || comments.error
                  ? ""
                  : `· ${comments.data.filter((c) => c.status === "PUBLISHED").length}`}
              </span>
            </h3>
            <p>评论与回复直接发布，可撤回或举报</p>
          </header>
          <Loading {...comments}>
            {comments.data.filter((c) => c.status === "PUBLISHED").length ===
              0 && (
              <p className="community-comment-empty">
                暂时没有公开评论，欢迎分享你的看法。
              </p>
            )}
            <ol className="community-comment-list">
              {comments.data
                .filter((comment) => comment.status === "PUBLISHED")
                .map((comment) => {
                  const parent = comments.data.find(
                    (c) =>
                      c.id === comment.parentId && c.status === "PUBLISHED",
                  );
                  return (
                    <li
                      className={`community-comment${comment.parentId ? " community-comment-reply" : ""}`}
                      key={comment.id}
                    >
                      <header>
                        <strong>
                          {authorLabel(comment.authorId, user?.id)}
                        </strong>
                        {comment.authorId &&
                          comment.authorId === postAuthor && (
                            <span className="community-author-label">
                              动态作者
                            </span>
                          )}
                        <time dateTime={comment.createdAt}>
                          {formatDate(comment.createdAt)}
                        </time>
                      </header>
                      {comment.parentId && (
                        <blockquote>
                          <span>
                            回复{" "}
                            {parent
                              ? authorLabel(parent.authorId, user?.id)
                              : `评论 ${comment.parentId.slice(0, 8)}`}
                          </span>
                          <p>
                            {parent
                              ? parent.body
                              : "原评论不在当前公开内容中。"}
                          </p>
                        </blockquote>
                      )}
                      <p className="community-body">{comment.body}</p>
                      {user && (
                        <div className="community-post-actions">
                          {user.role === "USER" && (
                            <>
                              <CommentComposer
                                owner={user.id}
                                post={post}
                                parent={comment.id}
                                parentComment={comment}
                                onSaved={() => {
                                  setSent(true);
                                  comments.reload();
                                }}
                              />
                            </>
                          )}
                          <CommentRemoval
                            comment={comment}
                            topic={{ kind: "posts", id: post }}
                            onRemoved={() => {
                              setSent(false);
                              comments.reload();
                            }}
                          />
                          {user.role === "USER" && (
                            <CommunityReport
                              type="POST_COMMENT"
                              id={comment.id}
                              owner={user.id}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ol>
          </Loading>
          {!user && (
            <Link
              className="community-login-comment"
              to="/login?returnTo=%2Fcommunity"
            >
              登录后参与讨论
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
function CommentComposer({
  owner,
  post,
  parent = null,
  parentComment,
  onSaved,
}: {
  owner: string;
  post: string;
  parent?: string | null;
  parentComment?: Comment;
  onSaved: () => void;
}) {
  const { draft, update, reset } = useDraft(
      owner,
      `comment:${post}:${parent ?? "root"}`,
    ),
    write = useWrite(owner);
  return (
    <>
      <Button variant="ghost" onClick={() => update({ open: true })}>
        {parent ? "回复" : "写评论"}
      </Button>
      <Modal
        title={parent ? "回复评论" : "发表评论"}
        open={draft.open}
        onClose={() => update({ open: false })}
        description="评论和回复将直接公开，请勿填写个人敏感信息。"
      >
        <form
          className="stack community-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.body.trim()) {
              const value = { body: draft.body.trim(), parentId: parent },
                payload = JSON.stringify(value),
                key =
                  draft.payload && draft.payload !== payload
                    ? crypto.randomUUID()
                    : draft.key;
              update({ payload, key });
              void write.run(
                (signal) =>
                  submissionWrite<Comment>(
                    `/posts/${post}/comments`,
                    "POST",
                    value,
                    key,
                    signal,
                  ).then((result) => {
                    if (result.status !== "PUBLISHED")
                      throw new Error("评论尚未发布，请保留输入并刷新后重试。");
                    return result;
                  }),
                () => {
                  reset();
                  onSaved();
                },
              );
            }
          }}
        >
          {parentComment && (
            <blockquote className="community-comment-context">
              <strong>回复 {authorLabel(parentComment.authorId, owner)}</strong>
              <p>{parentComment.body}</p>
            </blockquote>
          )}
          <Field label="评论内容" hint="最多2000字。">
            <textarea
              className="input"
              rows={5}
              aria-label="评论内容"
              disabled={write.busy}
              required
              maxLength={2000}
              value={draft.body}
              onChange={(e) => update({ body: e.target.value })}
              placeholder={parent ? "写下你的回复…" : "分享你的看法或建议…"}
            />
          </Field>
          {write.error && <p role="alert">{write.error}</p>}
          <div className="community-form-actions">
            <Button
              variant="primary"
              type="submit"
              disabled={write.busy || !draft.body.trim()}
            >
              {write.busy ? "正在提交…" : "发表评论"}
            </Button>
            <Button disabled={write.busy} onClick={reset}>
              放弃草稿
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function ApiCommunitySubmissionsPage() {
  const { user } = useAccount();
  return user ? <CommunitySubmissions key={user.id} owner={user.id} /> : null;
}
function CommunitySubmissions({ owner }: { owner: string }) {
  const [refreshKey, setRefreshKey] = useState(0),
    [edit, setEdit] = useState<{ post: Post; token: number } | null>(null),
    [remove, setRemove] = useState<Post | null>(null);
  const write = useWrite(owner);
  const refresh = () => setRefreshKey((v) => v + 1);
  function openOwned(id: string, mode: "edit" | "delete") {
    void write.run(
      async (signal) => {
        const rows = await readAll<Post>("/me/posts", signal);
        const post = rows.find(
          (row) => row.id === id && row.authorId === owner,
        );
        if (!post)
          throw new Error(
            "这条动态已不存在，或不属于当前账号。请刷新投稿状态。",
          );
        return post;
      },
      (post) => {
        if (mode === "edit") setEdit({ post, token: Date.now() });
        else setRemove(post);
      },
    );
  }
  return (
    <div className="stack ext-page community-page">
      <SubmissionInbox
        kind="POST"
        title="我的社区投稿"
        backPath="/community"
        refreshKey={refreshKey}
        actions={
          <CommunityComposer
            owner={owner}
            onSaved={refresh}
            editRequest={edit}
          />
        }
        renderActions={(item) => (
          <div className="community-post-actions">
            <Button
              disabled={write.busy}
              onClick={() => openOwned(item.id, "edit")}
            >
              编辑动态
            </Button>
            <Button
              variant="danger"
              disabled={write.busy}
              onClick={() => openOwned(item.id, "delete")}
            >
              删除动态
            </Button>
          </div>
        )}
      />
      {write.error && !remove && <p role="alert">{write.error}</p>}
      <Link className="community-personal-link" to="/submissions/comments">
        我的社区评论与回复 →
      </Link>
      <Modal
        title="删除动态"
        open={remove !== null}
        onClose={() => setRemove(null)}
      >
        <div className="stack community-form">
          <p>确认删除这条动态？相关评论和点赞也会一并删除，无法恢复。</p>
          {remove && (
            <blockquote className="community-delete-preview">
              {remove.bodyMd}
            </blockquote>
          )}
          {write.error && <p role="alert">{write.error}</p>}
          <div className="community-form-actions">
            <Button
              variant="danger"
              disabled={write.busy}
              onClick={() =>
                remove &&
                void write.run(
                  (signal) =>
                    submissionWrite(
                      `/posts/${remove.id}?version=${remove.version}`,
                      "DELETE",
                      undefined,
                      undefined,
                      signal,
                    ),
                  () => {
                    setRemove(null);
                    refresh();
                  },
                )
              }
            >
              {write.busy ? "正在删除…" : "确认删除"}
            </Button>
            <Button onClick={() => setRemove(null)}>取消</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
function CommunityReport({
  type,
  id,
  owner,
}: {
  type: "POST" | "POST_COMMENT";
  id: string;
  owner: string | null;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [sent, setSent] = useState(false),
    write = useWrite(owner);
  const reportKey = useRef(crypto.randomUUID());
  useEffect(() => {
    setOpen(false);
    setReason("");
    setSent(false);
    reportKey.current = crypto.randomUUID();
  }, [owner]);
  return (
    <>
      <Button
        variant="ghost"
        disabled={!owner}
        onClick={() => {
          setOpen(true);
          setSent(false);
        }}
      >
        举报
      </Button>
      <Modal title="举报内容" open={open} onClose={() => setOpen(false)}>
        {sent ? (
          <p role="status">举报已提交，将由审核人员处理。</p>
        ) : (
          <form
            className="stack community-form"
            onSubmit={(e) => {
              e.preventDefault();
              void write.run(
                (signal) =>
                  submissionWrite(
                    "/reports",
                    "POST",
                    { targetType: type, targetId: id, reason },
                    reportKey.current,
                    signal,
                  ),
                () => {
                  setSent(true);
                  setReason("");
                  reportKey.current = crypto.randomUUID();
                },
              );
            }}
          >
            <Field label="举报原因">
              <textarea
                className="input"
                rows={4}
                aria-label="举报原因"
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {write.error && <p role="alert">{write.error}</p>}
            <Button type="submit" disabled={write.busy}>
              提交举报
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

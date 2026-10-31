import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccount } from "../app/api-shell";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { Badge, Button, PageHeader } from "../components/ui";
import "./submissions.css";
import { CommentRemoval } from "./comment-removal";

export const submissionKinds = {
  POST: "社区动态",
  EXPERIENCE: "面经",
  SALARY: "薪资样本",
  REFERRAL: "内推资源",
  POST_COMMENT: "社区评论",
  EXPERIENCE_COMMENT: "面经评论",
} as const;
export type SubmissionKind = keyof typeof submissionKinds;
export const submissionStatuses = {
  DRAFT: "草稿",
  PENDING: "待审核",
  PUBLISHED: "已发布",
  REJECTED: "未通过",
  HIDDEN: "已下架",
} as const;
export type SubmissionSummary = Schema<"SubmissionSummary">;
export function SubmissionStatusBadge({ status }: { status: string }) {
  const label = Object.hasOwn(submissionStatuses, status)
    ? submissionStatuses[status as keyof typeof submissionStatuses]
    : "状态待确认";
  return (
    <Badge
      tone={
        status === "PUBLISHED"
          ? "green"
          : status === "PENDING"
            ? "amber"
            : status === "REJECTED"
              ? "red"
              : "muted"
      }
    >
      {label}
    </Badge>
  );
}
const notes: Record<string, string> = {
  DRAFT: "尚未提交审核，仅自己可见。",
  PENDING: "已提交，审核通过后才会公开展示。",
  PUBLISHED: "已通过审核。",
  REJECTED: "审核未通过，当前不会公开展示。",
  HIDDEN: "当前不在公开页面展示。",
};
function safePublicPath(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u0020]/.test(value)
    ? value
    : null;
}
export function SubmissionInbox({
  kind,
  title = "我的投稿",
  backPath,
  refreshKey = 0,
  actions,
  renderActions,
  description = "只显示你自己的投稿。草稿和待审核内容不会出现在公开模块。",
}: {
  description?: string;
  kind?: SubmissionKind;
  title?: string;
  backPath?: string;
  refreshKey?: number;
  actions?: ReactNode;
  renderActions?: (item: SubmissionSummary) => ReactNode;
}) {
  const account = useAccount();
  const owner = account.user?.role === "USER" ? account.user.id : null;
  const [params, setParams] = useSearchParams();
  const selectedKind =
    kind ??
    (Object.hasOwn(submissionKinds, params.get("type") ?? "")
      ? (params.get("type") as SubmissionKind)
      : "");
  const commentOnly = selectedKind.endsWith("COMMENT");
  const selectedStatus = Object.hasOwn(
    submissionStatuses,
    params.get("status") ?? "",
  )
    ? params.get("status")!
    : "";
  const rawPage = Number(params.get("page") ?? 1);
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 500 ? rawPage : 1;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    owner: string | null;
    loading: boolean;
    error: string;
    result: PageResult<SubmissionSummary> | null;
  }>({ owner: null, loading: true, error: "", result: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ owner, loading: !!owner, error: "", result: null });
    if (!owner) return;
    const query = new URLSearchParams({ page: String(page), size: "20" });
    if (selectedKind) query.set("type", selectedKind);
    if (selectedStatus) query.set("status", selectedStatus);
    personalRequest<PageResult<SubmissionSummary>>(
      `/me/submissions?${query}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ owner, loading: false, error: "", result });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({
            owner,
            loading: false,
            error:
              e instanceof Error ? e.message : "无法读取投稿，请稍后重试。",
            result: null,
          });
      });
    return () => controller.abort();
  }, [owner, selectedKind, selectedStatus, page, refreshKey, revision]);
  const current =
    state.owner === owner
      ? state
      : { owner, loading: !!owner, error: "", result: null };
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function turn(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }
  return (
    <div className="stack submission-page">
      {backPath && (
        <Link className="submission-back" to={backPath}>
          ← 返回公开页面
        </Link>
      )}
      <PageHeader
        title={title}
        description={
          commentOnly && title === "我的投稿"
            ? "评论和回复直接发布，无需审核；可在这里查看记录或撤回自己的评论。"
            : description
        }
        actions={actions}
      />
      <div className="submission-toolbar">
        {!kind && (
          <label className="field">
            <span>投稿类型</span>
            <select
              className="input"
              aria-label="投稿类型"
              value={selectedKind}
              onChange={(e) => filter("type", e.target.value)}
            >
              <option value="">全部类型</option>
              {Object.entries(submissionKinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>{commentOnly ? "显示状态" : "审核状态"}</span>
          <select
            className="input"
            aria-label={commentOnly ? "显示状态" : "审核状态"}
            value={selectedStatus}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">全部状态</option>
            {Object.entries(
              commentOnly
                ? { PUBLISHED: "已发布", HIDDEN: "已撤回、删除或下架" }
                : submissionStatuses,
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={current.loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          刷新状态
        </Button>
        {kind && (
          <Link className="submission-all" to="/submissions">
            查看所有投稿
          </Link>
        )}
      </div>
      {!owner ? (
        <div className="submission-empty">
          <h2>登录后查看自己的投稿</h2>
          <Link
            className="button"
            to={`/login?returnTo=${encodeURIComponent(kind ? (backPath ? `${backPath}/submissions` : "/submissions") : "/submissions")}`}
          >
            前往登录
          </Link>
        </div>
      ) : current.loading ? (
        <p role="status">正在读取投稿状态…</p>
      ) : current.error ? (
        <div role="alert" className="submission-empty">
          <h2>投稿暂时无法读取</h2>
          <p>{current.error}</p>
          <Button onClick={() => setRevision((value) => value + 1)}>
            重新加载
          </Button>
        </div>
      ) : (
        current.result && (
          <>
            <p className="muted small" aria-live="polite">
              当前条件共 {current.result.page.total} 条投稿
            </p>
            {!current.result.data.length ? (
              <div className="submission-empty">
                <h2>
                  {selectedStatus ? "没有这个状态的投稿" : "还没有投稿记录"}
                </h2>
                <p>
                  {selectedStatus
                    ? "试试其他审核状态，或查看全部状态。"
                    : "通过公开页面的投稿入口提交后，可以在这里跟进。"}
                </p>
                {selectedStatus && (
                  <Button onClick={() => filter("status", "")}>
                    查看全部状态
                  </Button>
                )}
              </div>
            ) : (
              <div className="submission-list">
                {current.result.data.map((item) => {
                  const path = safePublicPath(item.publicPath);
                  return (
                    <article
                      className="submission-item"
                      key={`${item.kind}:${item.id}`}
                      data-submission-id={item.id}
                      data-submission-kind={item.kind}
                    >
                      <header>
                        <div>
                          <span className="submission-kind">
                            {submissionKinds[item.kind] ?? "投稿"}
                          </span>
                          <h2>
                            {kind === "POST_COMMENT"
                              ? item.commentContext?.parentId
                                ? "我的回复"
                                : "我的评论"
                              : item.title}
                          </h2>
                        </div>
                        <SubmissionStatusBadge status={item.status} />
                      </header>
                      {kind === "POST_COMMENT" ? (
                        <CommunityCommentContent item={item} />
                      ) : (
                        <p className="submission-summary">{item.summary}</p>
                      )}
                      <p className="submission-status-note">
                        {item.kind.endsWith("COMMENT") &&
                        item.status === "PUBLISHED"
                          ? "评论已发布，无需审核。"
                          : item.kind.endsWith("COMMENT") &&
                              item.status === "HIDDEN"
                            ? "评论已撤回、删除或下架，不再公开。"
                            : item.status === "REJECTED"
                              ? item.kind === "EXPERIENCE" ||
                                item.kind === "POST"
                                ? "审核未通过。可以进入投稿管理，修改后重新提交审核。"
                                : item.kind === "SALARY"
                                  ? "审核未通过，当前不会纳入公开统计。请核对样本信息后重新投稿。"
                                  : item.kind.endsWith("COMMENT")
                                    ? "这条历史评论未公开。你可以重新发表合适的评论。"
                                    : "审核未通过，当前不会公开展示。请核对资源后重新投稿。"
                              : (notes[item.status] ??
                                "请刷新后确认最新状态。")}
                      </p>
                      {!!item.details?.length && (
                        <details className="submission-details">
                          <summary>查看投稿详情</summary>
                          <dl>
                            {item.details.map((detail, index) => (
                              <div key={index}>
                                <dt>{detail.label}</dt>
                                <dd>{detail.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                      <footer>
                        <time dateTime={item.createdAt}>
                          创建于{" "}
                          {new Date(item.createdAt).toLocaleString("zh-CN")}
                        </time>
                        <div>
                          {renderActions?.(item)}
                          {item.kind.endsWith("COMMENT") &&
                            item.status === "PUBLISHED" &&
                            owner && (
                              <CommentWithdrawal
                                key={`${owner}:${item.id}:${item.version}`}
                                item={item}
                                onChanged={() => setRevision((v) => v + 1)}
                              />
                            )}
                          {!kind &&
                            ["POST", "EXPERIENCE"].includes(item.kind) && (
                              <Link
                                className="button button-sm"
                                to={
                                  item.kind === "POST"
                                    ? "/submissions/community"
                                    : "/experiences/submissions"
                                }
                              >
                                管理{item.kind === "POST" ? "动态" : "面经"}
                              </Link>
                            )}
                          {kind !== "POST_COMMENT" &&
                            item.status === "PUBLISHED" &&
                            path && (
                              <Link className="button button-sm" to={path}>
                                查看公开内容
                              </Link>
                            )}
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}
            <div className="submission-pagination">
              <Button disabled={page === 1} onClick={() => turn(page - 1)}>
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button
                disabled={!current.result.page.hasMore || page >= 500}
                onClick={() => turn(page + 1)}
              >
                下一页
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
function CommentWithdrawal({
  item,
  onChanged,
}: {
  item: SubmissionSummary;
  onChanged: () => void;
}) {
  const { user } = useAccount();
  return (
    <CommentRemoval
      comment={{
        id: item.id,
        version: item.version,
        status: item.status,
        authorId: user?.id ?? null,
      }}
      onRemoved={onChanged}
    />
  );
}
function CommunityCommentContent({ item }: { item: SubmissionSummary }) {
  const context = item.commentContext;
  const postPath =
    context?.postAvailable &&
    context.postId &&
    context.postPath === `/community#post-${context.postId}`
      ? safePublicPath(context.postPath)
      : null;
  return (
    <div className="submission-comment-content">
      <p className="submission-comment-body">
        {context?.body || item.summary || "这条评论的内容已清空。"}
      </p>
      {context?.parentId && (
        <section className="submission-reply-context">
          <h3>回复的评论</h3>
          <p>{context.parentBody || "原评论已删除或暂不可查看。"}</p>
        </section>
      )}
      <section className="submission-post-context">
        <div>
          <h3>对应帖子</h3>
          {context?.postSummary ? (
            <p>{context.postSummary}</p>
          ) : (
            <p className="muted">
              {context
                ? "原帖已删除或暂不公开，无法展示帖子内容。"
                : "暂未取得原帖信息，请稍后刷新重试。"}
            </p>
          )}
        </div>
        {postPath && (
          <Link className="button button-sm" to={postPath}>
            查看原帖与讨论
          </Link>
        )}
      </section>
    </div>
  );
}
export function ApiCommunityCommentsPage() {
  return (
    <SubmissionInbox
      kind="POST_COMMENT"
      title="我的评论与回复"
      backPath="/community"
      description="查看你发表的评论和回复以及对应帖子。评论直接发布，无需审核；你可以自行撤回。这里只展示当前账号的记录。"
      actions={
        <Link className="button" to="/submissions?type=POST">
          我的社区投稿
        </Link>
      }
    />
  );
}
export function ApiSubmissionsPage() {
  return (
    <SubmissionInbox
      actions={
        <Link className="button" to="/submissions/comments">
          我的评论与回复
        </Link>
      }
    />
  );
}
export function ApiReferralSubmissionsPage() {
  return (
    <SubmissionInbox
      kind="REFERRAL"
      title="我的内推投稿"
      backPath="/referral"
    />
  );
}

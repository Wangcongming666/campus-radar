import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MessageSquare,
  Search,
} from "lucide-react";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { Button, Empty, PageHeader } from "../components/ui";
import { HandbookMarkdown } from "./handbook-page";
import "./experience-reading.css";
import { useAccount } from "../app/api-shell";

export const experienceRounds = new Map([
  ["INTERVIEW_1", "一面"],
  ["INTERVIEW_2", "二面"],
  ["HR", "HR 面"],
  ["FINAL", "终面"],
  ["ASSESSMENT", "笔试"],
  ["TECHNICAL", "技术面"],
  ["BUSINESS", "业务面"],
  ["OTHER", "其他"],
]);
export const experienceRoundLabel = (value: string) =>
  experienceRounds.get(value) ?? value;
const roles: Record<string, string> = {
  backend: "后端开发",
  frontend: "前端开发",
  algorithm: "算法",
  product: "产品",
  design: "设计",
  data: "数据",
  test: "测试",
  operations: "运营",
};
export const experienceRoleLabel = (value: string) => roles[value] ?? value;
export function experienceDate(value: string | null, dateOnly = false) {
  if (!value) return "未注明";
  const date = new Date(dateOnly ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "未注明"
    : date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}
export function useReadingResource<T>(path: string, scope = "public") {
  const key = `${scope}:${path}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    loading: boolean;
    error: string;
  }>({ key: "", data: null, loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: "" });
    personalRequest<T>(path, "GET", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ key, data, loading: false, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            loading: false,
            error:
              error instanceof Error ? error.message : "内容读取失败，请重试。",
          });
      });
    return () => controller.abort();
  }, [key, path, revision]);
  return {
    ...(state.key === key
      ? state
      : { key, data: null, loading: true, error: "" }),
    refresh: useCallback(() => setRevision((value) => value + 1), []),
  };
}
export function useExperienceCompanies() {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    data: Schema<"Company">[];
    error: string;
    loading: boolean;
  }>({ data: [], error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: [], error: "", loading: true });
    void (async () => {
      const data: Schema<"Company">[] = [];
      for (let page = 1; page <= 500; page++) {
        const response = await personalRequest<PageResult<Schema<"Company">>>(
          `/companies?page=${page}&size=100`,
          "GET",
          undefined,
          controller.signal,
        );
        data.push(...response.data);
        if (!response.page.hasMore) {
          if (!controller.signal.aborted)
            setState({ data, error: "", loading: false });
          return;
        }
      }
      throw new Error("公司列表较多，请稍后重试。");
    })().catch((error) => {
      if (!controller.signal.aborted)
        setState({
          data: [],
          error: error instanceof Error ? error.message : "公司列表读取失败。",
          loading: false,
        });
    });
    return () => controller.abort();
  }, [revision]);
  return { ...state, refresh: () => setRevision((value) => value + 1) };
}
export function ReadingState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="experience-loading" role="status">
        <span />
        <span />
        <span />
        <p>正在读取面经内容…</p>
      </div>
    );
  if (error)
    return (
      <div className="experience-reading-error" role="alert">
        <h2>暂时无法读取内容</h2>
        <p>{error}</p>
        <Button onClick={retry}>重新加载</Button>
      </div>
    );
  return <>{children}</>;
}
function PageNav({
  page,
  meta,
  onPage,
}: {
  page: number;
  meta: PageResult<unknown>["page"];
  onPage: (page: number) => void;
}) {
  return (
    <nav className="experience-pagination" aria-label="面经分页">
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ArrowLeft size={15} />
        上一页
      </Button>
      <span>第 {page} 页</span>
      <Button
        disabled={!meta.hasMore || page >= 500}
        onClick={() => onPage(page + 1)}
      >
        下一页
        <ArrowRight size={15} />
      </Button>
    </nav>
  );
}
export function ExperienceFeed({ onWrite }: { onWrite: () => void }) {
  const { user: viewer } = useAccount();
  const [params, setParams] = useSearchParams();
  const applied = {
    q: params.get("q") ?? "",
    companyId: params.get("companyId") ?? "",
    role: params.get("role") ?? "",
    roundType: params.get("roundType") ?? "",
  };
  const queryKey = JSON.stringify(applied);
  const [draft, setDraft] = useState({ ...applied, key: queryKey });
  const fields = draft.key === queryKey ? draft : { ...applied, key: queryKey };
  const rawPage = Number(params.get("page") ?? 1),
    page =
      Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 500 ? rawPage : 1;
  const query = new URLSearchParams({ page: String(page), size: "20" });
  for (const [key, value] of Object.entries(applied))
    if (value) query.set(key, value);
  const remote = useReadingResource<PageResult<Schema<"Experience">>>(
    `/experiences?${query}`,
  );
  const companies = useExperienceCompanies();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(
    () => !!(applied.companyId || applied.role || applied.roundType),
  );
  const active = Object.values(applied).some(Boolean);
  function update(key: keyof typeof applied, value: string) {
    setDraft({ ...fields, [key]: value });
    setError("");
  }
  function clear() {
    setParams({});
    setDraft({
      q: "",
      companyId: "",
      role: "",
      roundType: "",
      key: JSON.stringify({ q: "", companyId: "", role: "", roundType: "" }),
    });
    setError("");
  }
  return (
    <>
      <PageHeader
        title="面经广场"
        description="找到与你相关的面试经历，了解过程、问题与复盘。"
        actions={
          <>
            {viewer?.role === "USER" && (
              <Link
                className="button button-secondary"
                to="/experiences/submissions"
              >
                我的面经投稿
              </Link>
            )}
            {viewer?.role === "USER" && (
              <Button variant="primary" onClick={onWrite}>
                写面经
              </Button>
            )}
          </>
        }
      />
      <form
        className="experience-filters"
        aria-label="搜索与筛选面经"
        onSubmit={(event) => {
          event.preventDefault();
          const q = fields.q.trim();
          if (q.length === 1) {
            setError("请输入至少两个字符的关键词，或留空查看全部面经。");
            return;
          }
          const next = new URLSearchParams();
          for (const [key, value] of Object.entries({ ...fields, q }))
            if (key !== "key" && value.trim()) next.set(key, value.trim());
          setParams(next);
          setError("");
        }}
      >
        <label className="experience-search">
          <Search size={18} />
          <input
            className="input"
            aria-label="搜索面经"
            placeholder="搜索标题或正文，如：项目复盘"
            value={fields.q}
            maxLength={100}
            onChange={(e) => update("q", e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary">
          搜索面经
        </Button>
        <Button
          className="experience-filter-toggle"
          aria-expanded={expanded}
          aria-controls="experience-filter-fields"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起筛选" : "更多筛选：公司、方向、轮次"}
        </Button>
        <div
          id="experience-filter-fields"
          className={`experience-filter-fields ${expanded ? "is-expanded" : ""}`}
        >
          <label className="field">
            <span>公司</span>
            <select
              className="input"
              aria-label="筛选公司"
              value={fields.companyId}
              onChange={(e) => update("companyId", e.target.value)}
            >
              <option value="">全部公司</option>
              {fields.companyId &&
                !companies.data.some((c) => c.id === fields.companyId) && (
                  <option value={fields.companyId}>当前筛选公司</option>
                )}
              {companies.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>岗位方向</span>
            <input
              className="input"
              aria-label="筛选岗位方向"
              list="experience-role-options"
              maxLength={40}
              placeholder="如：后端开发、backend"
              value={fields.role}
              onChange={(e) => update("role", e.target.value)}
            />
            <datalist id="experience-role-options">
              {Object.entries(roles).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>面试轮次</span>
            <select
              className="input"
              aria-label="筛选面试轮次"
              value={fields.roundType}
              onChange={(e) => update("roundType", e.target.value)}
            >
              <option value="">全部轮次</option>
              {fields.roundType && !experienceRounds.has(fields.roundType) && (
                <option value={fields.roundType}>{fields.roundType}</option>
              )}
              {Array.from(experienceRounds, ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={clear}>重置筛选</Button>
        </div>
        <p className="experience-filter-hint">
          关键词可留空；方向按面经中填写的名称匹配。填写条件后点击“搜索面经”。
        </p>
        {error && (
          <p className="experience-error" role="alert">
            {error}
          </p>
        )}
        {companies.error && (
          <div className="experience-directory-error">
            <span>公司列表暂时无法读取，仍可使用关键词和其他筛选。</span>
            <Button size="sm" onClick={companies.refresh}>
              重读公司列表
            </Button>
          </div>
        )}
      </form>
      <div className="experience-browse-layout">
        <section className="experience-feed" aria-label="已发布面经列表">
          <div className="experience-results-heading">
            <h2>{active ? "筛选结果" : "已发布面经"}</h2>
            <span aria-live="polite">
              {remote.data
                ? `共 ${remote.data.page.total} 篇 · 最近更新优先`
                : "读取中"}
            </span>
          </div>
          <ReadingState {...remote} retry={remote.refresh}>
            {remote.data && (
              <>
                {!remote.data.data.filter((item) => item.status === "PUBLISHED")
                  .length ? (
                  <Empty
                    title={active ? "没有找到符合条件的面经" : "暂无已发布面经"}
                    description={
                      active
                        ? "尝试减少筛选条件，或更换关键词。"
                        : "你可以整理自己的面试经历，审核通过后在这里分享。"
                    }
                    action={
                      active ? (
                        <Button onClick={clear}>清除筛选</Button>
                      ) : viewer?.role === "USER" ? (
                        <Button onClick={onWrite}>写第一篇面经</Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="experience-feed-list">
                    {remote.data.data
                      .filter((item) => item.status === "PUBLISHED")
                      .map((item) => {
                        const company = companies.data.find(
                          (c) => c.id === item.companyId,
                        );
                        return (
                          <article
                            className="experience-feed-item"
                            key={item.id}
                          >
                            <div className="experience-item-meta">
                              <span>
                                <Building2 size={15} />
                                {company?.name ??
                                  (item.companyId
                                    ? "公司信息待获取"
                                    : "未关联公司")}
                              </span>
                              <span className="experience-round">
                                {experienceRoundLabel(item.roundType)}
                              </span>
                            </div>
                            <h3>
                              <Link
                                to={`/experiences/${item.id}`}
                                state={{
                                  experienceReturnTo: `/experiences?${params}`,
                                }}
                              >
                                {item.title}
                              </Link>
                            </h3>
                            <p className="experience-item-summary">
                              {item.summary ||
                                "作者未填写摘要，打开正文查看完整经历。"}
                            </p>
                            {!!item.tags.length && (
                              <div className="experience-tags">
                                {item.tags.map((tag, index) => (
                                  <span key={`${tag}:${index}`}>{tag}</span>
                                ))}
                              </div>
                            )}
                            <footer>
                              <span>
                                {experienceRoleLabel(item.role)}
                                <span className="experience-meta-dot">·</span>
                                <time dateTime={item.updatedAt}>
                                  {experienceDate(item.updatedAt)} 更新
                                </time>
                              </span>
                              <Link
                                to={`/experiences/${item.id}`}
                                state={{
                                  experienceReturnTo: `/experiences?${params}`,
                                }}
                              >
                                阅读全文
                                <ArrowRight size={15} />
                              </Link>
                            </footer>
                          </article>
                        );
                      })}
                  </div>
                )}
                <PageNav
                  page={page}
                  meta={remote.data.page}
                  onPage={(value) => {
                    const next = new URLSearchParams(params);
                    next.set("page", String(value));
                    setParams(next);
                  }}
                />
              </>
            )}
          </ReadingState>
        </section>
        <aside className="experience-browse-aside">
          <h2>读面经，也留一份复盘</h2>
          <p>优先关注与你的目标公司、岗位方向和面试轮次接近的经历。</p>
          <ul>
            <li>了解面试流程和考察重点</li>
            <li>结合问题回顾自己的准备</li>
            <li>在评论中补充观点与疑问</li>
          </ul>
          <div className="experience-aside-note">
            <h3>关于分享</h3>
            <p>
              面经保存为私人草稿，提交审核通过后才会公开。自己的稿件和审核进度可在投稿页查看。
            </p>
            {viewer?.role === "USER" && (
              <Link to="/experiences/submissions">
                管理我的面经
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
export function ExperienceArticle({
  item,
  owner,
  comments,
  returnTo,
}: {
  item: Schema<"Experience">;
  owner: string | null;
  comments: ReactNode;
  returnTo: string;
}) {
  const companies = useExperienceCompanies(),
    company = companies.data.find((c) => c.id === item.companyId);
  const mode = {
    ORIGINAL: "原创面经",
    AUTHORIZED_FULL: "授权转载",
    EXCERPT_LINK: "摘录与原文链接",
  }[item.contentMode];
  const safeSource =
    item.sourceUrl &&
    /^https?:\/\//i.test(item.sourceUrl) &&
    !/[\u0000-\u0020\\]/.test(item.sourceUrl)
      ? item.sourceUrl
      : null;
  return (
    <>
      <Link className="experience-back" to={returnTo}>
        <ArrowLeft size={16} />
        返回面经广场
      </Link>
      <div className="experience-detail-layout">
        <div className="experience-detail-main">
          <article className="experience-article">
            <header className="experience-article-heading">
              <div className="experience-item-meta">
                <span>
                  {company?.name ??
                    (item.companyId ? "公司信息待获取" : "未关联公司")}
                </span>
                <span className="experience-round">
                  {experienceRoundLabel(item.roundType)}
                </span>
              </div>
              <h1>{item.title}</h1>
              <p>
                {experienceRoleLabel(item.role)}
                <span className="experience-meta-dot">·</span>
                {mode}
                <span className="experience-meta-dot">·</span>
                <time dateTime={item.updatedAt}>
                  {experienceDate(item.updatedAt)} 更新
                </time>
              </p>
              {!!item.tags.length && (
                <div className="experience-tags">
                  {item.tags.map((tag, index) => (
                    <span key={`${tag}:${index}`}>{tag}</span>
                  ))}
                </div>
              )}
            </header>
            {item.summary && (
              <section className="experience-summary" id="experience-summary">
                <h2>经历摘要</h2>
                <p>{item.summary}</p>
              </section>
            )}
            <section className="experience-prose" id="experience-body">
              <h2>面经正文</h2>
              <HandbookMarkdown body={item.bodyMd} />
            </section>
            <footer className="experience-source">
              <h2>内容来源</h2>
              <p>{item.licenseNote || mode}</p>
              {safeSource && (
                <a href={safeSource} target="_blank" rel="noreferrer">
                  查看原文来源
                  <ArrowRight size={14} />
                </a>
              )}
            </footer>
          </article>
          {comments}
        </div>
        <aside className="experience-detail-aside">
          <section>
            <h2>面试信息</h2>
            <dl>
              <div>
                <dt>公司</dt>
                <dd>
                  {company ? (
                    <Link to={`/company/${company.id}`}>{company.name}</Link>
                  ) : item.companyId ? (
                    "公司信息待获取"
                  ) : (
                    "未关联公司"
                  )}
                </dd>
              </div>
              <div>
                <dt>岗位方向</dt>
                <dd>{experienceRoleLabel(item.role)}</dd>
              </div>
              <div>
                <dt>面试轮次</dt>
                <dd>{experienceRoundLabel(item.roundType)}</dd>
              </div>
              <div>
                <dt>面试日期</dt>
                <dd>{experienceDate(item.occurredOn, true)}</dd>
              </div>
            </dl>
          </section>
          <nav aria-label="面经页内导航">
            <h2>本页内容</h2>
            {item.summary && <a href="#experience-summary">经历摘要</a>}
            <a href="#experience-body">面经正文</a>
            <a href="#experience-discussion">
              <MessageSquare size={14} />
              评论与交流
            </a>
          </nav>
          {!!owner && owner === item.authorId && (
            <section className="experience-author-tools">
              <h2>这是你的面经</h2>
              <p>编辑稿件或跟进审核进度，请前往个人投稿页。</p>
              <Link
                className="button button-secondary"
                to="/experiences/submissions"
              >
                到我的面经投稿管理
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

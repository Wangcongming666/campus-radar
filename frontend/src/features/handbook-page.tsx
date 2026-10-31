import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FilePenLine,
  Search,
} from "lucide-react";
import { apiRequest, ApiError } from "../api/auth";
import { useAccount } from "../app/api-shell";
import type { components } from "../api/generated";
import { useApi, mutate } from "../components/api-ui";
import { Button, Empty, PageHeader } from "../components/ui";
import "./handbook.css";

type Chapter = components["schemas"]["Chapter"];
type Progress = components["schemas"]["ChapterProgress"];
type Draft = {
  note: string;
  completed: boolean;
  version: number;
  chapterVersion: number;
  savedNote: string;
  savedCompleted: boolean;
};
const isDirty = (draft: Draft) =>
  draft.note !== draft.savedNote || draft.completed !== draft.savedCompleted;
// Only unsaved work lives here. It survives SPA navigation, never leaves browser memory,
// and is removed on account changes. No private notes are written to localStorage.
const pendingDrafts = new Map<string, Draft>();
let draftOwnerId: string | null = null;
function guardUnload(event: BeforeUnloadEvent) {
  if (pendingDrafts.size) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", guardUnload);
window.addEventListener("campus:account-changed", () => {
  pendingDrafts.clear();
  draftOwnerId = null;
});

function fromProgress(progress: Progress | null, chapter: Chapter): Draft {
  return {
    note: progress?.note ?? "",
    completed: progress?.completed ?? false,
    version: progress?.version ?? 0,
    chapterVersion: chapter.contentVersion,
    savedNote: progress?.note ?? "",
    savedCompleted: progress?.completed ?? false,
  };
}

function safeHref(value: string) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value) &&
    !/[\u0000-\u0020\\]/.test(value)
    ? value
    : null;
}
function inline(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g)
    .map((part, index) => {
      if (part.startsWith("`"))
        return <code key={index}>{part.slice(1, -1)}</code>;
      if (part.startsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const href = safeHref(link[2]);
        return href ? (
          <a key={index} href={href}>
            {link[1]}
          </a>
        ) : (
          <span key={index}>{link[1]}</span>
        );
      }
      return part;
    });
}

/** A deliberately small, text-only Markdown renderer. Raw HTML stays escaped. */
export function HandbookMarkdown({ body }: { body: string }) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = i;
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const content = inline(heading[2]);
      blocks.push(
        heading[1].length <= 2 ? (
          <h2 key={key}>{content}</h2>
        ) : (
          <h3 key={key}>{content}</h3>
        ),
      );
      i++;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]))
        quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={key}>{inline(quote.join("\n"))}</blockquote>,
      );
      continue;
    }
    const list = /^\s*(?:([-+*])|(\d+)\.)\s+/.exec(line);
    if (list) {
      const ordered = !!list[2];
      const items: ReactNode[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\.\s+/ : /^\s*[-+*]\s+/).test(lines[i])
      ) {
        items.push(
          <li key={i}>
            {inline(lines[i++].replace(/^\s*(?:[-+*]|\d+\.)\s+/, ""))}
          </li>,
        );
      }
      blocks.push(
        ordered ? (
          <ol key={key} start={Number(list[2])}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        ),
      );
      continue;
    }
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(?:#{1,6}\s|```|>|[-+*]\s|\d+\.\s|([-*_])(?:\s*\1){2,}\s*$)/.test(
        lines[i],
      )
    )
      paragraph.push(lines[i++]);
    blocks.push(
      <p key={key}>
        {paragraph.map((text, index) => (
          <span key={index}>
            {index > 0 && <br />}
            {inline(text)}
          </span>
        ))}
      </p>,
    );
  }
  return <div className="handbook-prose">{blocks}</div>;
}

export function ApiHandbookPage() {
  const account = useAccount();
  const ownerId = account.user?.role === "USER" ? account.user.id : null;
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const remote = useApi<Chapter[]>("/api/v1/handbook/chapters");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [draftState, setDraftState] = useState<{
    ownerId: string | null;
    entries: Record<string, Draft>;
  }>(() => ({
    ownerId,
    entries: draftOwnerId === ownerId ? Object.fromEntries(pendingDrafts) : {},
  }));
  const drafts = draftState.ownerId === ownerId ? draftState.entries : {};
  const [progressState, setProgressState] = useState<{
    chapterId: string;
    ownerId: string | null;
    loading: boolean;
    error: string;
  }>({ chapterId: "", ownerId: null, loading: false, error: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    chapterId: string;
    error?: string;
    success?: string;
    conflict?: boolean;
    server?: Progress;
  }>({ chapterId: "" });
  const [loadTick, setLoadTick] = useState(0);
  const generation = useRef(0);
  const savingRef = useRef(false);
  const chapters = [...(remote.data ?? [])].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-CN"),
  );
  const requestedId = params.get("chapter");
  const selected =
    chapters.find((chapter) => chapter.id === requestedId) ??
    (requestedId ? undefined : chapters[0]);
  const index = selected
    ? chapters.findIndex((chapter) => chapter.id === selected.id)
    : -1;
  const draft = selected ? drafts[selected.id] : undefined;
  const currentFeedback = feedback.chapterId === selected?.id ? feedback : null;
  const progressReady =
    progressState.ownerId === ownerId &&
    progressState.chapterId === selected?.id &&
    !progressState.loading &&
    !progressState.error;
  const filtered = chapters.filter((chapter) =>
    `${chapter.title} ${chapter.direction}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  const updateDraft = useCallback(
    (id: string, next: Draft) => {
      if (!ownerId || ownerRef.current !== ownerId || draftOwnerId !== ownerId)
        return;
      if (isDirty(next)) pendingDrafts.set(id, next);
      else pendingDrafts.delete(id);
      setDraftState((previous) => ({
        ownerId,
        entries: {
          ...(previous.ownerId === ownerId ? previous.entries : {}),
          [id]: next,
        },
      }));
    },
    [ownerId],
  );

  useEffect(() => {
    if (!requestedId && chapters[0]) {
      const next = new URLSearchParams(params);
      next.set("chapter", chapters[0].id);
      setParams(next, { replace: true });
    }
  }, [requestedId, remote.data, params, setParams]);

  useEffect(() => {
    generation.current++;
    if (draftOwnerId !== ownerId) pendingDrafts.clear();
    draftOwnerId = ownerId;
    setDraftState({ ownerId, entries: Object.fromEntries(pendingDrafts) });
    setFeedback({ chapterId: "" });
    savingRef.current = false;
    setSaving(null);
    return () => {
      generation.current++;
    };
  }, [ownerId]);

  useEffect(() => {
    const clear = () => {
      generation.current++;
      pendingDrafts.clear();
      draftOwnerId = ownerRef.current;
      setDraftState({ ownerId: ownerRef.current, entries: {} });
      setFeedback({ chapterId: "" });
      savingRef.current = false;
      setSaving(null);
      setLoadTick((value) => value + 1);
    };
    window.addEventListener("campus:account-changed", clear);
    return () => window.removeEventListener("campus:account-changed", clear);
  }, []);

  useEffect(() => {
    if (!selected || !ownerId) return;
    const chapter = selected;
    const controller = new AbortController();
    const ticket = generation.current;
    setProgressState({
      ownerId,
      chapterId: chapter.id,
      loading: true,
      error: "",
    });
    apiRequest<Progress>(
      `/api/v1/handbook/progress/${encodeURIComponent(chapter.id)}`,
      { signal: controller.signal },
    )
      .then((progress) => {
        if (controller.signal.aborted || ticket !== generation.current) return;
        const retained = pendingDrafts.get(chapter.id);
        updateDraft(chapter.id, retained ?? fromProgress(progress, chapter));
        setProgressState({
          ownerId,
          chapterId: chapter.id,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || ticket !== generation.current) return;
        if (error instanceof ApiError && error.status === 404) {
          updateDraft(
            chapter.id,
            pendingDrafts.get(chapter.id) ?? fromProgress(null, chapter),
          );
          setProgressState({
            ownerId,
            chapterId: chapter.id,
            loading: false,
            error: "",
          });
        } else
          setProgressState({
            ownerId,
            chapterId: chapter.id,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "学习记录加载失败，请重试。",
          });
      });
    return () => controller.abort();
  }, [selected?.id, ownerId, loadTick, updateDraft]);

  function openChapter(id: string) {
    const next = new URLSearchParams(params);
    next.set("chapter", id);
    setParams(next);
    setDirectoryOpen(false);
    document
      .getElementById("handbook-reading")
      ?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  async function save() {
    if (!selected || !draft || !progressReady || savingRef.current) return;
    const chapter = selected;
    const snapshot = { ...draft };
    const ticket = generation.current;
    savingRef.current = true;
    setSaving(chapter.id);
    setFeedback({ chapterId: chapter.id });
    try {
      const progress = await mutate<Progress>(
        `/api/v1/handbook/progress/${encodeURIComponent(chapter.id)}`,
        "PUT",
        {
          version: snapshot.version,
          completed: snapshot.completed,
          note: snapshot.note,
          chapterVersion: snapshot.chapterVersion,
        },
      );
      if (ticket !== generation.current) return;
      // Inputs are disabled while this chapter is saving, so only confirmed data becomes the baseline.
      updateDraft(chapter.id, fromProgress(progress, chapter));
      setFeedback({ chapterId: chapter.id, success: "笔记与完成状态已保存。" });
    } catch (error) {
      if (ticket !== generation.current) return;
      const conflict = error instanceof ApiError && error.status === 409;
      setFeedback({
        chapterId: chapter.id,
        error: conflict
          ? "记录已有更新，你的草稿已保留。请先查看服务器记录。"
          : error instanceof Error
            ? error.message
            : "保存失败，草稿已保留，请重试。",
        conflict,
      });
    } finally {
      if (ticket === generation.current) {
        savingRef.current = false;
        setSaving(null);
      }
    }
  }

  async function compareServer() {
    if (!selected) return;
    const chapterId = selected.id;
    const ticket = generation.current;
    try {
      const server = await apiRequest<Progress>(
        `/api/v1/handbook/progress/${encodeURIComponent(chapterId)}`,
      );
      if (ticket === generation.current)
        setFeedback((previous) => ({
          ...previous,
          chapterId,
          server,
        }));
    } catch (error) {
      if (ticket === generation.current)
        setFeedback((previous) => ({
          ...previous,
          chapterId,
          error:
            error instanceof Error
              ? error.message
              : "无法读取服务器记录，请重试。",
        }));
    }
  }

  return (
    <div className="handbook-page stack">
      <PageHeader
        title="求职宝典"
        description="从准备到面试，按章节梳理你的求职思路。"
        actions={
          <span className="handbook-published">
            <BookOpen aria-hidden="true" />
            {remote.data ? `${chapters.length} 个已发布章节` : "章节阅读"}
          </span>
        }
      />
      {remote.loading ? (
        <div className="handbook-loading" role="status">
          <div />
          <div />
          <div />
          <p>正在加载章节…</p>
        </div>
      ) : remote.error ? (
        <div className="handbook-notice" role="alert">
          <p>{remote.error}</p>
          <Button onClick={remote.refresh}>重新加载章节</Button>
        </div>
      ) : chapters.length === 0 ? (
        <Empty
          title="暂无已发布章节"
          description="章节发布后会显示在这里。"
          action={<Button onClick={remote.refresh}>刷新章节</Button>}
        />
      ) : (
        <div className="handbook-layout">
          <aside className="handbook-directory" aria-label="章节目录">
            <button
              className="handbook-directory-toggle"
              aria-expanded={directoryOpen}
              onClick={() => setDirectoryOpen(!directoryOpen)}
            >
              <span>
                <BookOpen aria-hidden="true" />
                章节目录
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
            <div
              className={`handbook-directory-content ${directoryOpen ? "is-open" : ""}`}
            >
              <div className="handbook-directory-heading">
                <h2>章节目录</h2>
                <span>{chapters.length} 章</span>
              </div>
              <label className="handbook-search">
                <Search aria-hidden="true" />
                <input
                  aria-label="搜索章节"
                  placeholder="搜索章节或方向"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <nav aria-label="宝典章节">
                {filtered.map((chapter) => {
                  const record = drafts[chapter.id];
                  const chapterIndex = chapters.findIndex(
                    (item) => item.id === chapter.id,
                  );
                  return (
                    <button
                      key={chapter.id}
                      className={`handbook-chapter ${selected?.id === chapter.id ? "is-current" : ""}`}
                      aria-current={
                        selected?.id === chapter.id ? "page" : undefined
                      }
                      onClick={() => openChapter(chapter.id)}
                    >
                      <span className="handbook-chapter-number">
                        {String(chapterIndex + 1).padStart(2, "0")}
                      </span>
                      <span className="handbook-chapter-text">
                        <strong>{chapter.title}</strong>
                        <small>
                          {chapter.direction}
                          {record && isDirty(record)
                            ? " · 有未保存更改"
                            : record?.savedCompleted
                              ? " · 已完成"
                              : ""}
                        </small>
                      </span>
                      {record?.savedCompleted && <Check aria-label="已完成" />}
                    </button>
                  );
                })}
              </nav>
              {filtered.length === 0 && (
                <div className="handbook-no-results">
                  <p>没有匹配的章节</p>
                  <Button variant="ghost" onClick={() => setQuery("")}>
                    清空搜索
                  </Button>
                </div>
              )}
              <p className="handbook-directory-hint">
                按顺序阅读，也可直接选择需要的章节。
              </p>
            </div>
          </aside>
          <div className="handbook-workspace" id="handbook-reading">
            {!selected ? (
              <Empty
                title="这个章节暂不可用"
                description="章节可能已下线，请从目录选择其他章节。"
                action={
                  <Button onClick={() => openChapter(chapters[0].id)}>
                    阅读第一章
                  </Button>
                }
              />
            ) : (
              <>
                <article
                  className="handbook-article"
                  aria-labelledby="handbook-chapter-title"
                >
                  <header className="handbook-article-heading">
                    <div className="handbook-article-meta">
                      <span>
                        第 {index + 1} / {chapters.length} 章
                      </span>
                      <span>{selected.direction}</span>
                      {draft?.savedCompleted && (
                        <span className="handbook-completed">
                          <Check aria-hidden="true" />
                          已完成
                        </span>
                      )}
                    </div>
                    <h2 id="handbook-chapter-title">{selected.title}</h2>
                    <p>
                      更新于{" "}
                      {new Date(selected.updatedAt).toLocaleDateString("zh-CN")}
                    </p>
                  </header>
                  {selected.bodyMd.trim() ? (
                    <HandbookMarkdown body={selected.bodyMd} />
                  ) : (
                    <p className="handbook-empty-body">本章正文暂未提供。</p>
                  )}
                  <nav className="handbook-pagination" aria-label="章节翻页">
                    <Button
                      disabled={index === 0}
                      onClick={() => openChapter(chapters[index - 1].id)}
                    >
                      <ArrowLeft aria-hidden="true" />
                      <span>
                        上一章
                        {index > 0 && (
                          <small>{chapters[index - 1].title}</small>
                        )}
                      </span>
                    </Button>
                    <Button
                      disabled={index === chapters.length - 1}
                      onClick={() => openChapter(chapters[index + 1].id)}
                    >
                      <span>
                        下一章
                        {index < chapters.length - 1 && (
                          <small>{chapters[index + 1].title}</small>
                        )}
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </nav>
                </article>
                <section
                  className="handbook-notes"
                  aria-labelledby="handbook-notes-title"
                >
                  <header>
                    <div>
                      <h2 id="handbook-notes-title">
                        <FilePenLine aria-hidden="true" />
                        {ownerId ? "我的章节笔记" : "章节笔记"}
                      </h2>
                      {ownerId && (
                        <p>仅自己可见。切换章节时，未保存的草稿会保留。</p>
                      )}
                    </div>
                    {draft && (
                      <span
                        className={`handbook-note-status ${isDirty(draft) ? "is-unsaved" : ""}`}
                      >
                        {isDirty(draft) ? "有未保存更改" : "与服务器同步"}
                      </span>
                    )}
                  </header>
                  {!account.user && account.loading ? (
                    <p className="handbook-note-loading" role="status">
                      正在确认登录状态…
                    </p>
                  ) : !account.user && account.error ? (
                    <div className="handbook-notice" role="alert">
                      <p>{account.error}</p>
                      <Button onClick={account.refresh}>重试确认账号</Button>
                    </div>
                  ) : !account.user ? (
                    <div className="handbook-notice">
                      <p>登录后可保存私人笔记和完成状态。</p>
                      <Link
                        className="button button-primary button-md"
                        to={`/login?returnTo=${encodeURIComponent(`/handbook?${params.toString()}`)}`}
                      >
                        登录并继续阅读
                      </Link>
                    </div>
                  ) : !ownerId ? (
                    <p className="handbook-note-loading">
                      当前管理身份可阅读公开章节，不提供个人笔记和完成状态。
                    </p>
                  ) : progressState.ownerId !== ownerId ||
                    progressState.chapterId !== selected.id ||
                    progressState.loading ? (
                    <p className="handbook-note-loading" role="status">
                      正在读取你的学习记录…
                    </p>
                  ) : progressState.error ? (
                    <div className="handbook-notice" role="alert">
                      <p>{progressState.error}</p>
                      <Button onClick={() => setLoadTick((value) => value + 1)}>
                        重试读取记录
                      </Button>
                    </div>
                  ) : (
                    draft && (
                      <>
                        <label
                          className="handbook-note-label"
                          htmlFor="handbook-note"
                        >
                          记下本章的要点、疑问或行动计划
                        </label>
                        <textarea
                          id="handbook-note"
                          className="input handbook-note-input"
                          rows={6}
                          placeholder="例如：下一次修改简历时，我需要……"
                          value={draft.note}
                          maxLength={20000}
                          disabled={saving === selected.id}
                          onChange={(event) => {
                            updateDraft(selected.id, {
                              ...draft,
                              note: event.target.value,
                            });
                            setFeedback({ chapterId: selected.id });
                          }}
                        />
                        <div className="handbook-note-tools">
                          <label className="handbook-complete-control">
                            <input
                              type="checkbox"
                              checked={draft.completed}
                              disabled={saving === selected.id}
                              onChange={(event) => {
                                updateDraft(selected.id, {
                                  ...draft,
                                  completed: event.target.checked,
                                });
                                setFeedback({ chapterId: selected.id });
                              }}
                            />
                            标记本章已完成
                          </label>
                          <span>
                            {draft.note.length.toLocaleString()} / 20,000
                          </span>
                        </div>
                        {currentFeedback?.error && (
                          <div
                            className="handbook-notice handbook-error"
                            role="alert"
                          >
                            <p>{currentFeedback.error}</p>
                            {currentFeedback.conflict && (
                              <Button onClick={() => void compareServer()}>
                                查看服务器记录
                              </Button>
                            )}
                          </div>
                        )}
                        {currentFeedback?.server && (
                          <div className="handbook-conflict">
                            <h3>
                              服务器记录 ·{" "}
                              {currentFeedback.server.completed
                                ? "已完成"
                                : "未完成"}
                            </h3>
                            <p>
                              {currentFeedback.server.note || "（没有笔记）"}
                            </p>
                            <div className="handbook-conflict-actions">
                              <Button
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "载入服务器记录会替换本章尚未保存的草稿，确定继续吗？",
                                    )
                                  ) {
                                    updateDraft(
                                      selected.id,
                                      fromProgress(
                                        currentFeedback.server!,
                                        selected,
                                      ),
                                    );
                                    setFeedback({
                                      chapterId: selected.id,
                                      success: "已载入服务器记录。",
                                    });
                                  }
                                }}
                              >
                                载入服务器记录
                              </Button>
                              <Button
                                onClick={() => {
                                  updateDraft(selected.id, {
                                    ...draft,
                                    version: currentFeedback.server!.version,
                                    chapterVersion: selected.contentVersion,
                                  });
                                  setFeedback({ chapterId: selected.id });
                                }}
                              >
                                保留我的草稿，使用最新版本重试
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="handbook-note-footer">
                          <p role="status">
                            {currentFeedback?.success ??
                              (isDirty(draft)
                                ? "更改尚未保存到账号。"
                                : "笔记和完成状态一起保存到你的账号。")}
                          </p>
                          <Button
                            variant="primary"
                            disabled={
                              saving !== null ||
                              !isDirty(draft) ||
                              !!currentFeedback?.conflict
                            }
                            onClick={() => void save()}
                          >
                            {saving === selected.id
                              ? "正在保存…"
                              : "保存学习记录"}
                          </Button>
                        </div>
                      </>
                    )
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

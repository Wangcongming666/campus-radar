import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui";
import { startVisiblePolling } from "./social-visible-polling";
import "./admin-moderation-sync.css";

export const moderationTypes = {
  POST: "社区动态",
  EXPERIENCE: "面经",
  SALARY: "薪资样本",
  REFERRAL: "内推资源",
  JOB: "岗位",
  QUESTION: "题目",
  CHAPTER: "宝典章节",
  SIGNAL: "公司情报",
} as const;
export function useModerationCount(owner: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    total: number | null;
    at: string;
    error: string;
    syncing: boolean;
  }>({ total: null, at: "", error: "", syncing: true });
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    async function read() {
      if (document.hidden || !active) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setState((previous) => ({ ...previous, syncing: true }));
      try {
        // Total comes from metadata, never the length of a single page.
        const response = await fetch("/api/v1/admin/moderation?page=1&size=1", {
          credentials: "same-origin",
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error("待审数量暂未同步，请重试。");
        const body = await response.json();
        if (!Number.isInteger(body.page?.total) || body.page.total < 0)
          throw new Error("待审数量暂未同步，请重试。");
        if (active && !request.signal.aborted)
          setState({
            total: body.page.total,
            at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
            error: "",
            syncing: false,
          });
      } catch (reason) {
        if (active && !request.signal.aborted)
          setState({
            total: null,
            at: "",
            error:
              reason instanceof Error
                ? reason.message
                : "待审数量暂未同步，请重试。",
            syncing: false,
          });
      }
    }
    void read();
    const stop = startVisiblePolling(() => void read());
    const focus = () => void read();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      controller?.abort();
      stop();
      window.removeEventListener("focus", focus);
    };
  }, [owner, revision]);
  return {
    ...state,
    refresh: useCallback(() => setRevision((v) => v + 1), []),
  };
}
export function ModerationSyncNotice({
  state,
  busy,
  onOpen,
  onRefresh,
}: {
  state: ReturnType<typeof useModerationCount>;
  busy: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="admin-review-sync" aria-label="待审核同步">
      <div>
        <h2>
          待审核内容{" "}
          <span aria-live="polite">
            {state.total === null ? "待确认" : `${state.total} 条`}
          </span>
        </h2>
        <p>动态、面经、薪资与内推等内容，统一在“内容审核”处理。</p>
        {state.error ? (
          <p className="admin-review-sync-error" role="alert">
            {state.error}
          </p>
        ) : (
          <p className="admin-review-sync-time">
            {state.at
              ? `最近同步 ${state.at} · 页面可见时每 10 秒更新`
              : "正在同步待审数量…"}
          </p>
        )}
      </div>
      <div className="admin-review-sync-actions">
        <Button variant="primary" disabled={busy} onClick={onOpen}>
          查看待审核内容
        </Button>
        <Button onClick={onRefresh} disabled={busy || state.syncing}>
          {state.syncing ? "正在同步…" : "同步审核状态"}
        </Button>
      </div>
    </section>
  );
}

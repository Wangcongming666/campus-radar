import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/auth";
import { fetchBoard, fetchArchived, fetchApplicationHistory, moveApplication, patchApplication, stageLabels, undoApplication, type Application, type ApplicationMutation, type ApplicationStage, type Board } from "../api/applications";
import type { components } from "../api/generated";
import { Button, Modal, PageHeader, Panel } from "../components/ui";
import "./workspace.css";

type LastMove = { id: string; version: number; boardVersion: number; operationId: string };
type StageEvent = components["schemas"]["StageEvent"];
const reasonLabels = { REJECTED: "未通过", WITHDRAWN: "主动撤回", EXPIRED: "招聘结束", ACCEPTED: "已接受 Offer", OTHER: "其他" } as const;

export function ApiPipelinePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [archived, setArchived] = useState<Application[]>([]);
  const [archiveView, setArchiveView] = useState(false);
  const [archivePage, setArchivePage] = useState(1);
  const [selected, setSelected] = useState<Application | null>(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<StageEvent[]>([]);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<{ app: Application; beforeId?: string | null; afterId?: string | null } | null>(null);
  const [reason, setReason] = useState<keyof typeof reasonLabels>("REJECTED");
  async function refresh() {
    const [next, old] = await Promise.all([fetchBoard(), archiveView ? fetchArchived(archivePage) : Promise.resolve([])]);
    setBoard(next); setArchived(old);
    setSelected(previous => previous ? [...next.items, ...old].find(app => app.id === previous.id) ?? previous : null);
  }
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError("");
    Promise.all([fetchBoard(abort.signal), archiveView ? fetchArchived(archivePage, abort.signal) : Promise.resolve([])])
      .then(([next, old]) => { setBoard(next); setArchived(old); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [archiveView, archivePage]);
  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    const abort = new AbortController();
    fetchApplicationHistory(selected.id, abort.signal).then(setHistory).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [selected?.id, selected?.version]);
  function open(app: Application) { setSelected(app); setDraft(app.notes); setError(""); setMessage(""); }
  async function mutate(work: () => Promise<ApplicationMutation>, success: string, rememberMove = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await work();
      if (rememberMove && result.operationId) setLastMove({ id: result.application.id, version: result.application.version, boardVersion: result.boardVersion, operationId: result.operationId });
      else if (!rememberMove) setLastMove(null);
      setSelected(previous => previous?.id === result.application.id ? result.application : previous);
      await refresh(); setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
      if (e instanceof ApiError && e.status === 409) { setLastMove(null); await refresh().catch(() => undefined); }
    } finally { setBusy(false); }
  }
  function move(app: Application, stage: ApplicationStage, beforeId?: string | null, afterId?: string | null, closedReason?: keyof typeof reasonLabels) {
    if (!board || busy) return;
    if (stage === "CLOSED" && !closedReason) { setClosing({ app, beforeId, afterId }); return; }
    void mutate(() => moveApplication(app.id, { version: app.version, boardVersion: board.boardVersion, stage, beforeId, afterId, closedReason: closedReason ?? null }), "投递位置已更新。", true);
  }
  const visible = (archiveView ? archived : board?.items ?? []).filter(app => `${app.job.title} ${app.job.company.name} ${app.notes}`.toLowerCase().includes(query.toLowerCase()));
  function card(app: Application) {
    const column = board?.items.filter(item => item.stage === app.stage) ?? [];
    const index = column.findIndex(item => item.id === app.id);
    return <article key={app.id} className="ws-application" draggable={!busy && !archiveView} onDragStart={event => event.dataTransfer.setData("text/plain", app.id)}
      onDragOver={event => { if (!archiveView) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); const dragged = board?.items.find(item => item.id === event.dataTransfer.getData("text/plain")); if (dragged && dragged.id !== app.id) move(dragged, app.stage, app.id); }}>
      <p className="small muted">{app.job.company.name}</p>
      <Button variant="ghost" onClick={() => open(app)} style={{ textAlign: "left", whiteSpace: "normal" }}>{app.job.title}</Button>
      <p className="small muted">{app.job.cities.join("、") || "城市未注明"}</p>
      {app.notes && <p className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{app.notes.slice(0, 100)}</p>}
      {archiveView ? <Button disabled={busy} onClick={() => void mutate(() => patchApplication(app.id, { version: app.version, archived: false }), "投递已恢复到看板。")}>恢复投递</Button> : <>
        <select className="input" aria-label={`移动 ${app.job.title} 到阶段`} disabled={busy} value={app.stage} onChange={e => move(app, e.target.value as ApplicationStage)}>{board?.columns.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select>
        <div className="row"><Button size="sm" disabled={busy || index <= 0} aria-label={`上移 ${app.job.title}`} onClick={() => move(app, app.stage, column[index - 1].id)}>上移</Button><Button size="sm" disabled={busy || index === column.length - 1} aria-label={`下移 ${app.job.title}`} onClick={() => move(app, app.stage, null, column[index + 1].id)}>下移</Button></div>
      </>}
    </article>;
  }
  return <div className="page-content">
    <PageHeader title="投递看板" description="拖动卡片调整顺序，或使用阶段菜单与上移、下移按钮。" actions={<Link className="button button-primary button-md" to="/jobs">添加投递</Link>} />
    {board && <dl className="pipeline-summary" aria-label="投递统计" aria-live="polite">
      <div className="pipeline-summary-total"><dt>总投递</dt><dd>{board.stats.total}<span>条</span></dd></div>
      <div className="pipeline-summary-applied"><dt>已投递</dt><dd>{board.stats.applied}</dd></div>
      <div className="pipeline-summary-interviewing"><dt>面试中</dt><dd>{board.stats.interviewing}</dd></div>
      <div className="pipeline-summary-offers"><dt>Offer</dt><dd>{board.stats.offers}</dd></div>
    </dl>}
    <div className="pipeline-toolbar"><Button variant={!archiveView ? "primary" : "secondary"} onClick={() => setArchiveView(false)}>进行中</Button><Button variant={archiveView ? "primary" : "secondary"} onClick={() => setArchiveView(true)}>已归档</Button><input className="input" aria-label="搜索投递" placeholder="搜索公司、岗位或笔记" value={query} onChange={e => setQuery(e.target.value)} /><Button disabled={busy || loading} onClick={() => { setLoading(true); refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>刷新</Button></div>
    {error && <p role="alert">{error}{error.includes("登录") && <> <Link to="/login?returnTo=%2Fpipeline">前往登录</Link></>}</p>}
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">正在加载投递…</p>}
    {board?.truncated && <p role="status">看板仅显示前 500 条投递，可归档暂不跟进的投递。</p>}
    {lastMove && !archiveView && <div className="ws-undo"><span>阶段与排序已保存，十分钟内可撤销最近一次操作。</span><Button disabled={busy || lastMove.boardVersion !== board?.boardVersion} onClick={() => void mutate(() => undoApplication(lastMove.id, { version: lastMove.version, boardVersion: lastMove.boardVersion, operationId: lastMove.operationId }), "已撤销最近操作。")}>撤销</Button></div>}
    {!loading && board && (archiveView ? <><div className="stack">{visible.map(card)}</div>{visible.length === 0 && <Panel><p>没有符合条件的归档投递。</p></Panel>}<div className="row"><Button disabled={archivePage === 1} onClick={() => setArchivePage(page => page - 1)}>上一页</Button><span>第 {archivePage} 页</span><Button disabled={archived.length < 20} onClick={() => setArchivePage(page => page + 1)}>下一页</Button></div></> : <>
      {board.items.length === 0 && <Panel><p>还没有投递记录。<Link to="/jobs">去岗位广场添加第一条投递</Link>。</p></Panel>}
      <div className="ws-board" aria-label="八阶段投递看板">{board.columns.map(stage => <section key={stage} className="ws-column" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const app = board.items.find(item => item.id === e.dataTransfer.getData("text/plain")); if (app) move(app, stage); }}><h2>{stageLabels[stage]}<span className="ws-column-count">{visible.filter(app => app.stage === stage).length}</span></h2><div className="ws-column-cards">{visible.filter(app => app.stage === stage).map(card)}</div></section>)}</div>
    </>)}
    <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.job.company.name} · ${selected.job.title}` : "投递详情"} size="drawer">
      {selected && <div className="stack"><p>{stageLabels[selected.stage]} · 版本 {selected.version}</p>{selected.closedReason && <p>结束原因：{reasonLabels[selected.closedReason]}</p>}
        <form className="stack" onSubmit={e => { e.preventDefault(); void mutate(() => patchApplication(selected.id, { version: selected.version, notes: draft }), "跟进笔记已保存。"); }}>
          <label htmlFor="api-application-notes">跟进笔记</label><textarea id="api-application-notes" className="input textarea" maxLength={20000} value={draft} onChange={e => setDraft(e.target.value)} rows={10} />
          <p className="small muted">保存失败时会保留当前草稿；发生冲突后可核对最新版本再保存。</p><Button type="submit" variant="primary" disabled={busy || selected.notes === draft}>保存笔记</Button>
        </form>
        <Button disabled={busy} onClick={() => void mutate(() => patchApplication(selected.id, { version: selected.version, archived: !selected.archivedAt }), selected.archivedAt ? "投递已恢复。" : "投递已归档。")}>{selected.archivedAt ? "恢复到看板" : "归档投递"}</Button>
        <Link to={`/jobs/${selected.job.id}`}>查看岗位</Link>
        <h3>阶段历史</h3>{history.length ? <ol>{history.map(event => <li key={event.id}>{event.fromStage ? stageLabels[event.fromStage] : "添加投递"} → {stageLabels[event.toStage]}<p className="small muted">{new Date(event.occurredAt).toLocaleString()}</p></li>)}</ol> : <p className="muted">暂无阶段变更。</p>}
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      </div>}
    </Modal>
    <Modal open={!!closing} onClose={() => setClosing(null)} title="结束这次投递"><label htmlFor="close-application-reason">结束原因</label><select id="close-application-reason" className="input" value={reason} onChange={e => setReason(e.target.value as keyof typeof reasonLabels)}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="primary" disabled={busy} onClick={() => { if (closing) { move(closing.app, "CLOSED", closing.beforeId, closing.afterId, reason); setClosing(null); } }}>确认结束</Button></Modal>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../api/auth";
import type { components } from "../api/generated";
import { Button, PageHeader, Panel } from "../components/ui";
import { PracticeSetup, type PracticeInput } from "./PracticeSetup";
import "./workspace.css";

type Session = components["schemas"]["MockSession"];
type Answer = components["schemas"]["MockAnswer"];
type Question = components["schemas"]["Question"];
type Draft = { text: string; score: string };
const base = "/api/v1/mock-sessions";
const stateNames: Record<Session["state"], string> = { ACTIVE: "进行中", PAUSED: "已暂停", SUBMITTED: "已提交", COMPLETED: "已完成" };
function clockText(value: number) { return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`; }

async function loadQuestionBanks(signal: AbortSignal): Promise<Question[]> {
  const questions: Question[] = [];
  for (let page = 1; page <= 500; page++) {
    const batch = await apiRequest<Question[]>(`/api/v1/questions?page=${page}&size=100`, { signal });
    questions.push(...batch);
    if (batch.length < 100) return questions;
  }
  throw new Error("题库数量较多，暂时无法完整载入，请稍后重试。");
}

export function ApiMockPage() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [session, setSession] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [answerIndex, setAnswerIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const timerMark = useRef({ received: performance.now(), remaining: 0 });
  const pendingOperation = useRef<{ signature: string; key: string } | null>(null);
  function received(next: Session) { timerMark.current = { received: performance.now(), remaining: next.remainingSeconds }; setTick(performance.now()); setSession(next); }
  async function refreshSessions() { setSessions(await apiRequest<Session[]>(`${base}?page=${historyPage}&size=20`)); }
  function operationKey(signature: string) {
    if (pendingOperation.current?.signature !== signature) pendingOperation.current = { signature, key: crypto.randomUUID() };
    return pendingOperation.current.key;
  }
  useEffect(() => {
    const abort = new AbortController();
    apiRequest<Session[]>(`${base}?page=${historyPage}&size=20`, { signal: abort.signal }).then(setSessions).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [historyPage]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(""); setSession(null); setAnswerIndex(0); setDrafts({});
    if (sessionId) {
      apiRequest<Session>(`${base}/${encodeURIComponent(sessionId)}`, { signal: abort.signal }).then(next => { received(next); setDrafts(Object.fromEntries(next.answers.map(answer => [answer.id, { text: answer.answerText, score: answer.selfScore?.toString() ?? "" }]))); })
        .catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    } else {
      setQuestions([]);
      loadQuestionBanks(abort.signal).then(setQuestions).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }
    return () => abort.abort();
  }, [sessionId]);
  useEffect(() => {
    if (session?.state !== "ACTIVE") return;
    const abort = new AbortController();
    const timer = window.setInterval(() => setTick(performance.now()), 1000);
    const poll = window.setInterval(() => { apiRequest<Session>(`${base}/${session.id}`, { signal: abort.signal }).then(next => { if (!abort.signal.aborted) received(next); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }); }, 15000);
    return () => { abort.abort(); window.clearInterval(timer); window.clearInterval(poll); };
  }, [session?.id, session?.state]);
  const remaining = session?.state === "ACTIVE" ? Math.max(0, timerMark.current.remaining - Math.floor(Math.max(0, tick - timerMark.current.received) / 1000)) : session?.remainingSeconds ?? 0;
  const answer = session?.answers[answerIndex];
  const draft = answer ? drafts[answer.id] ?? { text: answer.answerText, score: answer.selfScore?.toString() ?? "" } : null;
  const unsaved = !!session?.answers.some(answer => { const draft = drafts[answer.id]; return draft && (draft.text !== answer.answerText || draft.score !== (answer.selfScore?.toString() ?? "")); });
  const canWrite = session?.state === "ACTIVE" && remaining > 0;
  async function create(body: PracticeInput) {
    if (!body.role || !body.questionIds.length || body.questionIds.length > 30) { setError("请选择题库并组成 1–30 道题的练习。"); return; }
    if (!Number.isInteger(body.durationSeconds) || body.durationSeconds < 300 || body.durationSeconds > 7200) { setError("练习时长须为 5 至 120 分钟。"); return; }
    setBusy(true); setError("");
    try { const next = await apiRequest<Session>(base, { method: "POST", headers: { "Idempotency-Key": operationKey(JSON.stringify(body)) }, body: JSON.stringify(body) }); pendingOperation.current = null; setParams({ session: next.id }); await refreshSessions(); }
    catch (e) { setError(e instanceof Error ? e.message : "无法创建练习。"); } finally { setBusy(false); }
  }
  async function save() {
    if (!session || !answer || !draft) return; setBusy(true); setError(""); setMessage("");
    const selfScore = draft.score === "" ? null : Number(draft.score);
    if (selfScore !== null && (!Number.isFinite(selfScore) || selfScore < 0 || selfScore > 100)) { setError("自评分须介于 0 与 100，或留空。"); setBusy(false); return; }
    try {
      const saved = await apiRequest<Answer>(`${base}/${session.id}/answers/${answer.id}`, { method: "PUT", body: JSON.stringify({ version: answer.version, answerText: draft.text, selfScore }) });
      setSession(current => current ? { ...current, answers: current.answers.map(item => item.id === saved.id ? saved : item) } : current);
      setDrafts(current => ({ ...current, [saved.id]: { text: saved.answerText, score: saved.selfScore?.toString() ?? "" } })); setMessage("回答已保存。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "回答保存失败，草稿已保留。");
      if (e instanceof ApiError && e.status === 409) await apiRequest<Session>(`${base}/${session.id}`).then(received).catch(() => undefined);
    } finally { setBusy(false); }
  }
  async function action(action: "PAUSE" | "RESUME" | "SUBMIT") {
    if (!session) return;
    if (action === "SUBMIT" && unsaved && remaining > 0) { setError("有未保存的回答，请先保存每道题的草稿再提交。"); return; }
    setBusy(true); setError(""); setMessage("");
    const body = { version: session.version, action };
    try { const next = await apiRequest<Session>(`${base}/${session.id}`, { method: "PATCH", headers: { "Idempotency-Key": operationKey(`${session.id}:${JSON.stringify(body)}`) }, body: JSON.stringify(body) }); pendingOperation.current = null; received(next); setMessage(action === "SUBMIT" ? "练习已提交，规则报告已生成。" : action === "PAUSE" ? "计时已暂停。" : "计时已恢复。"); await refreshSessions(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败。"); if (e instanceof ApiError && e.status === 409) await apiRequest<Session>(`${base}/${session.id}`).then(received).catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <div className="page-content">
    <PageHeader title="模拟练习" description="使用已发布题目练习，计时和回答保存在账号中。报告只使用公开说明的本地规则。" actions={sessionId ? <Button onClick={() => { setParams({}); setMessage(""); }}>创建新练习</Button> : undefined} />
    {error && <p role="alert">{error} {error.includes("登录") && <Link to="/login?returnTo=%2Fmock">前往登录</Link>}</p>}{message && <p role="status">{message}</p>}{loading && <p role="status">正在加载练习…</p>}
    {!sessionId && !loading && <PracticeSetup questions={questions} initialRole={params.get("role") ?? ""} busy={busy} onStart={create} />}
    {session && <div className="stack"><Panel title={`${session.role} · ${stateNames[session.state]}`} action={<strong aria-label="剩余时间">{clockText(remaining)}</strong>}>
      <p className="small muted">计时以服务器为准；离开页面会继续计时，暂停后不可编辑回答。</p>
      <div className="row">{session.state === "ACTIVE" && <Button disabled={busy || remaining === 0} onClick={() => void action("PAUSE")}>暂停计时</Button>}{session.state === "PAUSED" && <Button disabled={busy} onClick={() => void action("RESUME")}>恢复计时</Button>}{["ACTIVE", "PAUSED"].includes(session.state) && <Button variant="primary" disabled={busy} onClick={() => void action("SUBMIT")}>提交已保存的回答</Button>}</div>
      {remaining === 0 && session.state === "ACTIVE" && <p role="status">练习时间已到。请提交已保存的回答，当前未保存的草稿会保留在页面中供核对。</p>}
    </Panel>
    {answer && draft && <Panel title={`第 ${answer.sequence} / ${session.answers.length} 题`}><div className="stack"><div className="row">{session.answers.map((item, index) => <Button size="sm" key={item.id} variant={index === answerIndex ? "primary" : "secondary"} onClick={() => setAnswerIndex(index)}>第 {item.sequence} 题</Button>)}</div>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer.promptSnapshot}</p>
      <label htmlFor="practice-answer">我的回答</label><textarea id="practice-answer" className="input textarea" rows={12} maxLength={20000} value={draft.text} disabled={!canWrite || busy} onChange={e => setDrafts(current => ({ ...current, [answer.id]: { ...draft, text: e.target.value } }))} />
      <label htmlFor="practice-self-score">自评分（可留空，0–100）</label><input id="practice-self-score" className="input" type="number" min={0} max={100} step={0.01} value={draft.score} disabled={!canWrite || busy} onChange={e => setDrafts(current => ({ ...current, [answer.id]: { ...draft, score: e.target.value } }))} />
      {canWrite && <Button variant="primary" disabled={busy || (draft.text === answer.answerText && draft.score === (answer.selfScore?.toString() ?? ""))} onClick={() => void save()}>保存本题回答</Button>}
      {unsaved && <p className="small muted">有未保存的草稿。切换题目会保留草稿，刷新页面前请先保存。</p>}
      <details><summary>查看创建练习时的参考内容</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer.referenceSnapshot || "该题未提供参考内容。"}</p></details>
    </div></Panel>}
    {session.report && <Panel title="练习规则报告"><p>自评分均值：{session.report.score === null ? "未填写" : `${session.report.score.toFixed(2)} / 100`}</p><p className="small muted">规则版本：{session.report.ruleVersion}</p><div className="stack">{session.report.findings.map((finding, index) => <div key={`${finding.code}-${index}`}><h3>{finding.message}</h3><p>{finding.evidence}</p><p className="muted">{finding.suggestion}</p></div>)}</div><ul>{session.report.limitations.map(item => <li key={item}>{item}</li>)}</ul></Panel>}
    </div>}
    <Panel title="我的练习记录"><div className="stack">{sessions.map(item => <div key={item.id} className="row"><span>{item.role} · {item.answers.length} 题 · {stateNames[item.state]} · {new Date(item.createdAt).toLocaleString()}</span><Button disabled={busy} onClick={() => setParams({ session: item.id })}>{item.state === "COMPLETED" ? "查看报告" : "继续练习"}</Button></div>)}{!sessions.length && <p className="muted">暂无练习记录。</p>}<div className="row"><Button disabled={historyPage === 1} onClick={() => setHistoryPage(page => page - 1)}>上一页</Button><span>第 {historyPage} 页</span><Button disabled={sessions.length < 20} onClick={() => setHistoryPage(page => page + 1)}>下一页</Button></div></div></Panel>
  </div>;
}

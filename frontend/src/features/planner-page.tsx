import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, ClipboardList, Pencil, Plus, Search, Target, Trash2 } from "lucide-react";
import { apiRequest, ApiError } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { useAccount } from "../app/api-shell";
import { Button, Field, Modal, PageHeader } from "../components/ui";
import { DatePicker, todayDateValue } from "../components/DatePicker";
import { planInputError, taskStatuses, type PlanTask } from "./planner-model";
import "./planner.css";

type TaskInput = Schema<"PlanTaskInput">;
type EditorDraft = {title:string;notes:string;milestone:string;status:PlanTask["status"];date:string;time:string};
const taskDrafts = new Map<string,{task:PlanTask|null;value:EditorDraft}>();
const postKeys = new Map<string,string>();
window.addEventListener("campus:account-changed",()=>{taskDrafts.clear();postKeys.clear();});
window.addEventListener("beforeunload",event=>{if(taskDrafts.size){event.preventDefault();event.returnValue="";}});
type StatusFilter = PlanTask["status"] | "ALL";
const directions = ["前端开发", "后端开发", "算法", "产品", "测试开发", "设计"];
async function readTasks(signal?: AbortSignal) {
  const tasks: PlanTask[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<PlanTask>>(`/planner/tasks?page=${page}&size=100`, "GET", undefined, signal);
    tasks.push(...result.data);
    if (!result.page.hasMore) return tasks;
  }
  throw new Error("任务数量较多，暂时无法完整读取，请稍后重试。");
}
function errorText(error: unknown) {
  if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && error.message.startsWith("字段无效")) return "填写内容不符合要求，请检查日期、投入时间和任务信息后重试。";
  return error instanceof Error ? error.message : "操作未完成，请稍后重试。";
}
function deadline(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未设置截止时间";
}

export function ApiPlannerPage() {
  const account = useAccount();
  return account.user ? <PlannerWorkspace key={account.user.id} ownerId={account.user.id} /> : null;
}
function PlannerWorkspace({ownerId}:{ownerId:string}) {
  const retained = taskDrafts.get(ownerId);
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [target, setTarget] = useState(todayDateValue), [hours, setHours] = useState("8");
  const [roles, setRoles] = useState(["后端开发"]), [customRole, setCustomRole] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL"), [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PlanTask | null | undefined>(retained?.task);
  const [restoredDraft,setRestoredDraft] = useState<EditorDraft|undefined>(retained?.value);
  const [editorDirty, setEditorDirty] = useState(false), [deleting, setDeleting] = useState<PlanTask | null>(null);
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState<PlanTask | null | undefined>();
  const editorRef = useRef<string | null>(null); editorRef.current = editing?.id ?? null;
  const alive = useRef(true), busyRef = useRef(false), reads = useRef(0);
  const readController = useRef<AbortController | null>(null), operation = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    const ticket = ++reads.current;
    setLoading(true); setLoadError("");
    try { const rows = await readTasks(controller.signal); if (alive.current && ticket === reads.current) setTasks(rows); }
    catch (e) { if (alive.current && !controller.signal.aborted && ticket === reads.current) { setTasks(null); setLoadError(errorText(e)); } }
    finally { if (alive.current && ticket === reads.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true; for(const key of taskDrafts.keys()) if(key!==ownerId) taskDrafts.delete(key); for(const key of postKeys.keys()) if(!key.startsWith(`${ownerId}:`)) postKeys.delete(key); void reload();
    return () => { alive.current = false; readController.current?.abort(); operation.current?.abort(); };
  }, [reload]);
  async function run(work: (signal: AbortSignal) => Promise<unknown>, success: string, after?: () => void) {
    if (busyRef.current || !alive.current) return;
    const controller = new AbortController(); operation.current = controller;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await work(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      after?.(); setMessage(success); await reload();
    } catch (e) {
      if (alive.current && !controller.signal.aborted) {
        setError(e instanceof ApiError && e.status === 409 ? "任务已有更新，当前输入已保留。请读取最新记录后核对再保存。" : errorText(e));
        setConflict(e instanceof ApiError && e.status === 409); setLatest(undefined);
      }
    } finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  }
  function openEditor(task: PlanTask | null) { taskDrafts.delete(ownerId); setRestoredDraft(undefined); setEditing(task); setEditorDirty(false); setError(""); setConflict(false); setLatest(undefined); }
  function closeEditor() {
    if (busy) return;
    if (editorDirty && !window.confirm("任务还有未保存的修改，确定放弃吗？")) return;
    taskDrafts.delete(ownerId); setRestoredDraft(undefined); setEditing(undefined); setError(""); setConflict(false);
  }
  const keepDraft = useCallback((value:EditorDraft,dirty:boolean)=>{
    if(!alive.current)return;
    if(dirty)taskDrafts.set(ownerId,{task:editing ?? null,value});else taskDrafts.delete(ownerId);
  },[ownerId,editing]);
  async function post(path:string,body:unknown,signal:AbortSignal) {
    const signature=`${ownerId}:${path}:${JSON.stringify(body)}`;
    const key=postKeys.get(signature) ?? crypto.randomUUID(); postKeys.set(signature,key);
    const result=await apiRequest(path,{method:"POST",signal,headers:{"Idempotency-Key":key},body:JSON.stringify(body)});
    postKeys.delete(signature); return result;
  }
  function addRole() {
    const next = [...new Set([...roles, ...customRole.split(/[,，]/).map(value => value.trim()).filter(Boolean)])];
    if (next.length > 10 || next.some(value => [...value].length > 40)) { setError("最多选择 10 个方向，每个方向不超过 40 个字。"); return; }
    setRoles(next); setCustomRole(""); setError("");
  }
  function generate(event: FormEvent) {
    event.preventDefault();
    const nextRoles = [...new Set([...roles, ...customRole.split(/[,，]/).map(value => value.trim()).filter(Boolean)])];
    const validation = planInputError(target, hours, nextRoles);
    if (validation) { setError(validation); return; }
    setRoles(nextRoles); setCustomRole("");
    void run(signal => post("/api/v1/planner/generate", { targetDate: target, hoursPerWeek: Number(hours), roles: nextRoles }, signal), "准备计划已生成，已有任务保持不变。");
  }
  const counts = { ALL: tasks?.length ?? 0, TODO: tasks?.filter(task => task.status === "TODO").length ?? 0, DOING: tasks?.filter(task => task.status === "DOING").length ?? 0, DONE: tasks?.filter(task => task.status === "DONE").length ?? 0 };
  const visible = (tasks ?? []).filter(task => (status === "ALL" || task.status === status) && `${task.title} ${task.milestone} ${task.notes}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => a.sortOrder-b.sortOrder || a.title.localeCompare(b.title,"zh-CN"));
  const groups = new Map<string, PlanTask[]>();
  for (const task of visible) { const name = task.milestone || "未分组任务"; groups.set(name, [...(groups.get(name) ?? []), task]); }
  const changeStatus = (task: PlanTask, next: PlanTask["status"]) => void run(signal => apiRequest(`/api/v1/planner/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", signal, body: JSON.stringify({ version: task.version, status: next }) }), "任务状态已更新。");
  return <div className="planner-page stack">
    <PageHeader title="求职规划" description="确定准备目标，把简历、复习和面试练习落实为可跟进的任务。" actions={<Button variant="primary" onClick={() => openEditor(null)} disabled={busy}><Plus aria-hidden="true" />新增任务</Button>}/>
    <div className="planner-layout">
      <aside className="planner-goal">
        <header><Target aria-hidden="true" /><div><h2>准备目标</h2><p>按自己的节奏安排求职准备。</p></div></header>
        <form onSubmit={generate}>
          <fieldset disabled={busy}>
            <DatePicker label="目标日期" value={target} onChange={setTarget}/>
            <p className="planner-field-hint">希望在这一天前完成本轮准备。</p>
            <Field label="每周投入时间"><div className="planner-unit-input"><input id="planner-hours" className="input" type="number" min={1} max={80} step={1} aria-label="每周投入时间" value={hours} onChange={e => setHours(e.target.value)} placeholder="例如 8"/><span>小时 / 周</span></div></Field>
            <p className="planner-field-hint">填写每周可投入的总时长，1–80 小时。</p>
            <div className="planner-directions"><h3>求职方向</h3><p>可多选；也可以添加自己的方向。</p><div role="group" aria-label="求职方向">{[...new Set([...directions, ...roles])].map(role => <button type="button" key={role} aria-pressed={roles.includes(role)} onClick={() => setRoles(current => current.includes(role) ? current.filter(value => value !== role) : [...current, role])}>{roles.includes(role) && <Check aria-hidden="true"/>}{role}</button>)}</div></div>
            <div className="planner-add-direction"><input className="input" aria-label="添加求职方向" value={customRole} onChange={e => setCustomRole(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addRole(); } }} placeholder="例如：数据分析" maxLength={400}/><Button onClick={addRole} disabled={busy || !customRole.trim()} aria-label="添加方向"><Plus aria-hidden="true"/></Button></div>
          </fieldset>
          {error && editing === undefined && !deleting && <p className="planner-error" role="alert">{error}</p>}
          <div className="planner-generate-note"><ClipboardList aria-hidden="true"/><p>按方向生成简历完善、基础复习、模拟面试三类任务。重复生成同方向、同日期不会重复添加。</p></div>
          <Button type="submit" variant="primary" disabled={busy || loading}>{busy ? "正在处理…" : "生成准备计划"}</Button>
        </form>
      </aside>
      <section className="planner-workspace" aria-labelledby="planner-tasks-title">
        <header className="planner-tasks-heading"><div><h2 id="planner-tasks-title">我的任务</h2><p>{tasks ? `已完成 ${counts.DONE} / ${counts.ALL} 项，按阶段逐项推进。` : "任务和进度会保存在你的账号中。"}</p></div><Button size="sm" disabled={busy || loading} onClick={() => void reload()}>刷新列表</Button></header>
        <div className="planner-task-tools"><div role="group" aria-label="任务状态筛选">{(["ALL", "TODO", "DOING", "DONE"] as const).map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "ALL" ? "全部" : taskStatuses[value]}{tasks && <span>{counts[value]}</span>}</button>)}</div><label className="planner-search"><Search aria-hidden="true"/><input aria-label="搜索任务" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索任务、阶段或备注"/></label></div>
        {message && <p role="status" className="planner-success">{message}</p>}
        {loading ? <p className="planner-loading" role="status">正在读取你的任务…</p> : loadError ? <div className="planner-empty" role="alert"><h3>任务暂时无法读取</h3><p>{loadError}</p><Button onClick={() => void reload()}>重新加载</Button></div> : tasks?.length === 0 ? <div className="planner-empty"><ClipboardList aria-hidden="true"/><h3>开始你的第一份准备计划</h3><p>先在准备目标中选择方向和日期，生成基础任务；也可以自己添加一项。</p><Button onClick={() => openEditor(null)}><Plus aria-hidden="true"/>添加第一项任务</Button></div> : !visible.length ? <div className="planner-empty"><h3>没有符合条件的任务</h3><p>试试其他状态，或换一个搜索关键词。</p><Button onClick={() => {setQuery("");setStatus("ALL");}}>查看全部任务</Button></div> : <div className="planner-task-groups">{[...groups].map(([name, items]) => <section key={name}><h3>{name}<span>{items.length} 项</span></h3>{items.map(task => <article className={`planner-task${task.status === "DONE" ? " is-done" : ""}`} key={task.id}>
          <input type="checkbox" aria-label={`标记“${task.title}”完成`} checked={task.status === "DONE"} disabled={busy} onChange={e => changeStatus(task, e.target.checked ? "DONE" : "TODO")}/>
          <div className="planner-task-copy"><h4>{task.title}</h4><p className={task.dueAt && task.status !== "DONE" && new Date(task.dueAt).getTime() < Date.now() ? "is-overdue" : ""}><CalendarDays aria-hidden="true"/>{deadline(task.dueAt)}{task.dueAt && task.status !== "DONE" && new Date(task.dueAt).getTime() < Date.now() ? " · 已逾期" : ""}</p>{task.notes && <p className="planner-task-note">{task.notes}</p>}</div>
          <div className="planner-task-actions"><select className="input" aria-label={`设置“${task.title}”的状态`} value={task.status} disabled={busy} onChange={e => changeStatus(task, e.target.value as PlanTask["status"])}>{Object.entries(taskStatuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><Button size="sm" disabled={busy} aria-label={`编辑“${task.title}”`} onClick={() => openEditor(task)}><Pencil aria-hidden="true"/></Button><Button size="sm" disabled={busy} aria-label={`删除“${task.title}”`} onClick={() => {setDeleting(task);setError("");}}><Trash2 aria-hidden="true"/></Button></div>
        </article>)}</section>)}</div>}
      </section>
    </div>
    <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? "编辑准备任务" : "新增准备任务"}>
      {editing !== undefined && <PlannerTaskEditor key={editing?.id ?? "new"} task={editing} nextOrder={Math.max(-1, ...(tasks ?? []).map(task => task.sortOrder)) + 1} busy={busy} restored={restoredDraft} onDraft={keepDraft} groups={[...new Set((tasks ?? []).map(task => task.milestone).filter(Boolean))]} onDirty={setEditorDirty} error={error} onSave={body => void run(signal => editing ? apiRequest(`/api/v1/planner/tasks/${encodeURIComponent(editing.id)}`, { method:"PATCH",signal,body:JSON.stringify({...body,version:editing.version}) }) : post("/api/v1/planner/tasks",body,signal), "任务已保存。", () => { taskDrafts.delete(ownerId); setRestoredDraft(undefined); setEditing(undefined); setEditorDirty(false); setConflict(false); })}/>}
      {conflict && editing && <div className="planner-conflict"><p>请先核对服务器记录，当前输入不会被自动替换。</p><Button disabled={busy} onClick={async () => { try { const taskId=editing.id; const rows=await readTasks(operation.current?.signal); if(alive.current && editorRef.current === taskId) setLatest(rows.find(task=>task.id===taskId) ?? null); } catch(e) { if(alive.current) setError(errorText(e)); } }}>读取最新记录</Button>{latest === null && <p>此任务已被删除，请复制当前内容后新建任务。</p>}{latest && <><div><strong>{latest.title}</strong><p>{taskStatuses[latest.status]} · {deadline(latest.dueAt)}</p><p>{latest.notes || "无备注"}</p></div><Button onClick={() => {setEditing(latest);setConflict(false);setLatest(undefined);setError("");}}>保留当前输入，使用最新版本重试</Button></>}</div>}
    </Modal>
    <Modal open={!!deleting} onClose={() => {if(!busy)setDeleting(null);}} title="删除准备任务">{deleting && <div className="stack"><p>确定删除“{deleting.title}”吗？删除后无法恢复。</p>{error && <p role="alert">{error}</p>}<div className="planner-modal-actions"><Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" disabled={busy} onClick={() => void run(signal => apiRequest(`/api/v1/planner/tasks/${encodeURIComponent(deleting.id)}?version=${deleting.version}`, {method:"DELETE",signal}), "任务已删除。", () => setDeleting(null))}>确认删除</Button></div></div>}</Modal>
  </div>;
}

function localDeadline(value: string | null) {
  if (!value) return {date:"",time:"18:00"};
  const date = new Date(value);
  return { date:todayDateValue(date),time:`${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}` };
}
function PlannerTaskEditor({task,nextOrder,busy,groups,onDirty,error,onSave,restored,onDraft}:{task:PlanTask|null;nextOrder:number;busy:boolean;groups:string[];onDirty:(dirty:boolean)=>void;error:string;onSave:(body:TaskInput)=>void;restored?:EditorDraft;onDraft:(draft:EditorDraft,dirty:boolean)=>void}) {
  const initial = useRef({title:task?.title ?? "",notes:task?.notes ?? "",milestone:task?.milestone ?? "",status:task?.status ?? "TODO",...localDeadline(task?.dueAt ?? null)});
  const [draft,setDraft] = useState<EditorDraft>(restored ?? initial.current), [validation,setValidation] = useState("");
  useEffect(()=>{const dirty=JSON.stringify(draft)!==JSON.stringify(initial.current);onDirty(dirty);onDraft(draft,dirty);},[draft,onDirty,onDraft]);
  function save(event:FormEvent) {
    event.preventDefault();
    if(!draft.title.trim()){setValidation("请填写任务名称，例如：完成一轮后端模拟面试。");return;}
    if(draft.date && !draft.time){setValidation("请设置截止时间，或清空截止日期表示暂不安排。");return;}
    const dueAt=draft.date?new Date(`${draft.date}T${draft.time}`).toISOString():null;
    setValidation("");
    onSave({title:draft.title.trim(),notes:draft.notes,milestone:draft.milestone.trim(),status:draft.status as PlanTask["status"],dueAt,sortOrder:task?.sortOrder ?? nextOrder});
  }
  return <form className="planner-task-form" onSubmit={save}><p>写清要做什么，以及完成的标准，方便后续跟进。</p><fieldset disabled={busy}>
    <Field label="任务名称"><input aria-label="任务名称" className="input" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} maxLength={200} required placeholder="例如：完成一轮后端模拟面试"/></Field>
    <div className="planner-editor-grid"><Field label="所属阶段（选填）"><input aria-label="所属阶段（选填）" className="input" list="planner-milestones" value={draft.milestone} onChange={e=>setDraft({...draft,milestone:e.target.value})} maxLength={100} placeholder="例如：技术复习"/><datalist id="planner-milestones">{groups.map(value=><option key={value} value={value}/>)}</datalist></Field><Field label="任务状态"><select className="input" aria-label="任务状态" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as PlanTask["status"]})}>{Object.entries(taskStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field></div>
    <div className="planner-editor-grid"><DatePicker label="截止日期（选填）" popoverClassName="planner-date-popover" value={draft.date} onChange={date=>setDraft({...draft,date})}/><Field label="截止时间"><input aria-label="截止时间" type="time" className="input" value={draft.time} onChange={e=>setDraft({...draft,time:e.target.value})} disabled={busy || !draft.date}/></Field></div>
    <p className="planner-field-hint">按本机时区保存。未选择日期时，不设置截止时间。</p>
    <Field label="任务说明（选填）"><textarea aria-label="任务说明（选填）" className="input" rows={4} maxLength={10000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="记录准备材料、完成标准或下一步，例如：回答 5 道题，整理 2 个薄弱点。"/></Field>
  </fieldset>{(validation||error)&&<p className="planner-error" role="alert">{validation||error}</p>}<div className="planner-editor-footer"><span>保存后同步到你的账号</span><Button type="submit" variant="primary" disabled={busy}>{busy?"正在保存…":"保存任务"}</Button></div></form>;
}

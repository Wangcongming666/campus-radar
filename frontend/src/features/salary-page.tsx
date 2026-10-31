import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import { apiRequest } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { useAccount } from "../app/api-shell";
import { Button, Modal, PageHeader, Panel } from "../components/ui";
import { salaryPayload, salaryQuery, salaryRole, salaryRoles, salaryScopeErrors, type SalaryDraft, type SalaryScope } from "./salary-model";
import { SubmissionInbox } from "./submissions";
import "./salary.css";

type Company = Schema<"Company">;
type FieldErrors = Record<string, string>;
type PendingSalaryOperation = { signature: string; key: string };
// Unsaved drafts survive a temporary shell disconnect, stay in memory, and are
// discarded on account changes. They are never written to browser storage.
const salaryDrafts = new Map<string, { draft: SalaryDraft; pending: PendingSalaryOperation | null }>();
const salaryEditorsOpen = new Set<string>();
let draftOwner: string | null = null;
if (typeof window !== "undefined") window.addEventListener("campus:account-changed", () => { salaryDrafts.clear(); salaryEditorsOpen.clear(); draftOwner = null; });
function restoredDraft(owner: string) {
  if (draftOwner !== owner) { salaryDrafts.clear(); salaryEditorsOpen.clear(); draftOwner = owner; }
  return salaryDrafts.get(owner);
}
const emptyScope = (): SalaryScope => ({ companyId: "", role: "", customRole: "", city: "", year: "" });
const reportDraft = (): SalaryDraft => ({ ...emptyScope(), year: String(new Date().getFullYear()), base: "", months: "", bonus: "", source: "" });

function GuidedField({ label, hint, error, children }: { label: string; hint: string; error?: string; children: (attributes: { id: string; "aria-describedby": string; "aria-invalid": boolean }) => ReactNode }) {
  const id = useId();
  return <div className="salary-field"><label htmlFor={id}>{label}</label>{children({ id, "aria-describedby": `${id}-hint${error ? ` ${id}-error` : ""}`, "aria-invalid": !!error })}<small id={`${id}-hint`}>{hint}</small>{error && <small id={`${id}-error`} className="salary-field-error">{error}</small>}</div>;
}
function ScopeFields({ value, onChange, companies, companyLoading, errors, report = false }: { value: SalaryScope; onChange: (patch: Partial<SalaryScope>) => void; companies: Company[]; companyLoading: boolean; errors: FieldErrors; report?: boolean }) {
  return <div className="salary-scope-grid">
    <GuidedField label={report ? "样本公司" : "参考公司"} hint={report ? "必填。选择这份薪资实际对应的公司。" : "选择收到Offer或想了解的公司；留空查看全部公司。"} error={errors.companyId}>{attrs => <select {...attrs} value={value.companyId} required={report} onChange={event => onChange({ companyId: event.target.value })}><option value="">{companyLoading ? "正在读取公司…" : report ? "请选择样本对应公司" : "全部公司"}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select>}</GuidedField>
    <GuidedField label={report ? "样本方向" : "岗位方向"} hint={report ? "必填。选择实际岗位方向；历史或其他名称可原样自填。" : "例如后端开发；留空不限方向。历史名称可选择自填并原样查询。"} error={errors.role}>{attrs => <><select {...attrs} value={value.role} required={report} onChange={event => onChange({ role: event.target.value })}><option value="">{report ? "请选择岗位方向" : "全部方向"}</option>{salaryRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="__custom">其他 / 历史方向（自填）</option></select>{value.role === "__custom" && <input className="salary-custom-role" aria-label={report ? "样本自定义方向" : "参考自定义方向"} aria-describedby={attrs["aria-describedby"]} aria-invalid={!!errors.role} value={value.customRole} maxLength={40} placeholder="原样填写，例如 Java开发" required onChange={event => onChange({ customRole: event.target.value })} />}</>}</GuidedField>
    <GuidedField label={report ? "样本城市" : "工作城市"} hint={report ? "必填。填写工作所在城市，例如上海。" : "例如上海、杭州；留空不限城市，按完整城市名称匹配。"} error={errors.city}>{attrs => <input {...attrs} value={value.city} maxLength={64} placeholder="例如：上海" required={report} onChange={event => onChange({ city: event.target.value })} />}</GuidedField>
    <GuidedField label={report ? "适用年份" : "样本年份"} hint={report ? "必填。薪资适用的年份，2000–2100。" : "例如2026；留空查看全部已发布年份。"} error={errors.year}>{attrs => <input {...attrs} value={value.year} inputMode="numeric" maxLength={4} placeholder="例如：2026" required={report} onChange={event => onChange({ year: event.target.value })} />}</GuidedField>
  </div>;
}
async function loadCompanies(signal: AbortSignal) {
  const companies: Company[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<Company>>(`/companies?page=${page}&size=100`, "GET", undefined, signal);
    companies.push(...result.data);
    if (!result.page.hasMore) return companies;
  }
  throw new Error("公司列表较多，暂时无法完整读取，请稍后重试。");
}
function moneyText(minor: number | null) { return minor === null ? "暂未提供" : (minor / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 }); }

export function ApiSalaryPage() {
  const [companies, setCompanies] = useState<Company[]>([]), [companyLoading, setCompanyLoading] = useState(true), [companyError, setCompanyError] = useState("");
  const [filter, setFilter] = useState<SalaryScope>(emptyScope), [applied, setApplied] = useState<SalaryScope>(emptyScope), [filterErrors, setFilterErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<Schema<"SalarySummary"> | null>(null), [loading, setLoading] = useState(true), [summaryError, setSummaryError] = useState("");
  const [retry, setRetry] = useState(0);
  const composer = useSalaryComposer(companies, companyLoading);
  useEffect(() => {
    const controller = new AbortController(); setCompanyLoading(true); setCompanyError(""); setCompanies([]);
    loadCompanies(controller.signal).then(value => { if (!controller.signal.aborted) setCompanies(value); }).catch(error => { if (!controller.signal.aborted) setCompanyError(error.message); }).finally(() => { if (!controller.signal.aborted) setCompanyLoading(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController(); setSummary(null); setLoading(true); setSummaryError("");
    const query = salaryQuery(applied);
    apiRequest<Schema<"SalarySummary">>(`/api/v1/salary/summary${query ? `?${query}` : ""}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setSummary(value); }).catch(error => { if (!controller.signal.aborted) setSummaryError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, retry]);
  function search(event: FormEvent) {
    event.preventDefault(); const errors = salaryScopeErrors(filter); setFilterErrors(errors);
    if (!Object.keys(errors).length) setApplied({ ...filter });
    else { const form = event.currentTarget as HTMLFormElement; requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
  }
  const role = salaryRole(applied), roleLabel = salaryRoles.find(([key]) => key === role)?.[1] ?? role;
  const appliedDescription = [companies.find(company => company.id === applied.companyId)?.name ?? (applied.companyId ? "所选公司" : "全部公司"), roleLabel || "全部方向", applied.city.trim() || "全部城市", applied.year || "全部年份"].join(" · ");
  const suppressed = summary && (summary.suppressed || summary.sampleSize < 5);
  return <div className="stack salary-page">
    <PageHeader title="薪资参考" description="先看相近岗位的年现金分布，再核对你手中的薪资口径。" actions={<div className="salary-page-actions"><Link className="button button-secondary" to="/salary/submissions">我的薪资投稿</Link>{composer.button}</div>} />
    {composer.feedback}
    <Panel><div className="salary-section-heading"><div><h2>先选相近的样本</h2><p>优先比较同公司、同方向、同城市、同年份的样本；条件越接近，参考越具体。</p></div></div>
      <form aria-label="筛选薪资参考" noValidate onSubmit={search}>
        <ScopeFields value={filter} onChange={patch => { setFilter(current => ({ ...current, ...patch })); setFilterErrors({}); }} companies={companies} companyLoading={companyLoading} errors={filterErrors} />
        <div className="salary-form-actions"><Button type="submit" variant="primary">查看薪资参考</Button><Button onClick={() => { const empty = emptyScope(); setFilter(empty); setApplied(empty); setFilterErrors({}); }}>重置条件</Button><span>所有筛选都可留空，仅查看已审核发布的匿名统计。</span></div>
      </form>
      {companyError && <p role="alert" className="salary-error">公司选项暂时无法读取：{companyError} <button type="button" onClick={() => setRetry(value => value + 1)}>重新读取</button></p>}
    </Panel>
    <Panel><div className="salary-section-heading"><div><h2>年现金分布</h2><p>{appliedDescription}</p></div>{summary && <span className="salary-sample-count">{summary.sampleSize} 条完整样本</span>}</div>
      {loading && <p role="status" className="salary-result-state">正在读取已发布的匿名样本…</p>}
      {summaryError && <div role="alert" className="salary-result-state salary-error"><p>{summaryError}</p><Button onClick={() => setRetry(value => value + 1)}>重新读取参考</Button></div>}
      {summary && <>
        {suppressed ? <div className="salary-result-state"><CircleHelp size={24} aria-hidden="true" /><h3>{summary.sampleSize === 0 ? "还没有可比较的完整样本" : "完整样本不足5条，暂不展示金额"}</h3><p>当前有 {summary.sampleSize} 条完整样本。试着放宽公司、方向、城市或年份，或分享一份真实样本。</p></div> : <dl className="salary-distribution">{[
          { label: "P25 · 较低位置", value: summary.p25AnnualMinor, description: "从低到高约25%的位置" },
          { label: "中位数 · 中间位置", value: summary.medianAnnualMinor, description: "从低到高约50%的位置" },
          { label: "P75 · 较高位置", value: summary.p75AnnualMinor, description: "从低到高约75%的位置" },
        ].map(item => <div key={item.label}><dt>{item.label}</dt><dd>{moneyText(item.value)}{item.value !== null && <span>元 / 年</span>}</dd><p>{item.description}</p></div>)}</dl>}
        <div className="salary-reading-note"><strong>这些数字怎么比较？</strong><p>P25、中位数、P75都是样本的年现金金额位置。年现金 = 月薪 × 薪资月数 + 现金奖金；股票和福利未计入。完整样本指这三项均已明确，仅统计审核后已发布的数据，当前范围：{summary.sampleWindow}。</p><p>当前样本没有单独区分税前与税后；先核对来源口径，再与自己的同口径年现金比较，不能直接拿月薪或税后到手收入与年现金混比。</p></div>
      </>}
    </Panel>
    {composer.modal}
  </div>;
}
function useSalaryComposer(companies: Company[], companyLoading: boolean) {
  const account = useAccount();
  const ownerId = account.user?.id ?? "guest";
  const [open, setOpen] = useState(() => salaryEditorsOpen.has(ownerId));
  const [epoch, setEpoch] = useState(0), [refreshKey, setRefreshKey] = useState(0), [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const clear = () => { setOpen(false); setMessage(""); setEpoch(value => value + 1); };
    window.addEventListener("campus:account-changed", clear);
    return () => window.removeEventListener("campus:account-changed", clear);
  }, []);
  useEffect(() => { setOpen(salaryEditorsOpen.has(ownerId)); setMessage(""); }, [ownerId]);
  function close() {
    salaryEditorsOpen.delete(ownerId); setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }
  function submitted(report: Schema<"SalaryReport">) {
    close(); setRefreshKey(value => value + 1);
    setMessage(report.status === "PENDING" ? "薪资样本已提交，当前状态：待审核。通过后才会计入公开统计。" : report.status === "PUBLISHED" ? "薪资样本已发布，将按完整样本规则计入公开统计。" : "薪资样本已受理，请在我的投稿中查看实际状态。");
  }
  return {
    refreshKey,
    button: <button ref={triggerRef} type="button" className="button button-primary button-md salary-share-button" onClick={() => { restoredDraft(ownerId); salaryEditorsOpen.add(ownerId); setOpen(true); }}>分享薪资样本</button>,
    feedback: message ? <p role="status" className="salary-submission-feedback">{message} <Link to="/salary/submissions">查看我的投稿</Link></p> : null,
    modal: <Modal open={open} onClose={close} size="lg" title="分享薪资样本" description="提交真实来源的匿名样本，审核通过后才计入公开统计。关闭弹窗会暂存未提交内容，可稍后继续。">
      <div className="salary-composer"><SalaryReportForm ownerId={ownerId} key={`${ownerId}-${epoch}`} companies={companies} companyLoading={companyLoading} canSubmit={!!account.user && account.user.role === "USER" && !account.error} accountMessage={account.error || (account.loading && !account.user ? "正在确认登录状态…" : account.user && account.user.role !== "USER" ? "管理账号可查看参考；分享个人样本请使用求职者账号。" : !account.user ? "登录求职者账号后可提交样本。" : "")} onSubmitted={submitted} onCancel={close} /></div>
    </Modal>,
  };
}
export function ApiSalarySubmissionsPage() {
  const [companies, setCompanies] = useState<Company[]>([]), [companyLoading, setCompanyLoading] = useState(true), [companyError, setCompanyError] = useState("");
  const [retry, setRetry] = useState(0);
  const composer = useSalaryComposer(companies, companyLoading);
  useEffect(() => {
    const controller = new AbortController(); setCompanyLoading(true); setCompanyError("");
    loadCompanies(controller.signal).then(value => { if (!controller.signal.aborted) setCompanies(value); }).catch(error => { if (!controller.signal.aborted) setCompanyError(error.message); }).finally(() => { if (!controller.signal.aborted) setCompanyLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return <div className="salary-page">
    {composer.feedback}
    <SubmissionInbox kind="SALARY" title="我的薪资投稿" backPath="/salary" refreshKey={composer.refreshKey} actions={composer.button} />
    {companyError && <p role="alert" className="salary-error">投稿公司选项暂时无法读取：{companyError} <button type="button" onClick={() => setRetry(value => value + 1)}>重新读取</button></p>}
    {composer.modal}
  </div>;
}

function SalaryReportForm({ ownerId, companies, companyLoading, canSubmit, accountMessage, onSubmitted, onCancel }: { ownerId: string; companies: Company[]; companyLoading: boolean; canSubmit: boolean; accountMessage: string; onSubmitted: (report: Schema<"SalaryReport">) => void; onCancel: () => void }) {
  const [restored] = useState(() => restoredDraft(ownerId));
  const [draft, setDraft] = useState<SalaryDraft>(() => restored?.draft ?? reportDraft()), [errors, setErrors] = useState<FieldErrors>({}), [error, setError] = useState(""), [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false), [status, setStatus] = useState(restored ? "已恢复尚未提交的填写内容，请核对后重试。" : "");
  const controller = useRef<AbortController | null>(null), pending = useRef<PendingSalaryOperation | null>(restored?.pending ?? null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  function update(patch: Partial<SalaryDraft>) { const next = { ...draft, ...patch }; setDraft(next); salaryDrafts.set(ownerId, { draft: next, pending: pending.current }); setErrors({}); setError(""); setSubmitted(false); setStatus(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !canSubmit || submitted) return;
    const result = salaryPayload(draft); setErrors(result.errors); setError("");
    if (!result.body) {
      setError("请检查标出的字段，已填写的内容会保留。");
      const form = event.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const signature = JSON.stringify(result.body);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    salaryDrafts.set(ownerId, { draft, pending: pending.current });
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const report = await apiRequest<Schema<"SalaryReport">>("/api/v1/salary/reports", { method: "POST", body: signature, signal: abort.signal, headers: { "Idempotency-Key": pending.current.key } });
      if (!mounted.current || abort.signal.aborted) return;
      setSubmitted(true); salaryDrafts.delete(ownerId);
      onSubmitted(report);
    } catch (reason) {
      if (mounted.current && !abort.signal.aborted) setError(reason instanceof Error ? `${reason.message} 已保留本次填写内容，可重试。` : "提交失败，已保留填写内容，请重试。");
    } finally { if (mounted.current && !abort.signal.aborted) setBusy(false); }
  }
  return <form aria-label="分享匿名薪资样本" noValidate onSubmit={submit}>
    <fieldset disabled={busy} className="salary-report-fields"><legend className="salary-form-legend">1. 这份样本对应的工作（四项必填）</legend>
      <ScopeFields value={draft} onChange={update} companies={companies} companyLoading={companyLoading} errors={errors} report />
    </fieldset>
    <fieldset disabled={busy} className="salary-report-fields"><legend className="salary-form-legend">2. 现金薪资构成（未知项可留空）</legend>
      <p className="salary-form-intro">请按同一税前或税后口径填写，并在来源说明中注明；本表没有单独的税务口径字段。奖金不要与薪资月数重复计算。</p>
      <div className="salary-money-grid">
        <GuidedField label="固定月薪（元）" hint="例如20000，填写每月固定现金；最多两位小数，未知留空。" error={errors.base}>{attrs => <input {...attrs} inputMode="decimal" value={draft.base} placeholder="例如：20000" onChange={event => update({ base: event.target.value })} />}</GuidedField>
        <GuidedField label="薪资月数（月 / 年）" hint="例如13表示固定月薪发13个月，可填13.5；范围1–24，未知留空。" error={errors.months}>{attrs => <input {...attrs} inputMode="decimal" value={draft.months} placeholder="例如：13" onChange={event => update({ months: event.target.value })} />}</GuidedField>
        <GuidedField label="额外现金奖金（元 / 年）" hint="薪资月数之外的全年现金奖金；确定没有才填0，未知留空。" error={errors.bonus}>{attrs => <input {...attrs} inputMode="decimal" value={draft.bonus} placeholder="例如：10000；没有填0" onChange={event => update({ bonus: event.target.value })} />}</GuidedField>
      </div>
      <p className="salary-example">填写示例：月薪20000元 × 13个月 + 额外奖金10000元 = 年现金270000元。此处只是计算示例，不是平台样本。</p>
      <p className="salary-unknown-note">留空表示未知，不会按0计算。月薪、月数、奖金任一未知，这份样本暂不进入完整年现金统计。</p>
    </fieldset>
    <fieldset disabled={busy} className="salary-report-fields"><legend className="salary-form-legend">3. 说明来源与口径（必填）</legend>
      <GuidedField label="来源说明" hint="注明本人Offer/薪资说明、适用年份、税前或税后，以及奖金是否保证；不填写姓名、联系方式等个人信息。最多1000字。" error={errors.source}>{attrs => <textarea {...attrs} value={draft.source} maxLength={1000} rows={3} required placeholder="例如：本人2026届Offer，税前现金；月薪发13个月，额外奖金以录用说明为准。" onChange={event => update({ source: event.target.value })} />}</GuidedField>
    </fieldset>
    {error && <p role="alert" className="salary-error">{error}</p>}{status && <p role="status" className="salary-success">{status}</p>}
    <div className="salary-form-actions"><Button type="submit" variant="primary" disabled={busy || !canSubmit || submitted}>{busy ? "正在提交…" : submitted ? "样本已提交" : "提交样本，等待审核"}</Button><Button onClick={onCancel} disabled={busy}>稍后继续</Button>{accountMessage && <span>{accountMessage} {!canSubmit && <Link to="/login?returnTo=%2Fsalary">前往登录</Link>}</span>}</div>
    <p className="salary-submit-note">关闭弹窗会保留本次草稿；刷新或关闭页面会清空。公开统计匿名展示，提交记录会关联你的账号；审核通过不代表消息来源已被独立核实。</p>
  </form>;
}

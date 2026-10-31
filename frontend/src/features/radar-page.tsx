import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { useAccount } from "../app/api-shell";
import { apiRequest } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
} from "../components/ui";
import "./radar.css";

type Signal = Schema<"RadarSignal">;
const kinds: Record<Signal["kind"], string> = {
  RECRUITING: "招聘动态",
  INTERVIEW: "面试动态",
  OFFER: "录用动态",
  NOTICE: "招聘通知",
};
function kind(value: string) {
  return kinds[value as Signal["kind"]] ?? "其他动态";
}
function confidence(value: string) {
  return value === "VERIFIED"
    ? "已核验"
    : value === "UNVERIFIED"
      ? "尚未核验"
      : "核验状态未提供";
}
function date(value: string | null) {
  if (!value) return "未提供";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "未提供"
    : parsed.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}
function source(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function useRead<T>(path: string, load: (signal: AbortSignal) => Promise<T>) {
  const loader = useRef(load);
  loader.current = load;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{
    path: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ path, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, error: "", loading: true });
    void loader
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, data, error: "", loading: false });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({
            path,
            error:
              reason instanceof Error ? reason.message : "加载未完成，请重试。",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [path, tick]);
  return {
    ...(state.path === path
      ? state
      : { loading: true, error: "", data: undefined }),
    reload: () => setTick((x) => x + 1),
  };
}
async function companiesRead(signal: AbortSignal) {
  const rows: Schema<"Company">[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<Schema<"Company">>>(
      `/companies?page=${page}&size=100`,
      "GET",
      undefined,
      signal,
    );
    rows.push(...result.data);
    if (!result.page.hasMore) return rows;
  }
  throw new Error("公司列表超过读取范围，请稍后重试。");
}
// Uncertain writes and their keys live only in memory, scoped to one account.
type ReportDraft = {
  id: string;
  title: string;
  reason: string;
  key: string;
  payload: string;
  sent: boolean;
};
let memoryOwner: string | null = null;
let epoch = 0;
let openReport: { id: string; context: string } | null = null;
const drafts = new Map<string, ReportDraft>();
const pending = new Set<AbortController>();
function clearMemory() {
  pending.forEach((controller) => controller.abort());
  pending.clear();
  drafts.clear();
  openReport = null;
  memoryOwner = null;
  epoch++;
}
if (typeof window !== "undefined")
  window.addEventListener("campus:account-changed", clearMemory);
function claim(owner: string) {
  if (memoryOwner !== owner) {
    clearMemory();
    memoryOwner = owner;
  }
}
function ReportModal({
  owner,
  context,
  revision,
  onClose,
}: {
  owner: string;
  context: string;
  revision: number;
  onClose: () => void;
}) {
  void revision;
  claim(owner);
  const [, render] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const active =
    openReport?.context === context ? drafts.get(openReport.id) : undefined;
  function update(patch: Partial<ReportDraft>) {
    if (active) {
      drafts.set(active.id, { ...(drafts.get(active.id) ?? active), ...patch });
      render((x) => x + 1);
    }
  }
  function close() {
    if (!busy) {
      openReport = null;
      setError("");
      onClose();
    }
  }
  async function submit() {
    if (!active || busy || !active.reason.trim() || active.reason.length > 1000)
      return;
    const started = epoch,
      target = active.id;
    const payload = JSON.stringify({
      targetType: "SIGNAL",
      targetId: target,
      reason: active.reason.trim(),
    } satisfies Schema<"ReportInput">);
    const key = active.payload === payload ? active.key : crypto.randomUUID();
    update({ payload, key });
    setBusy(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    pending.add(request);
    try {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: payload,
        signal: request.signal,
        headers: { "Idempotency-Key": key },
      });
      if (mounted.current && started === epoch && memoryOwner === owner)
        update({ sent: true, reason: "" });
    } catch (reason) {
      if (
        mounted.current &&
        started === epoch &&
        memoryOwner === owner &&
        !request.signal.aborted
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "举报未完成，请保留输入后重试。",
        );
    } finally {
      pending.delete(request);
      if (mounted.current && started === epoch && memoryOwner === owner)
        setBusy(false);
    }
  }
  return (
    <Modal
      open={!!active}
      onClose={close}
      title="举报情报"
      layer={1}
      description="请说明内容存在的问题，审核人员会据此核查。"
    >
      {active && (
        <div className="radar-report">
          <p className="radar-report-target">{active.title}</p>
          {active.sent ? (
            <p role="status">举报已提交，将由审核人员处理。</p>
          ) : (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Field
                label="举报原因"
                hint={`${active.reason.length} / 1000 字`}
              >
                <textarea
                  className="input"
                  rows={5}
                  maxLength={1000}
                  required
                  disabled={busy}
                  value={active.reason}
                  placeholder="例如：来源页面与正文描述不符，请说明具体位置。"
                  onChange={(event) => {
                    update({ reason: event.target.value });
                    setError("");
                  }}
                />
              </Field>
              {error && (
                <p className="radar-error" role="alert">
                  {error}
                </p>
              )}
              <p className="muted small">
                提交失败时保留本次输入，请核对后手动重试。关闭或刷新浏览器后草稿不再保留。
              </p>
              <div className="radar-actions">
                <Button onClick={close} disabled={busy}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={busy || !active.reason.trim()}
                >
                  {busy ? "正在提交…" : "提交举报"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
export function ApiRadarPage() {
  const account = useAccount(),
    [params, setParams] = useSearchParams();
  const company = params.get("companyId") ?? "",
    days = params.get("days") === "7" ? "7" : "30";
  const rawPage = Number(params.get("page") ?? "1"),
    page =
      Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 500 ? rawPage : 1;
  const path = `/radar/signals?days=${days}&page=${page}&size=20${company ? `&companyId=${encodeURIComponent(company)}` : ""}`;
  const companies = useRead("companies", companiesRead);
  const remote = useRead(path, (signal) =>
    personalRequest<PageResult<Signal>>(path, "GET", undefined, signal),
  );
  const [selection, setSelection] = useState<{
      context: string;
      id: string;
    } | null>(null),
    [revision, setRevision] = useState(0);
  const signals =
    remote.data?.data.filter((row) => row.status === "PUBLISHED") ?? [];
  const selected =
    selection?.context === path
      ? signals.find((row) => row.id === selection.id)
      : undefined;
  const selectedSource = selected ? source(selected.sourceUrl) : null;
  const owner = account.user?.role === "USER" ? account.user.id : null;
  useEffect(() => {
    if (owner) claim(owner);
    else if (!account.loading && !account.error) clearMemory();
  }, [owner, account.loading, account.error]);
  useEffect(() => {
    const refresh = () => {
      setSelection(null);
      setRevision((x) => x + 1);
    };
    window.addEventListener("campus:account-changed", refresh);
    return () => window.removeEventListener("campus:account-changed", refresh);
  }, []);
  useEffect(() => {
    if (openReport && openReport.context !== path) {
      openReport = null;
      setRevision((x) => x + 1);
    }
  }, [path]);
  function change(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!("page" in patch)) next.set("page", "1");
    setSelection(null);
    openReport = null;
    setParams(next);
  }
  function report(signal: Signal) {
    if (!owner) return;
    claim(owner);
    if (!drafts.has(signal.id))
      drafts.set(signal.id, {
        id: signal.id,
        title: signal.title,
        reason: "",
        key: crypto.randomUUID(),
        payload: "",
        sent: false,
      });
    openReport = { id: signal.id, context: path };
    setRevision((x) => x + 1);
  }
  const companyName = (id: string) =>
    companies.data?.find((row) => row.id === id)?.name ?? "公司名称未提供";
  return (
    <div className="stack radar-page">
      <PageHeader
        title="校招雷达"
        description="查看公开招聘信号，打开详情核对正文与原始来源。"
      />
      <section className="radar-filters" aria-label="筛选情报">
        <Field label="公司">
          <select
            className="input"
            value={company}
            onChange={(event) => change({ companyId: event.target.value })}
          >
            <option value="">全部公司</option>
            {company && !companies.data?.some((row) => row.id === company) && (
              <option value={company}>当前所选公司</option>
            )}
            {companies.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="时间范围">
          <select
            className="input"
            value={days}
            onChange={(event) => change({ days: event.target.value })}
          >
            <option value="7">近7天</option>
            <option value="30">近30天</option>
          </select>
        </Field>
        <p className="radar-filter-note">按信号发生时间筛选</p>
        {companies.error && (
          <div className="radar-directory-error" role="alert">
            <span>{companies.error}</span>
            <Button onClick={companies.reload}>重试公司列表</Button>
          </div>
        )}
      </section>
      <section className="radar-feed" aria-label="公开情报列表">
        <div className="radar-feed-heading">
          <h2>公开情报</h2>
          {remote.data && !remote.loading && !remote.error && (
            <span className="muted">共 {remote.data.page.total} 条</span>
          )}
        </div>
        {remote.loading ? (
          <div className="radar-loading" role="status">
            <span />
            <span />
            <p>正在加载情报…</p>
          </div>
        ) : remote.error ? (
          <div className="radar-read-error" role="alert">
            <p>{remote.error}</p>
            <Button
              onClick={() => {
                setSelection(null);
                remote.reload();
              }}
            >
              重新加载
            </Button>
          </div>
        ) : signals.length === 0 ? (
          <Empty
            title="所选范围暂时没有公开信号"
            description="可扩大时间范围或选择其他公司。"
          />
        ) : (
          <ul className="radar-list">
            {signals.map((signal) => (
              <li className="radar-signal" key={signal.id}>
                <div className="radar-signal-main">
                  <div className="radar-signal-meta">
                    <span>{companyName(signal.companyId)}</span>
                    <span>{kind(signal.kind)}</span>
                    <time dateTime={signal.occurredAt}>
                      发生于 {date(signal.occurredAt)}
                    </time>
                  </div>
                  <h3>{signal.title}</h3>
                </div>
                <div className="radar-signal-end">
                  <Badge
                    tone={signal.confidence === "VERIFIED" ? "green" : "muted"}
                  >
                    {signal.confidence === "VERIFIED" && (
                      <ShieldCheck size={13} aria-hidden="true" />
                    )}
                    {confidence(signal.confidence)}
                  </Badge>
                  <Button
                    onClick={() =>
                      setSelection({ context: path, id: signal.id })
                    }
                  >
                    查看详情
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {remote.data && !remote.loading && !remote.error && (
          <nav className="radar-pagination" aria-label="情报分页">
            <Button
              disabled={remote.data.page.page <= 1}
              onClick={() =>
                change({ page: String(remote.data!.page.page - 1) })
              }
            >
              上一页
            </Button>
            <span>第 {remote.data.page.page} 页</span>
            <Button
              disabled={
                !remote.data.page.hasMore || remote.data.page.page >= 500
              }
              onClick={() =>
                change({ page: String(remote.data!.page.page + 1) })
              }
            >
              下一页
            </Button>
          </nav>
        )}
      </section>
      <Modal
        title={selected?.title ?? "情报详情"}
        open={!!selected}
        onClose={() => setSelection(null)}
        size="lg"
      >
        {selected && (
          <article className="radar-detail">
            <div className="radar-detail-summary">
              <p>
                {companyName(selected.companyId)} · {kind(selected.kind)}
              </p>
              <Badge
                tone={selected.confidence === "VERIFIED" ? "green" : "muted"}
              >
                {confidence(selected.confidence)}
              </Badge>
            </div>
            <dl className="radar-detail-dates">
              <div>
                <dt>发生时间</dt>
                <dd>{date(selected.occurredAt)}</dd>
              </div>
              <div>
                <dt>核验时间</dt>
                <dd>{date(selected.verifiedAt)}</dd>
              </div>
            </dl>
            <section className="radar-detail-copy">
              <h3>情报正文</h3>
              <p>{selected.body || "正文未提供。"}</p>
            </section>
            <section className="radar-source">
              <h3>原始来源</h3>
              {selectedSource ? (
                <a
                  className="button button-secondary"
                  href={selectedSource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看原始来源
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              ) : (
                <p className="muted">暂未提供可打开的原始来源。</p>
              )}
            </section>
            <footer className="radar-detail-footer">
              <p className="muted small">
                发现内容有误，可提交举报供审核人员核查。
              </p>
              {owner ? (
                <Button variant="ghost" onClick={() => report(selected)}>
                  举报此情报
                </Button>
              ) : (
                <Link
                  className="button button-secondary"
                  to={`/login?returnTo=${encodeURIComponent(`/radar?${params}`)}`}
                >
                  登录后举报
                </Link>
              )}
            </footer>
          </article>
        )}
      </Modal>
      {owner && (
        <ReportModal
          key={owner}
          owner={owner}
          context={path}
          revision={revision}
          onClose={() => setRevision((x) => x + 1)}
        />
      )}
    </div>
  );
}

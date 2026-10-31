import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import { ArrowLeft, Check, Download, Plus, Scale } from "lucide-react";
import { useAccount } from "../app/api-shell";
import { apiRequest, ApiError } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import { Button, Empty, PageHeader } from "../components/ui";
import {
  buildOffersCsv,
  offerAnnualCash,
  offerDimensionLabel,
  offerDimensions,
  offerEditorDimensions,
  offerStatusLabels,
  offerYuan,
} from "./offer-guidance";
import "./offers.css";

type Offer = Schema<"Offer">;
type Comparison = Schema<"Comparison">;
type Data = { offers: Offer[]; comparison: Comparison };
type Config = {
  ownerId: string | null;
  selection: string[];
  weights: Record<string, string>;
  version: number;
};
const defaults = Object.fromEntries(offerDimensions.map((d) => [d.key, "25"]));
const initialConfig = (ownerId: string | null): Config => ({
  ownerId,
  selection: [],
  weights: { ...defaults },
  version: 0,
});
const serverConfig = (ownerId: string, comparison: Comparison): Config => ({
  ownerId,
  selection: comparison.offerIds,
  version: comparison.version,
  weights: comparison.weights.length
    ? Object.fromEntries(
        comparison.weights.map((w) => [w.dimension, String(w.weight * 100)]),
      )
    : { ...defaults },
});
async function readOffers(signal: AbortSignal) {
  const offers: Offer[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<Offer>>(
      `/offers?page=${page}&size=100`,
      "GET",
      undefined,
      signal,
    );
    offers.push(...result.data);
    if (!result.page.hasMore) return offers;
  }
  throw new Error("Offer 数量超过可读取范围，请稍后重试。");
}
function exportCsv(data: Data) {
  const url = URL.createObjectURL(
    new Blob([buildOffersCsv(data.offers, data.comparison)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "校招雷达-Offer.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function initialOfferForm(value: Offer | null) {
  return {
    companyName: value?.companyName ?? "",
    title: value?.title ?? "",
    city: value?.city ?? "",
    base:
      value?.baseMonthlyMinor == null
        ? ""
        : String(value.baseMonthlyMinor / 100),
    months: value?.salaryMonths == null ? "" : String(value.salaryMonths),
    bonus: value?.bonusMinor == null ? "" : String(value.bonusMinor / 100),
    equityNote: value?.equityNote ?? "",
    benefits: value?.benefits ?? "",
    expires: dateTime(value?.expiresAt ?? null),
    status: value?.status ?? "PENDING",
  };
}
// Private drafts stay in memory across a temporary account-service outage or SPA navigation.
// They are never persisted and are only restored for the same verified owner.
let retainedConfig: Config | null = null;
let retainedEditor: {
  ownerId: string;
  value: Offer | null;
  form: ReturnType<typeof initialOfferForm>;
  scores: Record<string, string>;
  dimensions: ReturnType<typeof offerEditorDimensions>;
  baseline: string;
  requestKey: { body: string; key: string };
} | null = null;
window.addEventListener("campus:account-changed", () => {
  retainedConfig = null;
  retainedEditor = null;
});
window.addEventListener("beforeunload", (event) => {
  if (
    retainedEditor &&
    JSON.stringify({
      form: retainedEditor.form,
      scores: retainedEditor.scores,
    }) !== retainedEditor.baseline
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});

export function ApiOffersPage() {
  const account = useAccount();
  const ownerId = account.user?.role === "USER" ? account.user.id : null;
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const generation = useRef(0),
    readController = useRef<AbortController | null>(null),
    writeController = useRef<AbortController | null>(null),
    busyRef = useRef(false);
  const [view, setView] = useState<{
    ownerId: string | null;
    loading: boolean;
    error: string;
    data: Data | null;
  }>({ ownerId: null, loading: true, error: "", data: null });
  const [config, setConfig] = useState<Config>(() =>
    retainedConfig?.ownerId === ownerId
      ? retainedConfig
      : initialConfig(ownerId),
  );
  const [editing, setEditing] = useState<{
    ownerId: string;
    value: Offer | null;
    revision: number;
  } | null>(() =>
    ownerId && retainedEditor?.ownerId === ownerId
      ? { ownerId, value: retainedEditor.value, revision: 0 }
      : null,
  );
  const [busy, setBusy] = useState<{ ownerId: string; action: string } | null>(
    null,
  );
  const [message, setMessage] = useState<{
    ownerId: string;
    error?: string;
    success?: string;
    conflict?: "offer" | "comparison";
    latestOffer?: Offer;
    latestComparison?: Comparison;
  } | null>(null);
  const data = view.ownerId === ownerId ? view.data : null;
  const currentConfig =
    config.ownerId === ownerId ? config : initialConfig(ownerId);
  const currentEditing = editing?.ownerId === ownerId ? editing : null;
  const currentMessage = message?.ownerId === ownerId ? message : null;
  const isBusy = busy?.ownerId === ownerId;

  const load = useCallback(
    async (preserveConfig = false) => {
      if (!ownerId) return;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      const ticket = generation.current;
      setView({ ownerId, loading: true, error: "", data: null });
      try {
        const [offers, comparison] = await Promise.all([
          readOffers(controller.signal),
          apiRequest<Comparison>("/api/v1/offer-comparison", {
            signal: controller.signal,
          }),
        ]);
        if (
          controller.signal.aborted ||
          ticket !== generation.current ||
          ownerRef.current !== ownerId
        )
          return;
        setView({
          ownerId,
          loading: false,
          error: "",
          data: { offers, comparison },
        });
        setConfig((previous) =>
          preserveConfig && previous.ownerId === ownerId
            ? {
                ...previous,
                selection: previous.selection.filter((id) =>
                  offers.some((offer) => offer.id === id),
                ),
              }
            : serverConfig(ownerId, comparison),
        );
      } catch (error) {
        if (
          !controller.signal.aborted &&
          ticket === generation.current &&
          ownerRef.current === ownerId
        )
          setView({
            ownerId,
            loading: false,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "无法读取 Offer，请重试。",
          });
      }
    },
    [ownerId],
  );

  useEffect(() => {
    generation.current++;
    busyRef.current = false;
    setBusy(null);
    setMessage(null);
    if (retainedConfig?.ownerId !== ownerId) retainedConfig = null;
    if (retainedEditor?.ownerId !== ownerId) retainedEditor = null;
    setEditing(
      ownerId && retainedEditor
        ? { ownerId, value: retainedEditor.value, revision: 0 }
        : null,
    );
    setConfig(retainedConfig ?? initialConfig(ownerId));
    void load(!!retainedConfig);
    return () => {
      generation.current++;
      readController.current?.abort();
      writeController.current?.abort();
    };
  }, [ownerId, load]);
  useEffect(() => {
    if (ownerId && config.ownerId === ownerId) retainedConfig = config;
  }, [ownerId, config]);

  async function run<T>(
    action: string,
    request: (signal: AbortSignal) => Promise<T>,
    success: (result: T) => void,
    conflict?: "offer" | "comparison",
  ) {
    if (!ownerId || busyRef.current) return;
    const ticket = generation.current;
    const controller = new AbortController();
    writeController.current = controller;
    busyRef.current = true;
    setBusy({ ownerId, action });
    setMessage(null);
    try {
      const result = await request(controller.signal);
      if (
        ticket === generation.current &&
        ownerRef.current === ownerId &&
        !controller.signal.aborted
      )
        success(result);
    } catch (error) {
      if (
        ticket !== generation.current ||
        ownerRef.current !== ownerId ||
        controller.signal.aborted
      )
        return;
      const isConflict = error instanceof ApiError && error.status === 409;
      setMessage({
        ownerId,
        error: isConflict
          ? "记录已有更新，你的输入已保留。请查看最新记录后选择如何继续。"
          : `${error instanceof Error ? error.message : "保存失败，请重试。"} 输入已保留。`,
        conflict:
          isConflict || action === "compare-latest" ? conflict : undefined,
      });
    } finally {
      if (ticket === generation.current && ownerRef.current === ownerId) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  function startEdit(value: Offer | null) {
    if (ownerId) {
      retainedEditor = null;
      setMessage(null);
      setEditing({ ownerId, value, revision: 0 });
    }
  }
  async function compareLatest() {
    if (!ownerId || !currentMessage?.conflict) return;
    const kind = currentMessage.conflict;
    await run(
      "compare-latest",
      async (signal) => {
        if (kind === "offer") {
          const latest = (await readOffers(signal)).find(
            (offer) => offer.id === currentEditing?.value?.id,
          );
          if (!latest)
            throw new Error(
              "这份 Offer 已被删除，请保留输入并另存为新的 Offer。",
            );
          return { latestOffer: latest };
        }
        return {
          latestComparison: await apiRequest<Comparison>(
            "/api/v1/offer-comparison",
            { signal },
          ),
        };
      },
      (latest) => setMessage({ ownerId, conflict: kind, ...latest }),
      kind,
    );
  }
  const weights = Object.entries(currentConfig.weights);
  const weightTotal = weights.reduce(
    (sum, [, value]) => sum + (Number(value) || 0),
    0,
  );
  const weightsValid =
    weights.every(
      ([, value]) =>
        value.trim() !== "" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0 &&
        Number(value) <= 100,
    ) && weightTotal > 0;
  const selectedOffers = currentConfig.selection.filter((id) =>
    data?.offers.some((offer) => offer.id === id),
  );

  if (!ownerId)
    return (
      <p role="status">
        {account.loading
          ? "正在确认登录状态…"
          : "请使用求职者账号打开 Offer 对比。"}
      </p>
    );
  return (
    <div className="offers-page stack">
      <PageHeader
        title={
          currentEditing
            ? currentEditing.value
              ? "编辑 Offer"
              : "新增 Offer"
            : "Offer 对比"
        }
        description={
          currentEditing
            ? "先记录已确认的信息，尚不清楚的金额和评分可以留空。"
            : "先添加 Offer，再勾选比较；金额与个人评分分开记录。"
        }
        actions={
          !currentEditing && (
            <div className="row">
              <Button
                onClick={() => data && exportCsv(data)}
                disabled={!data?.offers.length || isBusy}
              >
                <Download aria-hidden="true" />
                导出 CSV
              </Button>
              <Button
                variant="primary"
                disabled={isBusy}
                onClick={() => startEdit(null)}
              >
                <Plus aria-hidden="true" />
                新增 Offer
              </Button>
            </div>
          )
        }
      />
      {currentEditing ? (
        <OfferEditor
          ownerId={ownerId}
          key={`${currentEditing.value?.id ?? "new"}-${currentEditing.revision}`}
          value={currentEditing.value}
          busy={isBusy}
          error={currentMessage?.error}
          conflict={currentMessage?.conflict === "offer"}
          onCancel={() => {
            retainedEditor = null;
            setEditing(null);
            setMessage(null);
          }}
          onSave={(body, key) =>
            void run(
              "save-offer",
              (signal) =>
                apiRequest<Offer>(
                  `/api/v1/offers${currentEditing.value ? `/${currentEditing.value.id}` : ""}`,
                  {
                    method: currentEditing.value ? "PATCH" : "POST",
                    signal,
                    headers: currentEditing.value
                      ? undefined
                      : { "Idempotency-Key": key },
                    body: JSON.stringify(
                      currentEditing.value
                        ? { ...body, version: currentEditing.value.version }
                        : body,
                    ),
                  },
                ),
              () => {
                retainedEditor = null;
                setEditing(null);
                setMessage({
                  ownerId,
                  success: "Offer 已保存，可以继续添加或勾选比较。",
                });
                void load(true);
              },
              "offer",
            )
          }
          conflictActions={
            currentMessage?.conflict === "offer" && (
              <div className="offer-conflict-actions">
                <Button disabled={isBusy} onClick={() => void compareLatest()}>
                  查看最新记录
                </Button>
                {currentMessage.latestOffer && (
                  <div className="offer-conflict">
                    <h3>最新记录</h3>
                    <p>
                      {currentMessage.latestOffer.companyName} ·{" "}
                      {currentMessage.latestOffer.title} ·{" "}
                      {offerStatusLabels[currentMessage.latestOffer.status]}
                    </p>
                    <p>
                      月薪{" "}
                      {offerYuan(currentMessage.latestOffer.baseMonthlyMinor)}，
                      {currentMessage.latestOffer.salaryMonths ?? "未知"}{" "}
                      薪，年度奖金{" "}
                      {offerYuan(currentMessage.latestOffer.bonusMinor)}
                    </p>
                    <p>
                      福利：{currentMessage.latestOffer.benefits || "未填写"}
                      ；股票：
                      {currentMessage.latestOffer.equityNote || "未填写"}
                    </p>
                    <p>
                      城市：{currentMessage.latestOffer.city || "未填写"}
                      ；答复截止：
                      {currentMessage.latestOffer.expiresAt
                        ? new Date(
                            currentMessage.latestOffer.expiresAt,
                          ).toLocaleString("zh-CN")
                        : "未填写"}
                    </p>
                    <p>
                      个人评分：
                      {currentMessage.latestOffer.scores
                        .map(
                          (score) =>
                            `${offerDimensionLabel(score.dimension)} ${score.score === null ? "未知" : `${score.score} 分`}`,
                        )
                        .join("、") || "尚未填写"}
                    </p>
                    <div className="row">
                      <Button
                        onClick={() => {
                          setEditing({
                            ...currentEditing,
                            value: currentMessage.latestOffer!,
                          });
                          setMessage(null);
                        }}
                      >
                        保留输入，使用最新版本重试
                      </Button>
                      <Button
                        onClick={() => {
                          if (
                            window.confirm(
                              "载入最新记录会替换尚未保存的输入，确定继续吗？",
                            )
                          ) {
                            retainedEditor = null;
                            setEditing({
                              ...currentEditing,
                              value: currentMessage.latestOffer!,
                              revision: currentEditing.revision + 1,
                            });
                            setMessage(null);
                          }
                        }}
                      >
                        载入最新记录
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          }
        />
      ) : (
        <>
          <ol className="offer-steps" aria-label="Offer 比较步骤">
            <li>
              <strong>添加至少两份 Offer</strong>
              <span>只填已知信息，未知留空。</span>
            </li>
            <li>
              <strong>勾选 2–10 份参与比较</strong>
              <span>在每份 Offer 左上方勾选。</span>
            </li>
            <li>
              <strong>设置权重并计算</strong>
              <span>按你填写的评分比较，查看覆盖率。</span>
            </li>
          </ol>
          {currentMessage?.success && (
            <p className="offer-success" role="status">
              <Check aria-hidden="true" />
              {currentMessage.success}
            </p>
          )}
          {currentMessage?.error && (
            <p className="offer-error" role="alert">
              {currentMessage.error}
            </p>
          )}
          {view.ownerId !== ownerId || view.loading ? (
            <p role="status">正在读取你的 Offer…</p>
          ) : view.error ? (
            <div className="offer-notice" role="alert">
              <p>{view.error}</p>
              <Button onClick={() => void load()}>重新读取 Offer</Button>
            </div>
          ) : (
            data && (
              <>
                {data.offers.length === 0 ? (
                  <div className="offer-empty">
                    <Empty
                      title="先添加你的第一份 Offer"
                      description="记录公司、职位和已确认的待遇。添加至少两份后，勾选它们即可比较。"
                      action={
                        <Button
                          variant="primary"
                          onClick={() => startEdit(null)}
                        >
                          添加第一份 Offer
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <section aria-labelledby="offer-list-title">
                    <div className="offer-section-heading">
                      <div>
                        <h2 id="offer-list-title">
                          我的 Offer <span>{data.offers.length}</span>
                        </h2>
                        <p>
                          {data.offers.length === 1
                            ? "已添加一份，再添加一份即可比较。"
                            : `已勾选 ${selectedOffers.length} 份，选择 2–10 份参与比较。`}
                        </p>
                      </div>
                      <span className="offer-private">仅自己可见</span>
                    </div>
                    <div className="offer-list">
                      {data.offers.map((offer) => (
                        <article
                          className={`offer-card ${selectedOffers.includes(offer.id) ? "is-selected" : ""}`}
                          key={offer.id}
                        >
                          <header>
                            <label className="offer-select">
                              <input
                                type="checkbox"
                                checked={selectedOffers.includes(offer.id)}
                                disabled={
                                  isBusy ||
                                  (!selectedOffers.includes(offer.id) &&
                                    selectedOffers.length >= 10)
                                }
                                onChange={(event) => {
                                  const selected = event.target.checked;
                                  setConfig((previous) => ({
                                    ...previous,
                                    selection: selected
                                      ? [...previous.selection, offer.id]
                                      : previous.selection.filter(
                                          (id) => id !== offer.id,
                                        ),
                                  }));
                                }}
                              />
                              <span>
                                <strong>{offer.companyName}</strong>
                                <span>{offer.title}</span>
                              </span>
                            </label>
                            <span className="offer-status">
                              {offerStatusLabels[offer.status]}
                            </span>
                          </header>
                          <p className="offer-location">
                            {offer.city || "城市未填写"}
                            {offer.expiresAt &&
                              ` · ${new Date(offer.expiresAt).toLocaleString("zh-CN")} 前答复`}
                          </p>
                          <dl className="offer-cash">
                            <div>
                              <dt>月薪</dt>
                              <dd>{offerYuan(offer.baseMonthlyMinor)}</dd>
                            </div>
                            <div>
                              <dt>薪资月数</dt>
                              <dd>
                                {offer.salaryMonths === null
                                  ? "未知"
                                  : `${offer.salaryMonths} 个月`}
                              </dd>
                            </div>
                            <div>
                              <dt>年度奖金</dt>
                              <dd>{offerYuan(offer.bonusMinor)}</dd>
                            </div>
                            <div>
                              <dt>年现金</dt>
                              <dd>{offerYuan(offerAnnualCash(offer))}</dd>
                            </div>
                          </dl>
                          {offerAnnualCash(offer) === null && (
                            <p className="offer-card-hint">
                              月薪、月数或奖金尚有未知项，暂不计算年现金。
                            </p>
                          )}
                          {(offer.benefits || offer.equityNote) && (
                            <details className="offer-extra">
                              <summary>福利与股票说明</summary>
                              {offer.benefits && <p>福利：{offer.benefits}</p>}
                              {offer.equityNote && (
                                <p>股票：{offer.equityNote}</p>
                              )}
                            </details>
                          )}
                          <div className="offer-card-actions">
                            <Button
                              disabled={isBusy}
                              onClick={() => startEdit(offer)}
                            >
                              编辑 Offer
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `删除“${offer.companyName} · ${offer.title}”？此操作无法撤销。`,
                                  )
                                )
                                  void run(
                                    "delete-offer",
                                    (signal) =>
                                      apiRequest(
                                        `/api/v1/offers/${offer.id}?version=${offer.version}`,
                                        { method: "DELETE", signal },
                                      ),
                                    () => {
                                      setMessage({
                                        ownerId,
                                        success: "Offer 已删除。",
                                      });
                                      void load(true);
                                    },
                                  );
                              }}
                            >
                              删除
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {data.offers.length > 0 && (
                  <section
                    className="offer-comparison"
                    aria-labelledby="offer-comparison-title"
                  >
                    <div className="offer-section-heading">
                      <div>
                        <h2 id="offer-comparison-title">
                          <Scale aria-hidden="true" />
                          设置比较偏好
                        </h2>
                        <p>
                          权重表示你对各维度的重视程度，0 表示不参与；每项
                          0–100，总和不必为 100。
                        </p>
                      </div>
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(
                          "save-comparison",
                          (signal) =>
                            apiRequest<Comparison>("/api/v1/offer-comparison", {
                              method: "PUT",
                              signal,
                              body: JSON.stringify({
                                version: currentConfig.version,
                                offerIds: selectedOffers,
                                weights: weights.map(([dimension, value]) => ({
                                  dimension,
                                  weight: Number(value) / 100,
                                })),
                              }),
                            }),
                          (comparison) => {
                            setView((previous) => ({
                              ...previous,
                              data: previous.data
                                ? { ...previous.data, comparison }
                                : null,
                            }));
                            setConfig(serverConfig(ownerId, comparison));
                            setMessage({
                              ownerId,
                              success: "比较已保存，结果已更新。",
                            });
                          },
                          "comparison",
                        );
                      }}
                    >
                      <div className="offer-weights">
                        {weights.map(([dimension, value]) => (
                          <label className="offer-field" key={dimension}>
                            <span>{offerDimensionLabel(dimension)}权重</span>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              required
                              value={value}
                              disabled={isBusy}
                              placeholder="例如：25"
                              onChange={(event) =>
                                setConfig((previous) => ({
                                  ...previous,
                                  weights: {
                                    ...previous.weights,
                                    [dimension]: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <p className="offer-help">
                        例如：现金待遇 40、学习成长 30、生活平衡 20、城市偏好
                        10，表示你最重视现金待遇。权重本身不是 Offer 的评分。
                      </p>
                      <div className="offer-comparison-submit">
                        <p>
                          {selectedOffers.length < 2
                            ? "请先勾选至少两份 Offer。"
                            : `将比较已勾选的 ${selectedOffers.length} 份 Offer。`}
                          {!weightsValid &&
                            " 至少一项权重须大于 0，每项范围为 0–100。"}
                        </p>
                        <Button
                          variant="primary"
                          type="submit"
                          disabled={
                            isBusy ||
                            selectedOffers.length < 2 ||
                            selectedOffers.length > 10 ||
                            !weightsValid ||
                            currentMessage?.conflict === "comparison"
                          }
                        >
                          {busy?.action === "save-comparison" && isBusy
                            ? "正在计算…"
                            : "保存比较并计算"}
                        </Button>
                      </div>
                    </form>
                    {currentMessage?.conflict === "comparison" && (
                      <div className="offer-conflict">
                        <p>你的勾选与权重仍保留。</p>
                        <Button
                          disabled={isBusy}
                          onClick={() => void compareLatest()}
                        >
                          查看最新比较配置
                        </Button>
                        {currentMessage.latestComparison && (
                          <>
                            <p>
                              服务器已选择{" "}
                              {currentMessage.latestComparison.offerIds.length}{" "}
                              份 Offer（
                              {currentMessage.latestComparison.offerIds
                                .map((id) => {
                                  const offer = data.offers.find(
                                    (item) => item.id === id,
                                  );
                                  return offer
                                    ? `${offer.companyName} · ${offer.title}`
                                    : "Offer 已不可用";
                                })
                                .join("、")}
                              ）；权重：
                              {currentMessage.latestComparison.weights
                                .map(
                                  (w) =>
                                    `${offerDimensionLabel(w.dimension)} ${Number((w.weight * 100).toFixed(2))}`,
                                )
                                .join("、") || "尚未设置"}
                              。
                            </p>
                            <Button
                              onClick={() => {
                                setConfig((previous) => ({
                                  ...previous,
                                  version:
                                    currentMessage.latestComparison!.version,
                                }));
                                setMessage(null);
                              }}
                            >
                              保留我的设置，使用最新版本重试
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    <div className="offer-method">
                      <h3>结果如何计算？</h3>
                      <p>
                        比较分来自你为每份 Offer 填写的 0–100
                        分个人评分，按已知维度的权重计算平均值。金额不会自动转为现金待遇评分。
                      </p>
                      <p>
                        信息覆盖率是“已有评分维度的权重 ÷
                        所有维度的权重”。例如，四项权重各
                        25、只填写两项评分时，覆盖率是 50%；未知评分不按 0
                        分处理，全部未知时不显示总分。
                      </p>
                      <p>
                        年现金 = 月薪 × 薪资月数 +
                        年度奖金；任一金额或月数未知，年现金就是未知。股票和福利仅作说明，不计入年现金或自动评分。
                      </p>
                    </div>
                    {data.comparison.results.length > 0 && (
                      <div className="offer-results">
                        <h3>已保存的比较结果</h3>
                        <p className="offer-help">
                          以下是上次保存的比较配置结果。调整勾选或权重后，请再次点击“保存比较并计算”。覆盖率不同的分数，请结合缺失信息一起看。
                        </p>
                        <p className="offer-help offer-table-hint">
                          左右滑动表格，可查看完整比较结果。
                        </p>
                        <div
                          className="offer-result-table"
                          role="region"
                          aria-label="Offer 比较结果"
                          tabIndex={0}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>公司与职位</th>
                                <th>比较分</th>
                                <th>信息覆盖率</th>
                                <th>年现金</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.comparison.results
                                .slice()
                                .sort(
                                  (a, b) => (b.score ?? -1) - (a.score ?? -1),
                                )
                                .map((result) => {
                                  const offer = data.offers.find(
                                    (item) => item.id === result.offerId,
                                  );
                                  return (
                                    <tr key={result.offerId}>
                                      <th scope="row">
                                        {offer?.companyName ?? "Offer 已不可用"}
                                        <small>{offer?.title}</small>
                                      </th>
                                      <td>
                                        {result.score === null
                                          ? "评分未知"
                                          : `${result.score.toFixed(1)} 分`}
                                      </td>
                                      <td>
                                        {(result.coverage * 100).toFixed(0)}%
                                      </td>
                                      <td>
                                        {offerYuan(result.annualCashMinor)}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function InputField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = `offer-${encodeURIComponent(props.name ?? label)}`;
  return (
    <label className="offer-field" htmlFor={id}>
      <span>
        {label}
        {props.required && <small>必填</small>}
      </span>
      <input
        {...props}
        id={id}
        className="input"
        aria-label={label}
        aria-describedby={hint ? `${id}-help` : undefined}
      />
      {hint && <small id={`${id}-help`}>{hint}</small>}
    </label>
  );
}
function OfferEditor({
  ownerId,
  value,
  busy,
  error,
  conflict,
  conflictActions,
  onCancel,
  onSave,
}: {
  ownerId: string;
  value: Offer | null;
  busy: boolean;
  error?: string;
  conflict: boolean;
  conflictActions?: React.ReactNode;
  onCancel: () => void;
  onSave: (body: Schema<"OfferInput">, key: string) => void;
}) {
  const cached =
    retainedEditor?.ownerId === ownerId &&
    retainedEditor.value?.id === value?.id
      ? retainedEditor
      : null;
  const [form, setForm] = useState(
    () => cached?.form ?? initialOfferForm(value),
  );
  const [dimensions] = useState(
    () => cached?.dimensions ?? offerEditorDimensions(value?.scores ?? []),
  );
  const [scores, setScores] = useState<Record<string, string>>(
    () =>
      cached?.scores ??
      Object.fromEntries(
        dimensions.map((d) => [
          d.key,
          value?.scores.find((s) => s.dimension === d.key)?.score?.toString() ??
            "",
        ]),
      ),
  );
  const baseline = useRef(cached?.baseline ?? JSON.stringify({ form, scores }));
  const dirty = JSON.stringify({ form, scores }) !== baseline.current;
  const keyRef = useRef(
    cached?.requestKey ?? { body: "", key: crypto.randomUUID() },
  );
  useEffect(() => {
    retainedEditor = {
      ownerId,
      value,
      form,
      scores,
      dimensions,
      baseline: baseline.current,
      requestKey: keyRef.current,
    };
  }, [ownerId, value, form, scores, dimensions]);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function cancel() {
    if (!dirty || window.confirm("放弃尚未保存的 Offer 输入，返回列表吗？"))
      onCancel();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const body: Schema<"OfferInput"> = {
      applicationId: value?.applicationId ?? null,
      companyName: form.companyName.trim(),
      title: form.title.trim(),
      city: form.city.trim(),
      baseMonthlyMinor:
        form.base === "" ? null : Math.round(Number(form.base) * 100),
      salaryMonths: form.months === "" ? null : Number(form.months),
      bonusMinor:
        form.bonus === "" ? null : Math.round(Number(form.bonus) * 100),
      equityNote: form.equityNote,
      benefits: form.benefits,
      expiresAt: form.expires ? new Date(form.expires).toISOString() : null,
      status: form.status,
      scores: dimensions.map((d) => ({
        dimension: d.key,
        score: scores[d.key] === "" ? null : Number(scores[d.key]),
      })),
    };
    const json = JSON.stringify(body);
    if (json !== keyRef.current.body)
      keyRef.current = { body: json, key: crypto.randomUUID() };
    retainedEditor = {
      ownerId,
      value,
      form,
      scores,
      dimensions,
      baseline: baseline.current,
      requestKey: keyRef.current,
    };
    onSave(body, keyRef.current.key);
  }
  return (
    <form
      className="offer-editor"
      aria-label={value ? "编辑 Offer 表单" : "新增 Offer 表单"}
      onSubmit={submit}
    >
      <Button variant="ghost" disabled={busy} onClick={cancel}>
        <ArrowLeft aria-hidden="true" />
        返回 Offer 列表
      </Button>
      <fieldset disabled={busy}>
        <legend>岗位基本信息</legend>
        <p className="offer-group-help">
          公司和职位用于识别这份 Offer，其余信息可以稍后补充。
        </p>
        <div className="offer-form-grid">
          <InputField
            name="company"
            label="公司名称"
            required
            maxLength={120}
            placeholder="例如：某某科技有限公司"
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
          />
          <InputField
            name="title"
            label="职位名称"
            required
            maxLength={200}
            placeholder="例如：后端开发工程师（校招）"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
          <InputField
            name="city"
            label="工作城市"
            maxLength={64}
            placeholder="例如：杭州；未确定可留空"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
          <label className="offer-field">
            <span>当前状态</span>
            <select
              className="input"
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as typeof form.status)
              }
            >
              {Object.entries(offerStatusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
            <small>尚未作出答复时选择“待决定”。</small>
          </label>
          <InputField
            name="expires"
            label="答复截止时间"
            type="datetime-local"
            hint="按当前设备时区填写；尚未确定可留空。"
            value={form.expires}
            onChange={(e) => set("expires", e.target.value)}
          />
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>薪资构成</legend>
        <p className="offer-group-help">
          金额单位均为人民币“元”，可填写到分。不要输入“15k”或“1.5万”；未知留空，确认没有奖金时填写
          0。
        </p>
        <div className="offer-form-grid offer-salary-grid">
          <InputField
            name="base"
            label="月薪（元）"
            type="number"
            min="0"
            max="10000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="例如：15000"
            hint="填写约定的固定月薪，未知留空。"
            value={form.base}
            onChange={(e) => set("base", e.target.value)}
          />
          <InputField
            name="months"
            label="薪资月数"
            type="number"
            min="1"
            max="24"
            step="any"
            inputMode="decimal"
            placeholder="例如：14"
            hint="范围 1–24，可填写小数；含明确约定的额外发薪月数。"
            value={form.months}
            onChange={(e) => set("months", e.target.value)}
          />
          <InputField
            name="bonus"
            label="年度奖金（元）"
            type="number"
            min="0"
            max="10000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="例如：20000；确认无奖金填 0"
            hint="填写未计入薪资月数的额外年度奖金，避免重复计算；不确定留空。"
            value={form.bonus}
            onChange={(e) => set("bonus", e.target.value)}
          />
        </div>
        <div className="offer-formula">
          <h3>当前年现金口径</h3>
          <p>
            月薪 × 薪资月数 + 年度奖金。示例：15,000 × 14 + 20,000 = 230,000 元
            / 年。
          </p>
          <p>
            任一项未知时，年现金保留为未知。此处不推算税后收入，股票与福利不计入年现金。
          </p>
        </div>
        <div className="offer-form-grid">
          <label className="offer-field">
            <span>股票 / 期权说明</span>
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              placeholder="例如：期权数量、归属周期、兑现条件；尚不清楚可留空"
              value={form.equityNote}
              onChange={(e) => set("equityNote", e.target.value)}
            />
            <small>仅作文字记录，不折算为现金或自动评分。</small>
          </label>
          <label className="offer-field">
            <span>福利说明</span>
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              placeholder="例如：餐补、住房补贴、年假、商业保险；没有确认的信息可留空"
              value={form.benefits}
              onChange={(e) => set("benefits", e.target.value)}
            />
            <small>仅作文字记录；若已计入奖金，不要重复录入金额。</small>
          </label>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>个人偏好评分</legend>
        <p className="offer-group-help">
          每项 0–100 分：0 表示最不符合你的预期，50 表示一般，100
          表示最符合。未知留空；0 是明确的评分，会参与计算。所有 Offer
          请使用一致的判断尺度。
        </p>
        <div className="offer-form-grid">
          {dimensions.map((d) => (
            <InputField
              key={d.key}
              name={`score-${d.key}`}
              label={`${d.label}评分`}
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              placeholder="0–100，例如：80；未知留空"
              hint={d.hint}
              value={scores[d.key]}
              onChange={(e) =>
                setScores((previous) => ({
                  ...previous,
                  [d.key]: e.target.value,
                }))
              }
            />
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="offer-error" role="alert">
          {error}
        </p>
      )}
      {conflictActions}
      <footer className="offer-editor-footer">
        <p>先保存这份 Offer，再回到列表勾选至少两份并设置权重。</p>
        <div className="row">
          <Button disabled={busy} onClick={cancel}>
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={busy || conflict}>
            {busy ? "正在保存…" : "保存 Offer"}
          </Button>
        </div>
      </footer>
    </form>
  );
}

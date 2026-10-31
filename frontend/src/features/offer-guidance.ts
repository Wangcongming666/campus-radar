import type { Schema } from "../api/personal";

export const offerDimensions = [
  {
    key: "salary",
    label: "现金待遇",
    hint: "这份现金待遇有多符合你的预期？例如，基本符合预期可记 70 分。金额不会自动换算成分数。",
  },
  {
    key: "growth",
    label: "学习成长",
    hint: "结合工作内容、导师和成长空间评分。例如，有明确培养计划且方向匹配，可记 85 分。",
  },
  {
    key: "balance",
    label: "生活平衡",
    hint: "结合工时、通勤和休息安排评分。越符合你的生活节奏，分数越高。",
  },
  {
    key: "location",
    label: "城市偏好",
    hint: "结合城市、居住成本和个人安排评分。越愿意在当地工作生活，分数越高。",
  },
] as const;
export const offerStatusLabels: Record<Schema<"Offer">["status"], string> = {
  PENDING: "待决定",
  ACCEPTED: "已接受",
  REJECTED: "已拒绝",
  EXPIRED: "已过期",
};
export function offerDimensionLabel(key: string) {
  return (
    offerDimensions.find((d) => d.key === key)?.label ?? `自定义维度：${key}`
  );
}
export function offerEditorDimensions(scores: Schema<"Offer">["scores"]) {
  const existing = scores.map((score) => score.dimension);
  const keys = [
    ...existing,
    ...offerDimensions
      .map((d) => d.key)
      .filter((key) => !existing.includes(key)),
  ].slice(0, 20);
  return keys.map((key) => ({
    key,
    label: offerDimensionLabel(key),
    hint:
      offerDimensions.find((d) => d.key === key)?.hint ??
      "沿用你已有的自定义维度。0 表示最不符合预期，100 表示最符合，未知留空。",
  }));
}
export const offerYuan = (minor: number | null) =>
  minor === null
    ? "未知"
    : `${(minor / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`;

// Match PersonalRules.annual: any unknown is null; decimal month multiplication
// is truncated to a whole minor unit, using integer arithmetic to avoid float drift.
export function offerAnnualCash(
  offer: Pick<
    Schema<"Offer">,
    "baseMonthlyMinor" | "salaryMonths" | "bonusMinor"
  >,
): number | null {
  const {
    baseMonthlyMinor: base,
    salaryMonths: months,
    bonusMinor: bonus,
  } = offer;
  if (base === null || months === null || bonus === null) return null;
  const [whole, fraction = ""] = String(months).split(".");
  const scale = 10n ** BigInt(fraction.length);
  return Number(
    (BigInt(base) * BigInt(whole + fraction) + BigInt(bonus) * scale) / scale,
  );
}
export function buildOffersCsv(
  offers: Schema<"Offer">[],
  comparison: Schema<"Comparison">,
) {
  const rows: unknown[][] = [
    [
      "公司",
      "职位",
      "城市",
      "月薪（元）",
      "月数",
      "年度奖金（元）",
      "年现金（元）",
      "比较分数",
      "信息覆盖率",
      "状态",
    ],
  ];
  for (const offer of offers) {
    const result = comparison.results.find((row) => row.offerId === offer.id);
    const annual = offerAnnualCash(offer);
    rows.push([
      offer.companyName,
      offer.title,
      offer.city,
      offer.baseMonthlyMinor === null ? null : offer.baseMonthlyMinor / 100,
      offer.salaryMonths,
      offer.bonusMinor === null ? null : offer.bonusMinor / 100,
      annual === null ? null : annual / 100,
      result?.score ?? null,
      result?.coverage ?? null,
      offerStatusLabels[offer.status],
    ]);
  }
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = value == null ? "" : String(value);
            if (/^[=+\-@]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}

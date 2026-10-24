import type { Job, Application } from './data';
export function annualCash(value: { base: number; months: number; bonus: number }) {
  return (value.base * value.months + value.bonus) / 10;
}
export function scoreOfferPay<
  T extends { base: number; months: number; bonus: number; scores: Record<string, number> },
>(offers: T[]): (T & { scores: Record<string, number> })[] {
  const max = Math.max(0, ...offers.map(annualCash)) || 1;
  return offers.map((o) => ({ ...o, scores: { ...o.scores, pay: (annualCash(o) / max) * 100 } }));
}
export function quantiles(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const q = (p: number) => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
  };
  return {
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[sorted.length - 1],
  };
}
export function rankOffers<T extends { id: string; scores: Record<string, number> }>(
  offers: T[],
  dimensions: { id: string; weight: number }[],
) {
  const sum = dimensions.reduce((n, d) => n + Math.max(0, d.weight), 0);
  return offers
    .map((offer) => ({
      ...offer,
      total: sum
        ? dimensions.reduce(
            (n, d) =>
              n + Math.min(100, Math.max(0, offer.scores[d.id] ?? 0)) * Math.max(0, d.weight),
            0,
          ) / sum
        : null,
    }))
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}
export function diagnoseResume(text: string, job: Job) {
  const keywords = [
    ...new Set([
      ...job.tags,
      ...(job.requirements
        .join(' ')
        .match(/React|Vue|TypeScript|JavaScript|Python|Java|SQL|HTTP|Linux|C\+\+|Git|Figma/gi) ??
        []),
    ]),
  ];
  const missing = keywords.filter((word) => !text.toLowerCase().includes(word.toLowerCase()));
  const lines = text
    .split(/[\n。]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const structure = Math.round(
    (['教育|学历|本科|硕士', '技能|技术', '项目', '经历|实习|工作'].filter((x) =>
      new RegExp(x).test(text),
    ).length /
      4) *
      25,
  );
  const evidence = Math.round(
    Math.min(
      1,
      lines.filter((x) => /\d+[%％]|\d+\s*(人|次|秒|ms|万|个)/i.test(x)).length /
        Math.max(1, lines.length / 3),
    ) * 25,
  );
  const action = Math.round(
    Math.min(
      1,
      lines.filter((x) => /负责|设计|实现|优化|独立|搭建|分析|推动/.test(x)).length /
        Math.max(1, lines.length),
    ) * 25,
  );
  const relevance = Math.round(
    (keywords.length ? (keywords.length - missing.length) / keywords.length : 0) * 25,
  );
  const suggestions = lines
    .filter((x) => /参与|负责|设计|实现|优化|开发|协作|运营|分析|搭建|研究|项目|熟悉|了解/.test(x))
    .filter((x) => !/\d+[%％]|\d+\s*(人|次|秒|ms|万|个)/i.test(x) || /参与|熟悉|了解/.test(x))
    .slice(0, 8)
    .map((original) => ({
      original,
      replacement: `${original}；补充：具体职责、采用方案与可核实的结果（请根据实际经历填写）。`,
      reason: '缺少明确贡献或可核实结果；保留原事实，补充真实证据后再使用。',
    }));
  return {
    total: structure + evidence + action + relevance,
    dimensions: [
      { label: '结构完整', score: structure },
      { label: '结果证据', score: evidence },
      { label: '行动表达', score: action },
      { label: '岗位关键词', score: relevance },
    ],
    missing,
    keywords,
    suggestions,
  };
}
export function applicationDate(value: string, year: number): string | null {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value))
      return null;
    if (!applicationDate(value.slice(0, 10), year)) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const cn = value.match(/^(\d{1,2})月(\d{1,2})日$/);
  const date = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : cn
      ? `${year}-${cn[1].padStart(2, '0')}-${cn[2].padStart(2, '0')}`
      : '';
  if (!date) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

export function applicationMetrics(applications: Pick<Application, 'stage' | 'history'>[]) {
  const interviewStages = ['INTERVIEW_1', 'INTERVIEW_2', 'HR', 'OFFER'];
  const hasInterview = (a: Pick<Application, 'stage' | 'history'>) =>
    interviewStages.includes(a.stage) ||
    a.history?.some((h) => interviewStages.includes(h.from) || interviewStages.includes(h.to));
  return {
    sent: applications.filter(
      (a) =>
        a.stage !== 'PENDING' || a.history?.some((h) => h.from !== 'PENDING' || h.to !== 'PENDING'),
    ).length,
    reachedInterview: applications.filter(hasInterview).length,
    interviewing: applications.filter((a) => ['INTERVIEW_1', 'INTERVIEW_2', 'HR'].includes(a.stage))
      .length,
    offers: applications.filter((a) => a.stage === 'OFFER').length,
  };
}

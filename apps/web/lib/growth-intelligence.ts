import type { Experience, Question } from './data';
export function styleSampleInsights(
  companyId: string,
  questions: Question[],
  experiences: Experience[],
) {
  const local = experiences.filter((e) => e.companyId === companyId);
  const linked = questions.filter((q) => q.companies.includes(companyId));
  const body = (e: Experience) =>
    `${e.title} ${e.tags.join(' ')} ${e.excerpt} ${e.sections.map((s) => `${s.title} ${s.content}`).join(' ')}`.toLowerCase();
  const includesTopic = (e: Experience, topic: string) =>
    body(e).includes(topic.toLowerCase()) || (topic === '行为面试' && /\bstar\b/i.test(body(e)));
  const topics = [...new Set(questions.map((q) => q.topic))]
    .map((name) => {
      const questionCount = linked.filter((q) => q.topic === name).length;
      const experienceCount = local.filter((e) => includesTopic(e, name)).length;
      return { name, questionCount, experienceCount, count: questionCount + experienceCount };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  const ranked = linked
    .map((q) => ({
      ...q,
      experienceCount: local.filter(
        (e) => includesTopic(e, q.topic) || body(e).includes(q.title.toLowerCase()),
      ).length,
    }))
    .sort(
      (a, b) => b.experienceCount - a.experienceCount || a.title.localeCompare(b.title, 'zh-CN'),
    );
  return { topics, ranked, experienceCount: local.length, questionCount: linked.length };
}
export type RadarHeatSample = { companyId: string; date: string; count: number };
/** Explicit fictional event aggregates, anchored to the displayed sample date. */
export const radarSampleDate = '2026-10-23';
export const radarSampleHistory: RadarHeatSample[] = [
  ['tencent', '2026-10-01', 5],
  ['tencent', '2026-10-08', 4],
  ['tencent', '2026-10-18', 3],
  ['tencent', '2026-10-21', 6],
  ['tencent', '2026-10-23', 2],
  ['bytedance', '2026-09-29', 7],
  ['bytedance', '2026-10-05', 4],
  ['bytedance', '2026-10-13', 5],
  ['bytedance', '2026-10-19', 3],
  ['bytedance', '2026-10-23', 4],
  ['alibaba', '2026-10-04', 4],
  ['alibaba', '2026-10-10', 3],
  ['alibaba', '2026-10-18', 4],
  ['alibaba', '2026-10-23', 1],
  ['meituan', '2026-10-03', 2],
  ['meituan', '2026-10-12', 3],
  ['meituan', '2026-10-22', 4],
  ['meituan', '2026-10-23', 1],
  ['ant', '2026-10-06', 4],
  ['ant', '2026-10-16', 2],
  ['ant', '2026-10-21', 3],
  ['ant', '2026-10-23', 1],
  ['huawei', '2026-10-02', 3],
  ['huawei', '2026-10-11', 5],
  ['huawei', '2026-10-20', 2],
  ['huawei', '2026-10-23', 1],
].map(([companyId, date, count]) => ({
  companyId: String(companyId),
  date: String(date),
  count: Number(count),
}));
export function radarHeat(
  samples: RadarHeatSample[],
  companyIds: string[],
  days: number,
  reference: string,
) {
  const end = new Date(`${reference}T12:00:00Z`);
  const dateAt = (offset: number) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const start = dateAt(-days + 1),
    previousStart = dateAt(-2 * days + 1);
  return [...new Set(companyIds)]
    .map((companyId) => {
      const records = samples.filter(
        (s) => s.companyId === companyId && Number.isFinite(s.count) && s.count >= 0,
      );
      const series = Array.from({ length: days }, (_, i) => {
        const date = dateAt(i - days + 1);
        return {
          date,
          count: records.filter((s) => s.date === date).reduce((n, s) => n + s.count, 0),
        };
      });
      const total = series.reduce((n, s) => n + s.count, 0);
      const previous = records
        .filter((s) => s.date >= previousStart && s.date < start)
        .reduce((n, s) => n + s.count, 0);
      return { companyId, total, previous, difference: total - previous, series };
    })
    .sort((a, b) => b.total - a.total || a.companyId.localeCompare(b.companyId));
}

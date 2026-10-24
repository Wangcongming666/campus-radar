import type { Job } from './data';
export type SubscriptionFilter = {
  role: string;
  city: string;
  company: string;
  type: string;
  education: string;
  keyword: string;
};
export type SubscriptionHit = { jobId: string; date: string; read: boolean };
export function matchesSubscription(job: Job, rule: SubscriptionFilter) {
  return (
    (!rule.role || job.role === rule.role) &&
    (!rule.city || job.city === rule.city) &&
    (!rule.company || job.companyId === rule.company) &&
    (!rule.type || job.type === rule.type) &&
    (!rule.education || job.education === rule.education) &&
    (!rule.keyword.trim() ||
      `${job.title} ${job.tags.join(' ')} ${job.requirements.join(' ')} ${job.description.join(' ')}`
        .toLowerCase()
        .includes(rule.keyword.trim().toLowerCase()))
  );
}
export function collectHits(
  jobs: Job[],
  filter: SubscriptionFilter,
  previous: SubscriptionHit[],
  date: string,
  enabled: boolean,
): SubscriptionHit[] {
  if (!enabled) return previous;
  const seen = new Set(previous.map((x) => x.jobId));
  return [
    ...jobs
      .filter((j) => matchesSubscription(j, filter) && !seen.has(j.id))
      .map((j) => ({ jobId: j.id, date, read: false })),
    ...previous,
  ];
}

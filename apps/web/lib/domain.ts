import { DEMO_NOW, getCompany, stages, type Job, type Application, type Stage } from './data';
export interface JobFilters {
  q?: string;
  city?: string;
  role?: string;
  type?: string;
  education?: string;
  company?: string;
  sort?: string;
}
export function filterJobs(items: Job[], filters: JobFilters): Job[] {
  const q = filters.q?.trim().toLowerCase();
  const result = items.filter((job) => {
    const company = getCompany(job.companyId);
    return (
      (!q ||
        [job.title, company.name, company.en, job.department, ...job.tags].some((v) =>
          v.toLowerCase().includes(q),
        )) &&
      (!filters.city || filters.city === '不限' || job.city === filters.city) &&
      (!filters.role || filters.role === '不限' || job.role === filters.role) &&
      (!filters.type || filters.type === '不限' || job.type === filters.type) &&
      (!filters.education || filters.education === '不限' || job.education === filters.education) &&
      (!filters.company || job.companyId === filters.company)
    );
  });
  if (filters.sort === 'deadline')
    return result.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  if (filters.sort === 'match') return result.sort((a, b) => b.match - a.match);
  return result;
}
export function deadlineDays(deadline: string | null): number | null {
  if (!deadline) return null;
  const base = new Date(`${DEMO_NOW.slice(0, 10)}T00:00:00+08:00`).getTime();
  const target = new Date(`${deadline}T00:00:00+08:00`).getTime();
  return Math.round((target - base) / 86400000);
}
export function transitionApplication(
  items: Application[],
  id: string,
  stage: Stage,
  expectedVersion: number,
): Application[] {
  if (!stages.some((s) => s.id === stage)) throw new Error('INVALID_STAGE');
  const current = items.find((a) => a.id === id);
  if (!current) throw new Error('NOT_FOUND');
  if (current.version !== expectedVersion) throw new Error('VERSION_CONFLICT');
  if (current.stage === stage) return items;
  const at = new Date().toISOString();
  return items.map((a) =>
    a.id === id
      ? {
          ...a,
          stage,
          version: a.version + 1,
          updatedAt: at,
          appliedAt: stage === 'APPLIED' ? (a.appliedAt ?? at) : a.appliedAt,
          history: [
            ...(a.history ?? []),
            { id: `${id}-${a.version + 1}`, from: a.stage, to: stage, at },
          ],
        }
      : a,
  );
}

export function reorderApplication(
  items: Application[],
  id: string,
  targetId: string,
): Application[] {
  const from = items.findIndex((a) => a.id === id),
    to = items.findIndex((a) => a.id === targetId);
  if (from < 0 || to < 0) throw new Error('NOT_FOUND');
  if (items[from].stage !== items[to].stage || !!items[from].archived !== !!items[to].archived)
    throw new Error('INVALID_REORDER');
  if (from === to) return items;
  const result = [...items],
    [item] = result.splice(from, 1);
  result.splice(to, 0, { ...item, version: item.version + 1, updatedAt: new Date().toISOString() });
  return result;
}

export function undoApplicationTransition(
  items: Application[],
  move: { id: string; from: Stage; to: Stage; version: number },
): Application[] {
  const current = items.find((a) => a.id === move.id);
  if (!current) throw new Error('NOT_FOUND');
  if (current.stage !== move.to || current.version !== move.version)
    throw new Error('VERSION_CONFLICT');
  return transitionApplication(items, move.id, move.from, move.version);
}

import { describe, it, expect } from 'vitest';
import { jobs, initialApplications } from './data';
import {
  filterJobs,
  deadlineDays,
  transitionApplication,
  undoApplicationTransition,
  reorderApplication,
} from './domain';
describe('job discovery', () => {
  it('combines city and role filters without matching unrelated jobs', () => {
    const result = filterJobs(jobs, { city: '北京', role: '前端开发' });
    expect(result.map((j) => j.id)).toEqual(['job-2', 'job-4']);
  });
  it('searches company names as well as job titles', () => {
    expect(filterJobs(jobs, { q: '腾讯' }).map((j) => j.id)).toEqual(['job-1', 'job-10']);
  });
  it('sorts deadlines chronologically with unknown deadlines last', () => {
    const result = filterJobs(jobs, { sort: 'deadline' });
    expect(result[0].id).toBe('job-3');
    expect(result.slice(-2).every((j) => j.deadline === null)).toBe(true);
  });
  it('treats unknown deadlines distinctly from expired ones', () => {
    expect(deadlineDays(null)).toBe(null);
    expect(deadlineDays('2026-10-22')).toBe(-1);
    expect(deadlineDays('2026-10-28')).toBe(5);
  });
});
describe('pipeline versioning', () => {
  it('allows skipping rounds and increments the selected card version only', () => {
    const updated = transitionApplication(initialApplications, 'app-5', 'OFFER', 1);
    expect(updated.find((a) => a.id === 'app-5')).toMatchObject({ stage: 'OFFER', version: 2 });
    expect(updated[0]).toBe(initialApplications[0]);
  });
  it('rejects outdated edits rather than overwriting another update', () => {
    expect(() => transitionApplication(initialApplications, 'app-1', 'HR', 0)).toThrow(
      'VERSION_CONFLICT',
    );
  });
  it('rejects unknown stages and missing cards', () => {
    expect(() => transitionApplication(initialApplications, 'app-1', 'FAKE' as never, 1)).toThrow(
      'INVALID_STAGE',
    );
    expect(() => transitionApplication(initialApplications, 'missing', 'HR', 1)).toThrow(
      'NOT_FOUND',
    );
  });
});

describe('safe pipeline undo', () => {
  it('restores a moved stage using its current version', () => {
    const moved = transitionApplication(initialApplications, 'app-5', 'OFFER', 1);
    expect(
      undoApplicationTransition(moved, {
        id: 'app-5',
        from: 'PENDING',
        to: 'OFFER',
        version: 2,
      }).find((a) => a.id === 'app-5'),
    ).toMatchObject({ stage: 'PENDING', version: 3 });
  });
  it('does not undo across a more recent edit', () => {
    const changed = initialApplications.map((a) =>
      a.id === 'app-5' ? { ...a, stage: 'OFFER' as const, version: 3, notes: 'later edit' } : a,
    );
    expect(() =>
      undoApplicationTransition(changed, { id: 'app-5', from: 'PENDING', to: 'OFFER', version: 2 }),
    ).toThrow('VERSION_CONFLICT');
  });
});
describe('pipeline ordering and audit history', () => {
  it('records actual stage changes and preserves a usable timestamp', () => {
    const changed = transitionApplication(initialApplications, 'app-5', 'OFFER', 1);
    expect(changed.find((a) => a.id === 'app-5')?.history?.at(-1)).toMatchObject({
      from: 'PENDING',
      to: 'OFFER',
    });
    expect(Number.isFinite(Date.parse(changed.find((a) => a.id === 'app-5')!.updatedAt!))).toBe(
      true,
    );
  });
  it('reorders inside a stage and invalidates stale edits on the moved card', () => {
    const items = [
      { ...initialApplications[4], id: 'a', stage: 'PENDING' as const },
      { ...initialApplications[4], id: 'b', stage: 'PENDING' as const },
      { ...initialApplications[4], id: 'c', stage: 'PENDING' as const },
    ];
    const result = reorderApplication(items, 'c', 'a');
    expect(result.map((a) => a.id)).toEqual(['c', 'a', 'b']);
    expect(result[0].version).toBe(2);
    expect(items.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });
  it('rejects cross-stage reorders rather than silently changing stage', () => {
    expect(() => reorderApplication(initialApplications, 'app-1', 'app-5')).toThrow(
      'INVALID_REORDER',
    );
  });
});

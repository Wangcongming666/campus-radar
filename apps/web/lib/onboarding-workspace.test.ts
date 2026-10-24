import { expect, it } from 'vitest';
import { persistOnboardingEntries } from './onboarding-workspace';
it('rolls profile and draft back when saving generated preparation tasks fails', () => {
  const data = new Map([
    ['profile', 'old-profile'],
    ['draft', 'old-draft'],
  ]);
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === 'tasks') throw new Error('full');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  expect(() =>
    persistOnboardingEntries(storage, {
      profile: 'new-profile',
      draft: 'new-draft',
      tasks: 'new-tasks',
    }),
  ).toThrow();
  expect(data.get('profile')).toBe('old-profile');
  expect(data.get('draft')).toBe('old-draft');
  expect(data.has('tasks')).toBe(false);
});

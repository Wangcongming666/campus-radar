import { expect, it } from 'vitest';
import { jobs } from './data';
import {
  matchJob,
  parseProfileText,
  validateOnboarding,
  buildPreparationTasks,
  preserveReturnTo,
  filterJobYear,
  postedOrder,
} from './local-matching';
const profile = {
  name: '王同学',
  school: '示例大学',
  degree: '本科',
  year: '2027',
  roles: ['前端开发'],
  cities: ['深圳'],
  resumeText: '技能：React TypeScript JavaScript\n项目：独立实现组件库与工程化。',
};
it('matches actual profile and JD terms without treating JavaScript as Java', () => {
  const result = matchJob(jobs[0], profile);
  expect(result.matched).toContain('React');
  expect(result.score).toBeGreaterThan(70);
  const backend = {
    ...jobs[0],
    role: '后端开发',
    tags: ['Java', 'MySQL'],
    requirements: ['熟悉 Java 和 MySQL'],
  };
  const miss = matchJob(backend, profile);
  expect(miss.matched).not.toContain('Java');
  expect(miss.missing).toContain('Java');
  expect(miss.score).toBeLessThan(result.score!);
});
it('marks absent profile dimensions unknown instead of inventing a score', () => {
  const result = matchJob(jobs[0], {});
  expect(result.score).toBeNull();
  expect(result.dimensions.every((d) => d.value === null)).toBe(true);
});
it('parses skills, education and actual project lines from provided text', () => {
  expect(
    parseProfileText('2028届 硕士\n技能：Java，SQL\n项目：检索服务\n实习：后端研发'),
  ).toMatchObject({
    year: '2028',
    degree: '硕士',
    skills: ['Java', 'SQL'],
    projects: 1,
    internships: 1,
  });
  expect(parseProfileText('JavaScript 与 TypeScript').skills).not.toContain('Java');
});
it('validates identity and preferences before finishing onboarding', () => {
  expect(() => validateOnboarding({ ...profile, name: ' ' })).toThrow();
  expect(() => validateOnboarding({ ...profile, roles: [] })).toThrow();
  expect(() => validateOnboarding({ ...profile, cities: ['不存在'] })).toThrow();
  expect(validateOnboarding(profile).name).toBe('王同学');
});
it('generates dated tasks from selected roles without duplicating existing titles', () => {
  const tasks = buildPreparationTasks(profile, [], '2026-10-23');
  expect(tasks.some((t) => t.title.includes('前端开发'))).toBe(true);
  expect(tasks.some((t) => t.title.includes('深圳'))).toBe(true);
  expect(tasks.every((t) => t.date >= '2026-10-23')).toBe(true);
  expect(buildPreparationTasks(profile, tasks, '2026-10-23')).toEqual(tasks);
});
it('preserves safe return destination across auth steps and blocks unsafe returns', () => {
  expect(preserveReturnTo('/register', '/jobs?city=上海#results')).toBe(
    '/register?returnTo=%2Fjobs%3Fcity%3D%E4%B8%8A%E6%B5%B7%23results',
  );
  expect(preserveReturnTo('/onboarding', '//evil.com')).toBe('/onboarding?returnTo=%2Fpipeline');
  expect(preserveReturnTo('/login', '/onboarding')).toBe('/login?returnTo=%2Fpipeline');
});
it('supports graduation filtering using actual requirements and orders relative posted times', () => {
  expect(filterJobYear(jobs[0], '2026')).toBe(false);
  expect(filterJobYear(jobs[0], '2027')).toBe(true);
  expect(postedOrder('2小时前')).toBeLessThan(postedOrder('昨天'));
});

import { expect, it } from 'vitest';
import { styleSampleInsights, radarHeat } from './growth-intelligence';
import { questions, experiences } from './data';
it('counts linked question records and actual company experiences, once per source', () => {
  const local = {
    ...experiences[0],
    id: 'local-style',
    companyId: 'tencent',
    title: 'React 项目复盘',
    tags: ['React'],
    excerpt: 'React React React',
    sections: [],
  };
  const data = styleSampleInsights('tencent', questions, [local]);
  expect(data.topics.find((t) => t.name === 'React')).toEqual({
    name: 'React',
    questionCount: 1,
    experienceCount: 1,
    count: 2,
  });
  expect(data.ranked.find((q) => q.id === 'q-2')?.experienceCount).toBe(1);
  expect(data.experienceCount).toBe(1);
  expect(styleSampleInsights('unknown', questions, [local]).topics).toEqual([]);
});
it('ranks only the selected companies using dated samples and includes zero days', () => {
  const samples = [
    { companyId: 'a', date: '2026-10-23', count: 2 },
    { companyId: 'b', date: '2026-10-12', count: 8 },
    { companyId: 'a', date: '2026-10-10', count: 3 },
  ];
  const seven = radarHeat(samples, ['a', 'b'], 7, '2026-10-23');
  expect(seven[0].companyId).toBe('a');
  expect(seven[0].total).toBe(2);
  expect(seven[0].series).toHaveLength(7);
  expect(seven[0].series[0].count).toBe(0);
  expect(radarHeat(samples, ['a', 'b'], 30, '2026-10-23')[0].companyId).toBe('b');
  expect(radarHeat(samples, ['a'], 30, '2026-10-23')).toHaveLength(1);
});

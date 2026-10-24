import { describe, expect, it } from 'vitest';
import {
  quantiles,
  diagnoseResume,
  rankOffers,
  applicationDate,
  annualCash,
  scoreOfferPay,
  applicationMetrics,
} from './growth-domain';
import { matchesSubscription, collectHits } from './discovery-domain';
import { jobs } from './data';
describe('local growth rules', () => {
  it('compares guaranteed cash in consistent units even for small amounts', () => {
    expect(annualCash({ base: 30, months: 16, bonus: 10 })).toBe(49);
    const scored = scoreOfferPay([
      { id: 'a', base: 0.1, months: 1, bonus: 0, scores: {} },
      { id: 'b', base: 0.2, months: 1, bonus: 0, scores: {} },
    ]);
    expect(scored.map((o) => o.scores.pay)).toEqual([50, 100]);
  });
  it('interpolates quartiles without inventing samples', () => {
    expect(quantiles([10, 20, 30, 40])).toEqual({
      min: 10,
      q1: 17.5,
      median: 25,
      q3: 32.5,
      max: 40,
    });
    expect(quantiles([])).toBeNull();
  });
  it('scores actual text and identifies target keywords', () => {
    const weak = diagnoseResume('参与项目开发', jobs[0]);
    const good = diagnoseResume(
      '教育 本科 技能 React TypeScript JavaScript 项目 负责 HTTP 性能优化，提升 30%。经历：设计浏览器组件库。',
      jobs[0],
    );
    expect(good.total).toBeGreaterThan(weak.total);
    expect(weak.missing).toContain('React');
    expect(weak.suggestions[0].original).toBe('参与项目开发');
    expect(weak.suggestions[0].replacement).not.toContain('30%');
    expect(weak.suggestions[0].replacement).toContain('参与项目开发');
  });
  it('normalizes weights and ranks with changed preferences', () => {
    const offers = [
      { id: 'a', scores: { pay: 100, life: 0 } },
      { id: 'b', scores: { pay: 0, life: 100 } },
    ];
    expect(
      rankOffers(offers, [
        { id: 'pay', weight: 20 },
        { id: 'life', weight: 80 },
      ])[0].id,
    ).toBe('b');
    expect(rankOffers(offers, [{ id: 'pay', weight: 0 }])[0].total).toBeNull();
  });
  it('uses Shanghai calendar dates for UTC timestamps and rejects malformed dates', () => {
    expect(applicationDate('2026-10-18T18:00:00Z', 2026)).toBe('2026-10-19');
    expect(applicationDate('2026-02-30', 2026)).toBeNull();
    expect(applicationDate('2026-10-18garbage', 2026)).toBeNull();
  });
  it('counts historical interview progress after moving a card back to pending', () => {
    const result = applicationMetrics([
      {
        stage: 'PENDING',
        history: [{ id: 'h1', from: 'INTERVIEW_1', to: 'PENDING', at: '2026-10-23' }],
      },
      { stage: 'PENDING' },
    ]);
    expect(result).toEqual({ sent: 1, reachedInterview: 1, interviewing: 0, offers: 0 });
  });
  it('parses Chinese dates using reference year and rejects unknown dates', () => {
    expect(applicationDate('10月18日', 2026)).toBe('2026-10-18');
    expect(applicationDate('未知', 2026)).toBeNull();
  });
});
describe('subscription matching', () => {
  const rule = {
    role: '前端开发',
    city: '深圳',
    company: '',
    type: '',
    education: '',
    keyword: 'React',
  };
  it('combines all conditions and searches requirement text', () => {
    expect(matchesSubscription(jobs[0], rule)).toBe(true);
    expect(matchesSubscription(jobs[0], { ...rule, city: '北京' })).toBe(false);
  });
  it('deduplicates recorded hits and respects paused subscriptions', () => {
    const old = [{ jobId: jobs[0].id, date: '2026-10-23', read: false }];
    expect(collectHits(jobs, rule, old, '2026-10-24', true)).toHaveLength(1);
    expect(collectHits(jobs, rule, [], '2026-10-24', false)).toEqual([]);
  });
});

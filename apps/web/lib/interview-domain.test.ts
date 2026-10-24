import { describe, expect, it } from 'vitest';
import {
  analyzeAnswer,
  buildPracticeQuestions,
  elapsedPracticeSeconds,
  isPracticeConfig,
  isPracticeDraft,
  isInterviewReview,
  type PracticeConfig,
} from './interview-domain';
const config: PracticeConfig = {
  role: '前端开发',
  company: '腾讯',
  round: '技术一面',
  level: '标准难度',
  minutes: 15,
};
describe('configured local practice', () => {
  it('changes questions for every chosen role, company, round and difficulty', () => {
    const baseline = buildPracticeQuestions(config)
      .map((q) => q.title)
      .join();
    for (const patch of [
      { role: '后端开发' },
      { company: '美团' },
      { round: 'HR 面试' },
      { level: '深度挑战' },
    ]) {
      expect(
        buildPracticeQuestions({ ...config, ...patch })
          .map((q) => q.title)
          .join(),
      ).not.toBe(baseline);
    }
    expect(buildPracticeQuestions(config)).toHaveLength(3);
    expect(buildPracticeQuestions({ ...config, minutes: 30 })).toHaveLength(5);
  });
  it('gives an unanswered question zero and ties coverage to the submitted answer', () => {
    const question = {
      id: 'event',
      title: '事件循环',
      reference: '调用栈、微任务、渲染',
      keywords: ['调用栈', '微任务', '渲染'],
    };
    expect(analyzeAnswer('', question).score).toBe(0);
    const vague = analyzeAnswer('我知道这个知识点', question);
    const detailed = analyzeAnswer(
      '首先同步任务进入调用栈，完成后清空微任务，再进行渲染。例如项目中我用日志验证 Promise 的执行顺序，比较修改前后的结果。',
      question,
    );
    expect(detailed.score).toBeGreaterThan(vague.score);
    expect(detailed.matched).toEqual(question.keywords);
    expect(detailed.excerpt).toContain('调用栈');
    expect(vague.suggestions.join()).toContain('微任务');
  });
  it('counts wall clock time only while running and never moves backwards', () => {
    expect(elapsedPracticeSeconds(20, 1000, 11000)).toBe(30);
    expect(elapsedPracticeSeconds(20, null, 11000)).toBe(20);
    expect(elapsedPracticeSeconds(20, 12000, 11000)).toBe(20);
  });
  it('rejects corrupt stored settings and noninteger indexes before the UI reads them', () => {
    expect(isPracticeConfig({ ...config, minutes: '15' })).toBe(false);
    expect(
      isPracticeDraft({
        id: 'x',
        config,
        createdAt: '2026-10-23',
        questions: buildPracticeQuestions(config),
        answers: ['', '', ''],
        index: 0.5,
        elapsed: 0,
        startedAt: null,
      }),
    ).toBe(false);
    expect(isInterviewReview({ transcript: '', note: '', selfScore: 3.5 })).toBe(false);
  });
});

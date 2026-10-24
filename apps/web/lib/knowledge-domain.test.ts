import { describe, expect, it } from 'vitest';
import {
  buildExperience,
  summarizeExperience,
  selectPack,
  assessQuestion,
  joinRoom,
  validateText,
  removeDiscussionThread,
} from './knowledge-domain';
import { experiences, questions } from './data';

describe('local knowledge workflows', () => {
  it('rejects whitespace and oversized authored content', () => {
    expect(() => validateText('   ', 1, 10)).toThrow();
    expect(() => validateText('a'.repeat(11), 1, 10)).toThrow();
    expect(validateText(' hello ', 1, 10)).toBe('hello');
  });
  it('creates a readable experience retaining actual content and selected metadata', () => {
    const value = buildExperience(
      {
        title: '我的数据库面试',
        content: '首先讨论联合索引。随后讨论查询优化与执行计划。',
        companyId: 'alibaba',
        role: '后端开发',
        round: '二面',
        tags: '数据库,MySQL',
      },
      '王同学',
      'local-1',
    );
    expect(value.sections[0].content).toContain('执行计划');
    expect(value.companyId).toBe('alibaba');
    expect(value.tags).toEqual(['数据库', 'MySQL']);
    expect(() =>
      buildExperience(
        { title: ' ', content: 'test', companyId: 'missing', role: '', round: '', tags: '' },
        '王',
        'x',
      ),
    ).toThrow();
  });
  it('extracts a summary from article sentences instead of a fixed recommendation', () => {
    const value = {
      ...experiences[0],
      sections: [
        { title: '复盘', content: '面试询问数据库索引。我的改进是先用执行计划定位慢查询。' },
      ],
    };
    expect(summarizeExperience(value)).toContain('执行计划');
    expect(summarizeExperience(value)).not.toContain('React');
  });
  it('filters company packs by role and difficulty without substituting other companies', () => {
    expect(selectPack('tencent', '后端开发', '困难', experiences, questions).questions).toEqual([]);
    const pack = selectPack('tencent', '全部方向', '简单', experiences, questions);
    expect(pack.questions.map((q) => q.id)).toEqual(['q-7']);
    expect(
      selectPack('huawei', '全部方向', '全部难度', experiences, questions).experiences,
    ).toEqual([]);
  });
  it('self assessment moves a recovered question out of the wrong book', () => {
    const wrong = assessQuestion({ mastery: {}, wrong: [], attempts: {} }, 'q-1', false);
    expect(wrong.wrong).toEqual(['q-1']);
    const recovered = assessQuestion(wrong, 'q-1', true);
    expect(recovered.wrong).toEqual([]);
    expect(recovered.mastery['q-1']).toBe('已掌握');
    expect(recovered.attempts['q-1']).toBe(2);
  });
  it('joining is idempotent and respects room capacity', () => {
    expect(joinRoom({ joined: true, members: 5, capacity: 5 })).toEqual({
      joined: true,
      members: 5,
      capacity: 5,
    });
    expect(() => joinRoom({ joined: false, members: 5, capacity: 5 })).toThrow();
    expect(joinRoom({ joined: false, members: 2, capacity: 5 }).members).toBe(3);
  });
});

it('removes nested replies when deleting their parent without deleting other discussions', () => {
  const comments = [
    { id: 'p' },
    { id: 'r', parent: 'p' },
    { id: 'r2', parent: 'r' },
    { id: 'keep' },
  ];
  expect(removeDiscussionThread(comments, 'p')).toEqual([{ id: 'keep' }]);
});

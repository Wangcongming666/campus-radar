import { expect, it } from 'vitest';
import { decodeKnowledgeRecord } from './knowledge-records';
import { experiences } from './data';
it('rejects malformed nested experience records before they can crash article rendering', () => {
  expect(() =>
    decodeKnowledgeRecord(
      'knowledge-experiences',
      JSON.stringify([{ ...experiences[0], tags: [42] }]),
    ),
  ).toThrow();
  expect(() => decodeKnowledgeRecord('knowledge-experiences', '{broken')).toThrow();
  expect(decodeKnowledgeRecord('knowledge-experiences', JSON.stringify([experiences[0]]))).toEqual([
    experiences[0],
  ]);
});
it('rejects invalid progress and negative attempts', () => {
  expect(() =>
    decodeKnowledgeRecord(
      'knowledge-learning',
      JSON.stringify({ mastery: {}, wrong: [], attempts: { 'q-1': -1 } }),
    ),
  ).toThrow();
  expect(() =>
    decodeKnowledgeRecord(
      'knowledge-learning',
      JSON.stringify({ mastery: {}, wrong: 'q-1', attempts: {} }),
    ),
  ).toThrow();
});
it('preserves replies and rejects a room whose shared questions cannot be rendered', () => {
  expect(
    decodeKnowledgeRecord(
      'discussion-experience-one',
      '[{"id":"r","parent":"p","name":"王","content":"补充边界"}]',
    ),
  ).toEqual([{ id: 'r', parent: 'p', name: '王', content: '补充边界' }]);
  expect(() =>
    decodeKnowledgeRecord('community-rooms', '[{"id":"r","title":"组","questionIds":[42]}]'),
  ).toThrow();
});

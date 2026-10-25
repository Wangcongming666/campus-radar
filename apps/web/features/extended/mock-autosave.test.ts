import type { ReactElement } from 'react';
import type { PracticeDraft, PracticeReport } from '@/lib/interview-domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const records = vi.hoisted(() => ({
  draft: null as PracticeDraft | null,
  reports: [] as PracticeReport[],
  saveDraft: vi.fn<(value: PracticeDraft | null) => Promise<boolean>>(),
  saveReports:
    vi.fn<
      (
        value: PracticeReport[] | ((previous: PracticeReport[]) => PracticeReport[]),
      ) => Promise<boolean>
    >(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = host.cursor++;
      if (!(index in host.slots))
        host.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        host.slots[index],
        (next: unknown) => {
          host.slots[index] = typeof next === 'function' ? next(host.slots[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = { current: initial };
      return host.slots[index];
    },
    useCallback: (callback: unknown) => callback,
    useEffect: () => undefined,
  };
});
vi.mock('@/lib/interview-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/interview-repository')>()),
  useInterviewLocal: (key: string) => {
    if (key === 'mock-config-v2')
      return {
        value: {
          role: '前端开发',
          company: '通用风格',
          round: '技术一面',
          level: '标准难度',
          minutes: 15,
        },
        ready: true,
        error: '',
        save: vi.fn(async () => true),
      };
    if (key === 'mock-reports-v2')
      return { value: records.reports, ready: true, error: '', save: records.saveReports };
    return { value: records.draft, ready: true, error: '', save: records.saveDraft };
  },
}));
vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  questions: [1, 2, 3].map((index) => ({
    id: 'real-question-' + index,
    title: '真实练习题目' + index,
    topic: '项目',
    answer: '用真实项目说明原理与验证',
  })),
}));
import { MockPage } from './mock';
import { clearWorkspace, initializeWorkspace } from '@/lib/api/workspace-client';

type Element = ReactElement<Record<string, any>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function find(tree: Element, predicate: (element: Element) => boolean): Element {
  const result = elements(tree).find(predicate);
  if (!result) throw new Error('Control not found');
  return result;
}
function render() {
  host.cursor = 0;
  return MockPage() as Element;
}
const answer = (tree: Element) => find(tree, (node) => node.props['aria-label'] === '本题回答');
const status = (tree: Element) =>
  find(tree, (node) => node.props['aria-label'] === '练习草稿保存状态').props.children;
const button = (tree: Element, label: string) =>
  find(tree, (node) => node.props.children === label);
async function start() {
  const tree = render();
  const startButton = find(
    tree,
    (node) => Array.isArray(node.props.children) && node.props.children.includes('开始模拟练习'),
  );
  await startButton.props.onClick();
  return render();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T00:00:00Z'));
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
  clearWorkspace();
  initializeWorkspace('practice-account', {});
  host.slots = [];
  host.cursor = 0;
  records.draft = null;
  records.reports = [];
  records.saveDraft.mockReset().mockImplementation(async (value) => {
    records.draft = value;
    return true;
  });
  records.saveReports.mockReset().mockImplementation(async (update) => {
    records.reports = typeof update === 'function' ? update(records.reports) : update;
    return true;
  });
});
afterEach(() => {
  clearWorkspace();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('coalesces answers, exposes failed autosaves and retries the current latest answer without replacing it with confirmed old data', async () => {
  let tree = await start();
  records.saveDraft.mockResolvedValueOnce(false);
  for (let index = 0; index < 100; index++)
    answer(tree).props.onChange({ target: { value: '实际回答' + index } });
  tree = render();
  expect(answer(tree).props.value).toBe('实际回答99');
  expect(status(tree)).toContain('未保存');
  expect(records.saveDraft).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1500);
  tree = render();
  expect(records.saveDraft).toHaveBeenCalledTimes(2);
  expect(records.draft?.answers[0]).toBe('');
  expect(status(tree)).toContain('当前回答已保留');
  expect(answer(tree).props.value).toBe('实际回答99');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(records.saveDraft).toHaveBeenCalledTimes(2);
  await button(tree, '重试保存当前草稿').props.onClick();
  tree = render();
  expect(records.draft?.answers[0]).toBe('实际回答99');
  expect(status(tree)).toBe('当前草稿已保存');
});
it('recovers an unsaved answer after a route remount and clears that memory on an account generation change', async () => {
  let tree = await start();
  records.saveDraft.mockResolvedValueOnce(false);
  answer(tree).props.onChange({ target: { value: '失败后需要恢复的回答' } });
  await vi.advanceTimersByTimeAsync(1500);
  host.slots = [];
  tree = render();
  expect(status(tree)).toContain('未保存');
  await button(tree, '恢复上次练习').props.onClick();
  tree = render();
  expect(answer(tree).props.value).toBe('失败后需要恢复的回答');
  answer(tree).props.onChange({ target: { value: '旧会话最后的回答' } });
  const count = records.saveDraft.mock.calls.length;
  clearWorkspace();
  initializeWorkspace('practice-account', {});
  records.draft = null;
  await vi.advanceTimersByTimeAsync(1500);
  expect(records.saveDraft).toHaveBeenCalledTimes(count);
  host.slots = [];
  tree = render();
  expect(elements(tree).some((node) => node.props['aria-label'] === '本题回答')).toBe(false);
  expect(elements(tree).some((node) => node.props.children === '恢复上次练习')).toBe(false);
});
it('serializes an older in-flight autosave before save-and-exit, so it cannot overwrite the latest paused answer', async () => {
  let tree = await start();
  let finishOld!: (value: boolean) => void;
  records.saveDraft.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  answer(tree).props.onChange({ target: { value: '较早的回答' } });
  await vi.advanceTimersByTimeAsync(1500);
  answer(tree).props.onChange({ target: { value: '保存退出时的最新回答' } });
  tree = render();
  const exiting = button(tree, '保存退出').props.onClick();
  expect(records.saveDraft).toHaveBeenCalledTimes(2);
  finishOld(true);
  await exiting;
  tree = render();
  expect(records.saveDraft).toHaveBeenCalledTimes(3);
  expect(records.draft).toMatchObject({
    startedAt: null,
    answers: ['保存退出时的最新回答', '', ''],
  });
  expect(elements(tree).some((node) => node.props.children === '恢复上次练习')).toBe(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(records.saveDraft).toHaveBeenCalledTimes(3);
});
it('finishes only after the current answer and report are acknowledged, and no delayed autosave resurrects the cleared draft', async () => {
  let tree = await start();
  answer(tree).props.onChange({ target: { value: '真实项目背景、行动与验证结果' } });
  tree = render();
  await button(tree, '提前结束').props.onClick();
  tree = render();
  expect(records.reports).toHaveLength(1);
  expect(records.reports[0].answers[0]).toBe('真实项目背景、行动与验证结果');
  expect(records.draft).toBeNull();
  expect(records.saveDraft.mock.calls.at(-1)).toEqual([null]);
  const count = records.saveDraft.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(records.saveDraft).toHaveBeenCalledTimes(count);
});

it('does not leave the answering view when save-and-exit is rejected', async () => {
  let tree = await start();
  answer(tree).props.onChange({ target: { value: '退出失败也必须保留的当前回答' } });
  records.saveDraft.mockResolvedValueOnce(false);
  tree = render();
  expect(await button(tree, '保存退出').props.onClick()).toBe(false);
  tree = render();
  expect(answer(tree).props.value).toBe('退出失败也必须保留的当前回答');
  expect(status(tree)).toContain('当前回答已保留');
});

import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Exercise the pages' real input handlers and calculations without a browser.
// This minimal hook host keeps state/ref slots across explicit render passes.
const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const records = vi.hoisted(() => ({
  text: '服务器上次确认的简历',
  dimensions: [
    { id: 'pay', name: '保证年薪', weight: 50 },
    { id: 'growth', name: '技术成长', weight: 50 },
  ],
  saveText: vi.fn<(value: string) => Promise<boolean>>(),
  saveDimensions:
    vi.fn<(value: { id: string; name: string; weight: number }[]) => Promise<boolean>>(),
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
    useEffect: () => undefined,
  };
});
vi.mock('./common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./common')>()),
  useLocal: (key: string, initial: unknown) =>
    key === 'diagnosis-text-v2'
      ? [records.text, records.saveText]
      : [initial, vi.fn(async () => true)],
}));
vi.mock('./growth-local-state', () => ({
  useValidatedArray: (key: string) => {
    if (key === 'offer-dimensions-v2') return [records.dimensions, records.saveDimensions];
    if (key === 'offers-v2')
      return [
        [
          {
            id: 'offer-a',
            company: 'A公司',
            title: '岗位A',
            city: '杭州',
            base: 20,
            months: 12,
            bonus: 0,
            deadline: '',
            note: '',
            scores: { growth: 0 },
          },
          {
            id: 'offer-b',
            company: 'B公司',
            title: '岗位B',
            city: '杭州',
            base: 10,
            months: 12,
            bonus: 0,
            deadline: '',
            note: '',
            scores: { growth: 100 },
          },
        ],
        vi.fn(async () => true),
      ];
    return [[], vi.fn(async () => true)];
  },
}));
import { ResumeCheckPage } from './growth-resume';
import { OfferComparePage } from './growth-offers';
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
function render(page: () => ReactElement) {
  host.cursor = 0;
  return page() as Element;
}
const textarea = (tree: Element) =>
  find(tree, (node) => node.props.placeholder === '粘贴教育、技能、项目与经历…');
const status = (tree: Element) => find(tree, (node) => node.props.role === 'status').props.children;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
  clearWorkspace();
  initializeWorkspace('test-account', {});
  host.slots = [];
  host.cursor = 0;
  records.text = '服务器上次确认的简历';
  records.dimensions = [
    { id: 'pay', name: '保证年薪', weight: 50 },
    { id: 'growth', name: '技术成长', weight: 50 },
  ];
  records.saveText.mockReset().mockResolvedValue(false);
  records.saveDimensions.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  clearWorkspace();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('keeps the newest resume text visible after a rejected debounced save and exposes a real retry', async () => {
  let tree = render(ResumeCheckPage);
  for (let index = 0; index < 100; index++)
    textarea(tree).props.onChange({ target: { value: '真实简历文字' + index } });
  tree = render(ResumeCheckPage);
  expect(textarea(tree).props.value).toBe('真实简历文字99');
  expect(records.saveText).not.toHaveBeenCalled();
  expect(status(tree)).toContain('未保存');
  await vi.advanceTimersByTimeAsync(800);
  tree = render(ResumeCheckPage);
  expect(records.saveText).toHaveBeenCalledExactlyOnceWith('真实简历文字99');
  expect(textarea(tree).props.value).toBe('真实简历文字99');
  expect(status(tree)).toContain('当前编辑已保留');
  records.saveText.mockImplementation(async (value) => {
    records.text = value;
    return true;
  });
  const retry = find(tree, (node) => node.props.children === '重试保存文本');
  await retry.props.onClick();
  tree = render(ResumeCheckPage);
  expect(textarea(tree).props.value).toBe('真实简历文字99');
  expect(status(tree)).toContain('无待保存修改');
});
it('retains failed resume drafts across route remounts and erases them on account changes', async () => {
  let tree = render(ResumeCheckPage);
  textarea(tree).props.onChange({ target: { value: '保存失败后仍需保留的实际文字' } });
  await vi.advanceTimersByTimeAsync(800);
  host.slots = [];
  tree = render(ResumeCheckPage);
  expect(textarea(tree).props.value).toBe('保存失败后仍需保留的实际文字');
  clearWorkspace();
  initializeWorkspace('another-account', {});
  host.slots = [];
  tree = render(ResumeCheckPage);
  expect(textarea(tree).props.value).toBe('服务器上次确认的简历');
});
it('updates Offer ranking immediately, persists only the latest weights and preserves failed edits for retry', async () => {
  let tree = render(OfferComparePage);
  expect(find(tree, (node) => node.type === 'tbody').props.children[0].key).toBe('offer-b');
  const pay = find(tree, (node) => node.props.type === 'number' && node.props.value === 50);
  for (let weight = 51; weight <= 100; weight++)
    pay.props.onChange({ target: { value: String(weight) } });
  tree = render(OfferComparePage);
  expect(records.saveDimensions).not.toHaveBeenCalled();
  // 100×100 / 150 beats (50×100 + 100×50) / 150 only after
  // reducing growth; both edits must participate before either reaches the API.
  const growth = find(tree, (node) => node.props.type === 'number' && node.props.value === 50);
  growth.props.onChange({ target: { value: '10' } });
  tree = render(OfferComparePage);
  expect(find(tree, (node) => node.type === 'tbody').props.children[0].key).toBe('offer-a');
  const currentPay = find(tree, (node) => node.props.type === 'number' && node.props.value === 100);
  await currentPay.props.onBlur();
  tree = render(OfferComparePage);
  expect(records.saveDimensions).toHaveBeenCalledTimes(1);
  expect(records.saveDimensions.mock.calls[0][0].map((dimension) => dimension.weight)).toEqual([
    100, 10,
  ]);
  expect(status(tree)).toContain('当前修改已保留');
  expect(
    find(tree, (node) => node.props.type === 'number' && node.props.value === 100),
  ).toBeTruthy();
  records.saveDimensions.mockImplementation(async (value) => {
    records.dimensions = value;
    return true;
  });
  await find(tree, (node) => node.props.children === '重试保存维度').props.onClick();
  tree = render(OfferComparePage);
  expect(status(tree)).toContain('无待保存修改');
});
it('does not send a pending resume edit into a different generation of the same account', async () => {
  const tree = render(ResumeCheckPage);
  textarea(tree).props.onChange({ target: { value: '上一会话的私有文字' } });
  clearWorkspace();
  initializeWorkspace('test-account', {});
  await vi.advanceTimersByTimeAsync(800);
  expect(records.saveText).not.toHaveBeenCalled();
});

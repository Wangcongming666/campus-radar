import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoalescedDraftWriter } from '@/lib/coalesced-draft-writer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const turn = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
it('coalesces a long typing burst into one acknowledged latest-value write', async () => {
  const save = vi.fn(async (_value: string) => true),
    onStatus = vi.fn();
  const writer = createCoalescedDraftWriter({ save, scope: () => 'account-a:1', onStatus });
  for (let index = 1; index <= 120; index++) {
    writer.edit('真实简历'.repeat(index));
    await vi.advanceTimersByTimeAsync(5);
  }
  expect(save).not.toHaveBeenCalled();
  expect(writer.dirty()).toBe(true);
  await vi.advanceTimersByTimeAsync(800);
  expect(save).toHaveBeenCalledExactlyOnceWith('真实简历'.repeat(120));
  expect(writer.dirty()).toBe(false);
  expect(onStatus).toHaveBeenLastCalledWith('saved');
});
it('serializes saves and skips all intermediate edits while an acknowledgement is pending', async () => {
  let finish!: (value: boolean) => void;
  const save = vi
    .fn<(value: string) => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(true);
  const writer = createCoalescedDraftWriter({
    save,
    scope: () => 'account-a:1',
    onStatus: vi.fn(),
  });
  writer.edit('first');
  const pending = writer.flush();
  writer.edit('middle');
  writer.edit('newest');
  await vi.advanceTimersByTimeAsync(800);
  expect(save).toHaveBeenCalledExactlyOnceWith('first');
  finish(true);
  await pending;
  expect(save.mock.calls.map(([value]) => value)).toEqual(['first', 'newest']);
  expect(writer.dirty()).toBe(false);
});
it('retains the latest draft after a rate-limit failure and waits for an explicit retry', async () => {
  let finish!: (value: boolean) => void;
  const save = vi
    .fn<(value: string) => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(true);
  const onStatus = vi.fn(),
    onConfirmed = vi.fn();
  const writer = createCoalescedDraftWriter({
    save,
    scope: () => 'account-a:1',
    onStatus,
    onConfirmed,
  });
  writer.edit('old request');
  const pending = writer.flush();
  writer.edit('newest unsaved draft');
  finish(false);
  expect(await pending).toBe(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(writer.dirty()).toBe(true);
  expect(onStatus).toHaveBeenLastCalledWith('failed');
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(await writer.flush()).toBe(true);
  expect(save).toHaveBeenLastCalledWith('newest unsaved draft');
  expect(onConfirmed).toHaveBeenCalledExactlyOnceWith('newest unsaved draft');
});
it('does not write a queued draft after the account generation changes, even for the same account id', async () => {
  let scope: string | null = 'account-a:1';
  const save = vi.fn(async (_value: string) => true),
    onStatus = vi.fn();
  const writer = createCoalescedDraftWriter({ save, scope: () => scope, onStatus });
  writer.edit('private draft');
  scope = 'account-a:2';
  await vi.advanceTimersByTimeAsync(800);
  expect(save).not.toHaveBeenCalled();
  expect(onStatus).toHaveBeenLastCalledWith('failed');
  writer.edit('logged-out edit');
  scope = null;
  await vi.advanceTimersByTimeAsync(800);
  expect(save).not.toHaveBeenCalled();
});
it('cancels timers on unmount and allows a recovered memory draft to be retried on remount', async () => {
  const save = vi.fn(async (_value: string) => true);
  const writer = createCoalescedDraftWriter({
    save,
    scope: () => 'account-a:1',
    onStatus: vi.fn(),
  });
  writer.edit('draft to recover');
  writer.stop();
  await vi.advanceTimersByTimeAsync(800);
  expect(save).not.toHaveBeenCalled();
  const recovered = createCoalescedDraftWriter({
    save,
    scope: () => 'account-a:1',
    onStatus: vi.fn(),
    initial: 'draft to recover',
  });
  expect(recovered.dirty()).toBe(true);
  expect(await recovered.flush()).toBe(true);
  expect(save).toHaveBeenCalledExactlyOnceWith('draft to recover');
});
it('preserves realtime dimension arrays and retries the latest weights after a thrown save failure', async () => {
  const save = vi
    .fn<(value: { id: string; weight: number }[]) => Promise<boolean>>()
    .mockRejectedValueOnce(new Error('429'))
    .mockResolvedValue(true);
  const writer = createCoalescedDraftWriter({
    save,
    scope: () => 'account-a:1',
    onStatus: vi.fn(),
  });
  writer.edit([{ id: 'pay', weight: 1 }]);
  for (let weight = 2; weight <= 99; weight++) writer.edit([{ id: 'pay', weight }]);
  expect(save).not.toHaveBeenCalled();
  expect(await writer.flush()).toBe(false);
  expect(save).toHaveBeenCalledExactlyOnceWith([{ id: 'pay', weight: 99 }]);
  expect(await writer.flush()).toBe(true);
  expect(save).toHaveBeenLastCalledWith([{ id: 'pay', weight: 99 }]);
  await turn();
});

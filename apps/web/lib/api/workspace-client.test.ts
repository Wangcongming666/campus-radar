import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeWorkspace, clearWorkspace, readWorkspaceValue, saveWorkspaceValue,
  reloadWorkspaceRecord, workspacePendingCount,
  workspaceErrors,
} from './workspace-client';
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const response = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { 'X-Campus-Data-Mode': 'api', ...headers } });
beforeEach(() => {
  clearWorkspace();
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
});
afterEach(() => { clearWorkspace(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('waits for the API acknowledgement and sends the current revision with CSRF', async () => {
  initializeWorkspace('user-a', { events: { value: [], version: 3 } });
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/me')) return response({ data: {} }, 200, { 'X-CSRF-Token': 'csrf-a' });
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('csrf-a');
    expect(JSON.parse(String(options?.body))).toEqual({ value: ['interview'], expectedVersion: 3 });
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  vi.stubGlobal('fetch', fetcher);
  const saving = saveWorkspaceValue('events', ['interview']);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(readWorkspaceValue('events', [])).toEqual([]);
  expect(workspacePendingCount()).toBe(1);
  finish(response({ data: { value: ['interview'], version: 4 } }));
  expect(await saving).toBe(true);
  expect(readWorkspaceValue('events', [])).toEqual(['interview']);
  expect(workspacePendingCount()).toBe(0);
});
it('serializes functional updates so rapid changes do not overwrite the previous save', async () => {
  initializeWorkspace('user-a', { events: { value: [], version: 0 } });
  const revisions: number[] = [];
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/me')) return response({ data: {} }, 200, { 'X-CSRF-Token': 'csrf' });
    const input = JSON.parse(String(options?.body));
    revisions.push(input.expectedVersion);
    return response({ data: { value: input.value, version: input.expectedVersion + 1 } });
  });
  await Promise.all([
    saveWorkspaceValue<string[]>('events', (items) => [...items, 'a']),
    saveWorkspaceValue<string[]>('events', (items) => [...items, 'b']),
  ]);
  expect(readWorkspaceValue('events', [])).toEqual(['a', 'b']);
  expect(revisions).toEqual([0, 1]);
});
it('keeps the last confirmed value on errors or conflicts until the user reloads', async () => {
  initializeWorkspace('user-a', { events: { value: ['saved'], version: 1 } });
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/me')) return response({ data: {} }, 200, { 'X-CSRF-Token': 'csrf' });
    return options?.method === 'PUT'
      ? response({ error: { code: 'VERSION_CONFLICT', message: '其他窗口已更新' } }, 409)
      : response({ data: { value: ['remote'], version: 2 } });
  });
  expect(await saveWorkspaceValue('events', ['unsaved'])).toBe(false);
  expect(readWorkspaceValue('events', [])).toEqual(['saved']);
  expect(workspaceErrors()).toEqual([{ key: 'events', message: '其他窗口已更新' }]);
  await reloadWorkspaceRecord('events');
  expect(readWorkspaceValue('events', [])).toEqual(['remote']);
  expect(workspaceErrors()).toEqual([]);
});
it('discards a delayed response after the account changes', async () => {
  initializeWorkspace('user-a', { events: { value: ['a'], version: 1 } });
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', async (url: string) => url.endsWith('/me')
    ? response({ data: {} }, 200, { 'X-CSRF-Token': 'csrf' })
    : new Promise<Response>((resolve) => { finish = resolve; }));
  const saving = saveWorkspaceValue('events', ['private-a']);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  clearWorkspace();
  initializeWorkspace('user-b', { events: { value: ['b'], version: 1 } });
  finish(response({ data: { value: ['private-a'], version: 2 } }));
  expect(await saving).toBe(false);
  expect(readWorkspaceValue('events', [])).toEqual(['b']);
});
it('does not seed sample arrays or allow saves without an authenticated workspace', async () => {
  initializeWorkspace('user-a', {});
  expect(readWorkspaceValue('events', ['fictional interview'])).toEqual([]);
  clearWorkspace();
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect(await saveWorkspaceValue('events', ['a'])).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

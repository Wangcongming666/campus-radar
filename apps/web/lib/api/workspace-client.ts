'use client';
import { useRef, useSyncExternalStore, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { CampusApiError } from './adapter';

export const isApiMode = () => process.env.NEXT_PUBLIC_DATA_MODE === 'api';
export type WorkspaceRecord = { value: unknown; version: number; error?: string };
export type WorkspaceRecords = Record<string, WorkspaceRecord>;
const empty: WorkspaceRecord = { value: null, version: 0 };
let records: WorkspaceRecords = {};
let owner: string | null = null;
let generation = 0;
let csrf: string | undefined;
let csrfRequest: Promise<void> | null = null;
let revision = 0;
let pending = 0;
const subscribers = new Set<() => void>();
const queues = new Map<string, Promise<boolean>>();
const changed = () => { revision++; subscribers.forEach((fn) => fn()); };
export const subscribeWorkspace = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
export const getWorkspaceRevision = () => revision;
export const workspacePendingCount = () => pending;
export const workspaceOwner = () => owner;
export const workspaceErrors = () => Object.entries(records)
  .flatMap(([key, record]) => record.error ? [{ key, message: record.error }] : []);

export function clearWorkspace() {
  generation++; owner = null; records = {}; csrf = undefined; csrfRequest = null;
  queues.clear(); pending = 0; changed();
}
export function initializeWorkspace(userId: string, next: WorkspaceRecords) {
  if (owner !== userId) clearWorkspace();
  owner = userId;
  records = Object.fromEntries(Object.entries(next).map(([key, item]) => [key, { value: item.value, version: item.version }]));
  changed();
}
export function readWorkspaceValue<T>(key: string, initial: T): T {
  const item = records[key];
  if (item && item.value !== null) return item.value as T;
  // Never seed fictional rows into a real account. Object/scalar defaults are form configuration.
  return Array.isArray(initial) && key !== 'offer-dimensions-v2' ? [] as T : initial;
}
export function workspaceRecord(key: string) { return records[key] ?? empty; }
type ApiOptions = { method?: string; body?: unknown; signal?: AbortSignal; headers?: HeadersInit };
function apiUrl(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) throw new Error('无效 API 路径。');
  return path.startsWith('/api/v1/') ? path : '/api/v1' + path;
}
async function checkedFetch(path: string, options: ApiOptions): Promise<Response> {
  const active = generation;
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  const binary = options.body instanceof Blob || options.body instanceof FormData;
  if (options.body !== undefined && !binary) headers.set('Content-Type', 'application/json');
  if (csrf && !['GET', 'HEAD'].includes(method)) headers.set('X-CSRF-Token', csrf);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method, headers, signal: options.signal, credentials: 'same-origin', cache: 'no-store',
      body: options.body === undefined ? undefined : binary ? options.body as BodyInit : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接服务器，内容尚未保存。请检查网络后重试。');
  }
  const token = response.headers.get('X-CSRF-Token');
  if (token && active === generation) csrf = token;
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('radar-api-auth-expired'));
    throw new CampusApiError(response.status, value?.error?.code ?? 'REQUEST_FAILED', value?.error?.message ?? '服务器未完成保存，请重试。');
  }
  if (response.headers.get('X-Campus-Data-Mode') !== 'api') throw new Error('服务器未启用真实数据模式，操作已停止。');
  return response;
}
export async function apiFetch(path: string, options: ApiOptions = {}): Promise<Response> {
  const active = generation;
  if (!['GET', 'HEAD'].includes(options.method ?? 'GET') && !csrf) {
    if (!csrfRequest) csrfRequest = checkedFetch('/me', {}).then(() => {
      if (!csrf) throw new Error('服务器未返回安全令牌，请重新登录。');
    }).finally(() => { csrfRequest = null; });
    await csrfRequest;
  }
  if (active !== generation) throw new Error('账号已切换，原操作已取消。');
  return checkedFetch(path, options);
}
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export async function reloadWorkspaceRecord(key: string): Promise<void> {
  const active = generation;
  const value = await apiRequest<{ data: WorkspaceRecord }>('/workspace/records/' + encodeURIComponent(key));
  if (generation !== active || !owner) return;
  records = { ...records, [key]: value.data }; changed();
}
export async function saveWorkspaceValue<T>(key: string, update: SetStateAction<T>): Promise<boolean> {
  if (!owner) return false;
  const active = generation;
  const previous = queues.get(key) ?? Promise.resolve(true);
  pending++; changed();
  const task = previous.catch(() => false).then(async () => {
    if (active !== generation || !owner) return false;
    try {
      const current = workspaceRecord(key);
      const value = typeof update === 'function'
        ? (update as (previous: T) => T)(current.value as T)
        : update;
      const result = await apiRequest<{ data: WorkspaceRecord }>('/workspace/records/' + encodeURIComponent(key), {
        method: 'PUT', body: { value, expectedVersion: current.version },
      });
      if (active !== generation || !owner) return false;
      records = { ...records, [key]: result.data }; changed();
      return true;
    } catch (error) {
      if (active === generation) {
        const message = error instanceof Error ? error.message : '服务器保存失败，编辑内容尚未提交。';
        records = { ...records, [key]: { ...workspaceRecord(key), error: message } };
        changed(); toast.error(message, { id: 'api-save-' + key });
      }
      return false;
    } finally {
      if (active === generation) { pending = Math.max(0, pending - 1); changed(); }
    }
  });
  queues.set(key, task);
  void task.finally(() => { if (queues.get(key) === task) queues.delete(key); });
  return task;
}
export function useWorkspaceRecord<T>(key: string, initial: T) {
  const fallback = useRef({ key, value: Array.isArray(initial) && key !== 'offer-dimensions-v2' ? [] as T : initial });
  if (fallback.current.key !== key) fallback.current = {
    key, value: Array.isArray(initial) && key !== 'offer-dimensions-v2' ? [] as T : initial,
  };
  useSyncExternalStore(subscribeWorkspace, getWorkspaceRevision, () => 0);
  return {
    value: (records[key]?.value ?? fallback.current.value) as T,
    error: workspaceRecord(key).error ?? '',
    ready: !!owner,
    save: (next: SetStateAction<T>) => saveWorkspaceValue<T>(key, (previous) => {
      const current = previous ?? fallback.current.value;
      return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
    }),
  };
}

import { z } from 'zod';
import { workspaceSchema } from './workspace-schema';
import { isCalendarEvents } from './calendar-domain';

export const LOCAL_STATE_EVENT = 'radar-local-change';
export const LOCAL_RESET_EVENT = 'radar-local-reset';
export const localStorageKey = (key: string) => `radar-extended-${key}`;

function compatible(value: unknown, sample: unknown): boolean {
  if (sample === null) return value === null || typeof value === 'object';
  if (Array.isArray(sample))
    return (
      Array.isArray(value) && (!sample.length || value.every((item) => compatible(item, sample[0])))
    );
  if (typeof sample === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.entries(sample).every(
      ([key, item]) => key in record && compatible(record[key], item),
    );
  }
  return typeof value === typeof sample && (typeof value !== 'number' || Number.isFinite(value));
}
export function parseLocalValue<T>(raw: string | null, initial: T): T {
  if (!raw) return initial;
  try {
    const value: unknown = JSON.parse(raw);
    return compatible(value, initial) ? (value as T) : initial;
  } catch {
    return initial;
  }
}

const backupSchema = z
  .object({
    product: z.literal('Campus Radar'),
    schemaVersion: z.literal(1),
    createdAt: z.string().max(100),
    entries: z.record(
      z
        .string()
        .max(200)
        .refine((key) => key === 'campus-radar-demo-v1' || key.startsWith('radar-extended-')),
      z.string().max(8_000_000),
    ),
  })
  .strict();
export type LocalBackup = z.infer<typeof backupSchema>;
export function validateLocalBackup(value: unknown): LocalBackup {
  const backup = backupSchema.parse(value);
  if (Object.keys(backup.entries).length > 300) throw new Error('备份项目过多。');
  for (const [key, raw] of Object.entries(backup.entries)) {
    const parsed: unknown = JSON.parse(raw);
    if (key === 'radar-extended-events' && !isCalendarEvents(parsed))
      throw new Error('日程备份格式不正确。');
    if (key === 'campus-radar-demo-v1') {
      const envelope = z
        .object({ state: workspaceSchema, version: z.number().int().optional() })
        .parse(parsed);
      backup.entries[key] = JSON.stringify(envelope);
    }
  }
  return backup;
}
type LocalStoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function restoreLocalBackup(storage: LocalStoragePort, backup: LocalBackup) {
  const written: string[] = [],
    before = new Map<string, string | null>();
  try {
    for (const [key, raw] of Object.entries(backup.entries)) {
      before.set(key, storage.getItem(key));
      storage.setItem(key, raw);
      written.push(key);
    }
  } catch (error) {
    for (const key of written.reverse()) {
      const old = before.get(key);
      if (old === null || old === undefined) storage.removeItem(key);
      else storage.setItem(key, old);
    }
    throw error;
  }
}
export function downloadLocalFile(
  name: string,
  content: BlobPart,
  type = 'text/plain;charset=utf-8',
) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

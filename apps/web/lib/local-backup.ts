'use client';
import { z } from 'zod';
import { validateLocalBackup, restoreLocalBackup, type LocalBackup } from './local-workspace';
import {
  listInterviewFiles,
  putInterviewFile,
  deleteInterviewFile,
  type StoredInterviewFile,
} from './interview-repository';
import { useRadarStore } from './store';

const fileSchema = z
  .object({
    id: z.string().min(1).max(180),
    name: z.string().max(240),
    updatedAt: z.string().max(100),
    type: z
      .string()
      .max(150)
      .refine(
        (type) =>
          !type ||
          type === 'application/pdf' ||
          type === 'application/octet-stream' ||
          type.startsWith('text/plain') ||
          type.startsWith('text/markdown') ||
          type.startsWith('audio/'),
      ),
    data: z
      .string()
      .max(70_000_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
const attachmentSchema = z.array(fileSchema).max(100);
export type WorkspaceBackup = LocalBackup & {
  files: z.infer<typeof attachmentSchema>;
  theme?: 'dark' | 'light' | 'system';
};
export function decodeWorkspaceBackup(value: unknown): WorkspaceBackup {
  const input = z.record(z.string(), z.unknown()).parse(value);
  const { files = [], theme, ...metadata } = input;
  return {
    ...validateLocalBackup(metadata),
    files: attachmentSchema.parse(files),
    ...(theme === undefined ? {} : { theme: z.enum(['dark', 'light', 'system']).parse(theme) }),
  };
}
async function encodeFile(file: StoredInterviewFile) {
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return {
    id: file.id,
    name: file.name,
    updatedAt: file.updatedAt,
    type: file.blob.type,
    data: btoa(binary),
  };
}
export async function createWorkspaceBackup(
  includeFiles: boolean,
  theme?: string,
): Promise<WorkspaceBackup> {
  const entries: Record<string, string> = {};
  for (const key of Object.keys(localStorage)) {
    if (key === 'campus-radar-demo-v1' || key.startsWith('radar-extended-')) {
      const value = localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }
  // This snapshot also recovers changes held in memory after a storage quota failure.
  const { favorites, applications, notes, completed, userName, profileComplete, notifications } =
    useRadarStore.getState();
  entries['campus-radar-demo-v1'] = JSON.stringify({
    state: { favorites, applications, notes, completed, userName, profileComplete, notifications },
    version: 0,
  });
  const files = includeFiles ? await listInterviewFiles() : [];
  if (files.reduce((sum, file) => sum + file.blob.size, 0) > 50 * 1024 * 1024)
    throw new Error('附件总量超过 50 MB，请先分别下载附件，或取消「包含附件」再导出记录。');
  return decodeWorkspaceBackup({
    product: 'Campus Radar',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    entries,
    files: await Promise.all(files.map(encodeFile)),
    ...(['dark', 'light', 'system'].includes(theme ?? '') ? { theme } : {}),
  });
}
export async function importWorkspaceBackup(backup: WorkspaceBackup) {
  const decoded = backup.files.map((file) => {
    const raw = atob(file.data),
      bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    return {
      id: file.id,
      name: file.name,
      updatedAt: file.updatedAt,
      blob: new Blob([bytes], { type: file.type }),
    } satisfies StoredInterviewFile;
  });
  const previous = decoded.length ? await listInterviewFiles() : [];
  const written: string[] = [];
  try {
    for (const file of decoded) {
      await putInterviewFile(file);
      written.push(file.id);
    }
    restoreLocalBackup(localStorage, backup);
  } catch (error) {
    for (const id of written) {
      const original = previous.find((file) => file.id === id);
      if (original) await putInterviewFile(original);
      else await deleteInterviewFile(id);
    }
    throw error;
  }
}

'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCampus } from './campus-provider';
import { configureApiRadar, hydrateApiRadar, resetApiRadar, type RadarNotification } from '@/lib/store';
import { loadCatalog, resetApiCatalog } from '@/lib/catalog';
import {
  apiRequest, initializeWorkspace, clearWorkspace, readWorkspaceValue, saveWorkspaceValue,
  getWorkspaceRevision, subscribeWorkspace, workspacePendingCount, type WorkspaceRecords,
  workspaceErrors,
} from '@/lib/api/workspace-client';
import { Button } from './ui/button';
import { LoaderCircle, Database, AlertTriangle } from 'lucide-react';
import { WorkspaceSaveErrors } from './workspace-save-errors';

/** Children mount only after the authenticated account's server snapshot is ready. */
export function ApiWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, adapter, refresh } = useCampus();
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useSyncExternalStore(subscribeWorkspace, getWorkspaceRevision, () => 0);
  const pending = workspacePendingCount();
  const failures = workspaceErrors();
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const id = user?.id;
    setLoadedUser(null); setError(''); clearWorkspace(); resetApiRadar(); resetApiCatalog();
    if (!id) return;
    const bridge = {
      notes: (value: Record<string, string>) => saveWorkspaceValue('radar-core-notes', value),
      completed: (value: string[]) => saveWorkspaceValue('radar-core-completed', value),
      notifications: (value: RadarNotification[]) => saveWorkspaceValue('radar-core-notifications', value),
    };
    void Promise.all([
      apiRequest<{ data: { records: WorkspaceRecords } }>('/workspace', { signal: controller.signal }),
      loadCatalog(adapter, controller.signal),
    ]).then(async ([workspace]) => {
      if (cancelled) return;
      initializeWorkspace(id, workspace.data.records);
      configureApiRadar(adapter, id, bridge);
      await hydrateApiRadar({
        notes: readWorkspaceValue('radar-core-notes', {}),
        completed: readWorkspaceValue('radar-core-completed', []),
        notifications: readWorkspaceValue('radar-core-notifications', []),
        userName: user.displayName,
      });
      if (!cancelled) setLoadedUser(id);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '数据加载失败，请重试。');
    });
    const expired = () => { void refresh(); };
    const catalogChanged = () => { void loadCatalog(adapter, controller.signal).catch(() => undefined); };
    window.addEventListener('radar-api-auth-expired', expired);
    window.addEventListener('radar-api-catalog-refresh', catalogChanged);
    return () => {
      cancelled = true; controller.abort(); clearWorkspace(); resetApiRadar(); resetApiCatalog();
      window.removeEventListener('radar-api-auth-expired', expired);
      window.removeEventListener('radar-api-catalog-refresh', catalogChanged);
    };
  }, [user?.id, adapter, attempt]);
  if (error) return <div className="mx-auto max-w-lg p-8 pt-24 text-center" role="alert">
    <AlertTriangle className="mx-auto mb-4 size-8 text-destructive" />
    <h1 className="text-xl font-semibold">暂时无法读取账户数据</h1>
    <p className="my-4 text-sm text-muted-foreground">{error}</p>
    <Button onClick={() => setAttempt((value) => value + 1)}>重新连接数据库</Button>
  </div>;
  if (!user || loadedUser !== user.id) return <div className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground" role="status">
    <LoaderCircle className="size-5 animate-spin" />正在读取账户数据…
  </div>;
  return <>
    {children}
    <WorkspaceSaveErrors />
    <div role="status" className="pointer-events-none fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-[10px] text-muted-foreground shadow-sm md:bottom-4">
      {pending ? <LoaderCircle className="size-3 animate-spin" /> : <Database className="size-3 text-primary" />}
      {pending ? `正在保存到数据库（${pending}）` : failures.length ? '有内容尚未保存' : '数据库已连接'}
    </div>
  </>;
}

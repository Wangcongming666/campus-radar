'use client';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import {
  isApiMode, workspaceErrors, workspacePendingCount, subscribeWorkspace,
  getWorkspaceRevision, reloadWorkspaceRecord,
} from '@/lib/api/workspace-client';

/** Render inside modal content too: an outside control is inert behind Radix's overlay. */
export function WorkspaceSaveErrors({ inline = false }: { inline?: boolean }) {
  useSyncExternalStore(subscribeWorkspace, getWorkspaceRevision, () => 0);
  const failures = workspaceErrors();
  if (!isApiMode() || !failures.length) return null;
  return <div role="alert" className={cn('rounded-xl border border-destructive/40 bg-background p-4',
    inline ? 'my-3' : 'fixed bottom-32 right-4 z-[80] max-w-md shadow-xl md:bottom-16')}>
    <p className="text-sm font-medium">有内容尚未保存</p>
    <p className="mt-1 text-xs leading-6 text-muted-foreground">{failures[0].message}。可载入服务器最新版本，检查当前草稿后重新保存。</p>
    <Button size="sm" variant="outline" className="mt-3" disabled={workspacePendingCount() > 0} onClick={async () => {
      try {
        await Promise.all(failures.map(({ key }) => reloadWorkspaceRecord(key)));
        toast.success('已载入服务器版本，请核对内容后重新保存');
      } catch (failure) { toast.error(failure instanceof Error ? failure.message : '重新加载失败'); }
    }}>载入服务器最新版本</Button>
  </div>;
}

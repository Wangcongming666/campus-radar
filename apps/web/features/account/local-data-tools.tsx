'use client';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Download, Upload, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/extended/common';
import {
  createWorkspaceBackup,
  decodeWorkspaceBackup,
  importWorkspaceBackup,
  type WorkspaceBackup,
} from '@/lib/local-backup';
import { downloadLocalFile } from '@/lib/local-workspace';

export function LocalDataTools() {
  const { theme, setTheme } = useTheme();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [incoming, setIncoming] = useState<WorkspaceBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function exportBackup() {
    setBusy(true);
    setError('');
    try {
      const backup = await createWorkspaceBackup(includeFiles, theme);
      downloadLocalFile('campus-radar-backup.json', JSON.stringify(backup), 'application/json');
      toast.success('完整本机记录已导出');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '导出失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  async function inspect(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('备份文件不能超过 100 MB。');
      setIncoming(decodeWorkspaceBackup(JSON.parse(await file.text())));
    } catch {
      setError('无法读取备份：请选择本平台导出的完整 JSON 备份，检查格式与大小。');
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!incoming) return;
    setBusy(true);
    setError('');
    try {
      await importWorkspaceBackup(incoming);
      if (incoming.theme) setTheme(incoming.theme);
      toast.success('备份已恢复，正在重新打开工作台');
      window.location.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '恢复失败，原有记录已保留。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border-t border-border mt-5 pt-5 space-y-4">
      <h3 className="text-sm font-medium">备份与恢复全部本机记录</h3>
      <p className="text-xs text-muted-foreground leading-6">
        包含投递、收藏、知识笔记、个人面经、题单、规划、Offer、模拟报告与模块偏好。附件默认包含上传简历和录音；备份只下载到你的设备。
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeFiles}
          onChange={(event) => setIncludeFiles(event.target.checked)}
          className="accent-primary"
        />
        包含简历与录音附件（最多 50 MB）
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportBackup()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Download />}导出完整备份
        </Button>
        <label className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs cursor-pointer hover:bg-accent">
          <Upload size={14} />
          选择备份文件
          <input
            aria-label="导入备份文件"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="field-error break-words">
          {error}
        </p>
      )}
      <Modal
        open={!!incoming}
        onClose={() => {
          if (!busy) setIncoming(null);
        }}
        title="恢复这份本机备份？"
        description="覆盖备份中同名记录，其他记录保留。不会导入账号密码或云端登录会话。"
      >
        <p className="text-sm text-muted-foreground">
          {incoming ? Object.keys(incoming.entries).length : 0} 类记录 ·{' '}
          {incoming?.files.length ?? 0} 个附件
        </p>
        <p className="text-xs text-muted-foreground">备份时间：{incoming?.createdAt}</p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void restore()}>
          {busy && <LoaderCircle className="animate-spin" />}确认恢复备份
        </Button>
      </Modal>
    </div>
  );
}

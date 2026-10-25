'use client';
import { useState } from 'react';
import { Download, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useCampus } from '@/components/campus-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/extended/common';
import { apiRequest, workspacePendingCount } from '@/lib/api/workspace-client';
import { downloadLocalFile } from '@/lib/local-workspace';
import type { CloudBackup } from '@/server/account-data';

export function CloudDataTools() {
  const { user } = useCampus();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [incoming, setIncoming] = useState<CloudBackup | null>(null);
  const [expectedVersion, setExpectedVersion] = useState('');
  const [resetting, setResetting] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  async function currentVersion() {
    if (workspacePendingCount())
      throw new Error('仍有内容正在保存，请等待保存完成后再备份或恢复。');
    const response = await apiRequest<{ data: CloudBackup }>(
      '/workspace/export?includeFiles=false',
    );
    setExpectedVersion(response.data.stateVersion);
    return response.data.stateVersion;
  }
  function failure(value: unknown) {
    setError(value instanceof Error ? value.message : '服务器未完成操作，请重试。');
  }
  async function exportBackup() {
    setBusy(true);
    setError('');
    try {
      if (workspacePendingCount()) throw new Error('仍有内容正在保存，请稍后再导出。');
      const result = await apiRequest<{ data: CloudBackup }>(
        '/workspace/export?includeFiles=' + includeFiles,
      );
      downloadLocalFile(
        'campus-radar-cloud-backup.json',
        JSON.stringify(result.data),
        'application/json',
      );
      toast.success('账号原生备份已导出');
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('备份文件不能超过 100 MB。');
      const value: unknown = JSON.parse(await file.text());
      if (
        !value ||
        typeof value !== 'object' ||
        !('format' in value) ||
        value.format !== 'campus-radar-cloud' ||
        !('ownerId' in value)
      )
        throw new Error('只接受服务器导出的原生账号备份。本地演示备份不能导入真实账号。');
      if (value.ownerId !== user?.id)
        throw new Error('这份备份属于另一个账号。请登录备份所属账号后恢复。');
      await currentVersion();
      setIncoming(value as CloudBackup);
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!incoming || !expectedVersion || busy) return;
    setBusy(true);
    setError('');
    try {
      if (workspacePendingCount()) throw new Error('仍有内容正在保存，请等待保存完成后再恢复。');
      const response = await apiRequest<{ data: { cleanupFailures: number } }>(
        '/workspace/import',
        {
          method: 'POST',
          body: { backup: incoming, expectedVersion, confirm: 'RESTORE' },
        },
      );
      if (response.data.cleanupFailures) {
        setError(
          `账号数据已恢复，但有 ${response.data.cleanupFailures} 个旧附件原件未能清理。请联系管理员处理服务器文件。`,
        );
        toast.warning('数据已恢复，旧文件清理未完成');
        setIncoming(null);
        setNeedsReload(true);
      } else {
        toast.success('账号数据已恢复，正在重新加载');
        window.location.reload();
      }
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  async function prepareReset() {
    setBusy(true);
    setError('');
    try {
      await currentVersion();
      setResetting(true);
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!expectedVersion || busy) return;
    setBusy(true);
    setError('');
    try {
      if (workspacePendingCount()) throw new Error('仍有内容正在保存，请等待保存完成后再清空。');
      const response = await apiRequest<{ data: { cleanupFailures: number } }>('/workspace/reset', {
        method: 'POST',
        body: { expectedVersion, confirm: 'RESET' },
      });
      if (response.data.cleanupFailures) {
        setError(
          `账号私有数据已清空，但有 ${response.data.cleanupFailures} 个附件原件未能清理。请联系管理员处理服务器文件。`,
        );
        toast.warning('私有记录已清空，文件原件清理未完成');
        setResetting(false);
        setNeedsReload(true);
      } else {
        toast.success('本账户私有数据已清空');
        window.location.reload();
      }
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-medium">账号数据备份与恢复</h3>
      <p className="text-xs leading-6 text-muted-foreground">
        备份读取服务器数据库，包含个人资料、真实投递与阶段历史、收藏、章节进度、工作区记录和附件信息。
        可选包含简历与录音原件；密码和登录会话不在备份中。仅同一账号可恢复未经修改的原生备份。
        公开原创面经与后台任务回执会导出供查阅；恢复不会重新发布内容或重放后台任务。
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeFiles}
          onChange={(event) => setIncludeFiles(event.target.checked)}
        />
        包含简历与录音附件（合计最多 50 MB）
      </label>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={exportBackup}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Download />}导出账号备份
        </Button>
        <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs cursor-pointer hover:bg-accent">
          <Upload size={14} />
          选择账号备份
          <input
            aria-label="导入账号备份文件"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        未包含附件原件的备份，仅在账号仍有相同文件时才能恢复。备份签名依赖本服务密钥；更换密钥后的旧备份需要管理员处理。
      </p>
      <div className="border-t pt-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">清空本账户私有求职数据</h3>
          <p className="text-xs leading-6 text-muted-foreground mt-2">
            清空投递、收藏、工作区记录与附件。账号身份、个人资料、公开原创面经和后台任务回执保留。此操作不是删除账号。
          </p>
        </div>
        <Button
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={prepareReset}
        >
          <Trash2 />
          清空私有数据
        </Button>
      </div>
      {error && (
        <p role="alert" className="field-error break-words">
          {error}
        </p>
      )}
      {needsReload && (
        <Button variant="outline" onClick={() => window.location.reload()}>
          重新加载已保存的账号数据
        </Button>
      )}
      <Modal
        open={!!incoming}
        onClose={() => {
          if (!busy) setIncoming(null);
        }}
        title="恢复这份账号备份？"
        description="备份会替换本账户的私有记录、投递、收藏与附件，并恢复资料偏好。请先导出当前数据；不会修改其他账号或岗位库。"
      >
        <p className="text-sm text-muted-foreground">
          备份时间：{incoming?.createdAt ?? '待服务器校验'}
        </p>
        <p className="text-xs text-muted-foreground">
          服务器会校验所有记录、附件与版本；校验失败则数据库不提交。
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={restore}>
          {busy && <LoaderCircle className="animate-spin" />}确认替换并恢复账号备份
        </Button>
      </Modal>
      <Modal
        open={resetting}
        onClose={() => {
          if (!busy) setResetting(false);
        }}
        title="清空本账户的私有数据？"
        description="此操作会在服务器删除当前账号的投递、收藏、私有工作区与附件记录。身份、资料、公开原创和后台任务回执保留。请先导出包含附件的备份。"
      >
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button variant="destructive" disabled={busy} onClick={reset}>
          {busy && <LoaderCircle className="animate-spin" />}确认清空本账户私有数据
        </Button>
      </Modal>
    </div>
  );
}

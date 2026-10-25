'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Check,
  GitCompareArrows,
  Download,
  ArrowUpRight,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Panel, DemoNotice, EmptyState, SmallTag } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ResumePdfPreview } from '@/components/resume-pdf-preview';
import { useRadarStore } from '@/lib/store';
import { getJob, getCompany } from '@/lib/data';
import {
  assertSafeResumeFile,
  isResumeLibrary,
  resumeDiff,
  validateResumeFile,
  type ResumeVersion,
} from '@/lib/resume-files';
import { extractResumeText } from '@/lib/resume-extract';
import {
  deleteInterviewFile,
  downloadInterviewBlob,
  readInterviewFile,
  saveInterviewFile,
  useInterviewLocal,
} from '@/lib/interview-repository';
import { Field, Modal, Pick } from './common';
import { isApiMode } from '@/lib/api/workspace-client';

export function ResumesPage() {
  const library = useInterviewLocal<ResumeVersion[]>('resume-library-v2', [], isResumeLibrary);
  const applications = useRadarStore((s) => s.applications);
  const updateApplication = useRadarStore((s) => s.updateApplication);
  const [selected, setSelected] = useState('');
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('前端开发');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState(false);
  const [compareId, setCompareId] = useState('');
  const [remove, setRemove] = useState(false);
  const [url, setUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [draftText, setDraftText] = useState('');
  const current = library.value.find((x) => x.id === selected) ?? library.value[0];
  const previous =
    library.value.find((x) => x.id === compareId) ??
    library.value.find((x) => x.id !== current?.id);
  const changes = useMemo(
    () => (previous && current ? resumeDiff(previous.text, current.text) : []),
    [previous, current],
  );
  const linked = applications.filter((x) => x.resumeId === current?.id);
  useEffect(() => setDraftText(current?.text ?? ''), [current?.id, current?.text]);
  useEffect(() => {
    let cancelled = false,
      objectUrl = '';
    setUrl('');
    setPreviewError('');
    if (current)
      readInterviewFile(current.id)
        .then(async (saved) => {
          if (cancelled) return;
          if (!saved) {
            setPreviewError('此版本的原文件已不存在，请重新上传。文字记录仍可查看。');
            return;
          }
          const original = new File([saved.blob], current.fileName, { type: saved.blob.type });
          await assertSafeResumeFile(original);
          if (cancelled) return;
          const safeType = /\.pdf$/i.test(current.fileName)
            ? 'application/pdf'
            : 'text/plain;charset=utf-8';
          objectUrl = URL.createObjectURL(new Blob([saved.blob], { type: safeType }));
          setUrl(objectUrl);
        })
        .catch((e) => {
          if (!cancelled) setPreviewError(e.message);
        });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.id]);
  async function create() {
    if (!file || !name.trim() || busy) return;
    const invalid = validateResumeFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    const id = `resume-${crypto.randomUUID()}`;
    try {
      await assertSafeResumeFile(file);
      let extracted: { text: string; note?: string };
      try {
        extracted = await extractResumeText(file);
      } catch (e) {
        extracted = {
          text: '',
          note: `文字提取失败：${e instanceof Error ? e.message : '无法解析文件'}。原件仍可预览和下载，可手动补充文字。`,
        };
      }
      const safeType = /\.pdf$/i.test(file.name) ? 'application/pdf' : 'text/plain;charset=utf-8';
      await saveInterviewFile(id, new Blob([file], { type: safeType }), file.name);
      const item: ResumeVersion = {
        id,
        name: name.trim(),
        fileName: file.name,
        mime: safeType,
        size: file.size,
        text: extracted.text,
        role,
        createdAt: new Date().toISOString(),
        version: Math.max(0, ...library.value.map((x) => x.version)) + 1,
        default: !library.value.length,
        applicationIds: [],
        extractionNote: extracted.note,
      };
      if (!(await library.save((items) => [item, ...items]))) {
        await deleteInterviewFile(id);
        return;
      }
      setSelected(id);
      setAdd(false);
      setName('');
      setFile(null);
      toast.success('简历原文件与版本已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!current) return;
    try {
      const saved = await readInterviewFile(current.id);
      if (!saved) throw new Error('原文件不存在，请重新上传。');
      downloadInterviewBlob(saved.blob, saved.name);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : '下载失败');
    }
  }
  async function deleteVersion() {
    if (!current || busy) return;
    setBusy(true);
    try {
      const before = library.value;
      const remaining = library.value.filter((x) => x.id !== current.id);
      if (current.default && remaining[0]) remaining[0] = { ...remaining[0], default: true };
      if (!(await library.save(remaining))) return;
      try {
        await deleteInterviewFile(current.id);
      } catch (e) {
        await library.save(before);
        throw e;
      }
      for (const app of linked) await updateApplication(app.id, { resumeId: undefined });
      setSelected(remaining[0]?.id ?? '');
      setRemove(false);
      toast.success('版本及原文件已删除');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="简历版本库"
        description="上传真实文件，保留每个版本与对应的投递记录。"
        action={
          <Button
            disabled={!library.ready}
            onClick={() => {
              setError('');
              setAdd(true);
            }}
          >
            <Plus className="size-4" />
            上传简历版本
          </Button>
        }
      />
      <DemoNotice>
        {isApiMode()
          ? '简历原件与版本保存在当前账户的私有存储中。'
          : '简历原件与版本仅保存在本机。'}
        支持 PDF、TXT、MD（最多 10 MB）；PDF
        扫描件需手动补充文字。清除浏览器数据会删除文件，请及时下载备份。
      </DemoNotice>
      {(library.error || error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {library.error || error}
        </p>
      )}
      {!library.ready ? (
        <Panel>
          <p role="status">正在读取简历…</p>
        </Panel>
      ) : !current ? (
        <div className="space-y-5">
          <EmptyState
            kind="resumes"
            title="为每个机会，准备合适的版本"
            description="上传第一份简历，把原文件、每次修改和使用它的投递一起留下来。"
            action={
              <Button onClick={() => setAdd(true)}>
                <Plus className="size-4" />
                上传第一份简历
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FileText,
                title: '01 · 原件预览',
                body: '保留 PDF、TXT 或 MD 原件，随时预览和下载。',
              },
              {
                icon: GitCompareArrows,
                title: '02 · 看见变化',
                body: '逐行比较真实文字，确认每次修改带来的进步。',
              },
              {
                icon: ArrowUpRight,
                title: '03 · 关联投递',
                body: '记录每份岗位使用的版本，面试前回顾更加从容。',
              },
            ].map(({ icon: Icon, title, body }) => (
              <Panel key={title}>
                <Icon className="mb-4 size-5 text-primary" />
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-2 text-xs leading-7 text-muted-foreground">{body}</p>
              </Panel>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
          <Panel title={`${library.value.length} 个版本`}>
            <div className="space-y-3">
              {library.value.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={`w-full rounded-xl border p-4 text-left ${current.id === item.id ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-raised'}`}
                >
                  <div className="mb-3 flex justify-between">
                    <FileText className="size-5 text-primary" />
                    <span className="font-mono text-xs">v{item.version}</span>
                  </div>
                  <h3 className="break-all text-sm font-medium">{item.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString('zh-CN')} · {item.role}
                  </p>
                  {item.default && (
                    <span className="mt-3 inline-flex items-center gap-1 text-xs text-status-offer">
                      <Check className="size-3" />
                      默认投递版本
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Button
              className="mt-4 w-full"
              variant="outline"
              disabled={library.value.length < 2}
              onClick={() => {
                setCompareId(library.value.find((x) => x.id !== current.id)?.id ?? '');
                setDiff(true);
              }}
            >
              <GitCompareArrows className="size-4" />
              对比版本变化
            </Button>
          </Panel>
          <div className="min-w-0 space-y-5">
            <Panel
              title="简历预览"
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () =>
                      await library.save((items) =>
                        items.map((x) => ({ ...x, default: x.id === current.id })),
                      )
                    }
                  >
                    <Star className="size-3" />
                    {current.default ? '默认版本' : '设为默认'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={download}>
                    <Download className="size-3" />
                    下载原文件
                  </Button>
                  <Button
                    aria-label="删除当前简历版本"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError('');
                      setRemove(true);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              }
            >
              <div className="mb-4 flex flex-wrap gap-2">
                <SmallTag>{current.fileName}</SmallTag>
                <SmallTag>{(current.size / 1024).toFixed(1)} KB</SmallTag>
              </div>
              {previewError && (
                <p role="alert" className="my-4 text-sm text-destructive">
                  {previewError}
                </p>
              )}
              {current.mime.includes('pdf') || /\.pdf$/i.test(current.fileName) ? (
                url ? (
                  <ResumePdfPreview source={url} name={current.name} />
                ) : (
                  <p className="py-10 text-sm text-muted-foreground">
                    {previewError ? '可在下方查看提取文字。' : '正在载入 PDF 原件…'}
                  </p>
                )
              ) : (
                <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-6 text-sm leading-7">
                  {current.text || '文件没有可显示文字。'}
                </pre>
              )}
              {current.extractionNote && (
                <p className="mt-4 text-xs leading-6 text-warning">{current.extractionNote}</p>
              )}
            </Panel>
            <Panel
              title="提取文字校正"
              description="文字用于版本对比与本地规则诊断；校正不会修改原文件。"
            >
              <Textarea
                aria-label="简历提取文字"
                rows={8}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                maxLength={200_000}
              />
              <Button
                className="mt-3"
                size="sm"
                disabled={draftText === current.text}
                onClick={async () => {
                  if (
                    await library.save((items) =>
                      items.map((x) => (x.id === current.id ? { ...x, text: draftText } : x)),
                    )
                  )
                    toast.success('提取文字已保存');
                }}
              >
                保存校正文字
              </Button>
            </Panel>
            <Panel
              title="关联投递"
              description="每份投递只关联一个简历版本，切换版本将替换该投递原有关联。"
            >
              {applications.length ? (
                <div className="space-y-3">
                  {applications.map((app) => {
                    const job = getJob(app.jobId);
                    return (
                      <label
                        key={app.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={app.resumeId === current.id}
                          onChange={async (e) =>
                            await updateApplication(app.id, {
                              resumeId: e.target.checked ? current.id : undefined,
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          {job ? `${getCompany(job.companyId).name} · ${job.title}` : app.jobId}
                        </span>
                        <Link
                          href={`/interview/${app.id}/timeline`}
                          className="shrink-0 text-xs text-primary"
                        >
                          时间线
                        </Link>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  先从
                  <Link href="/pipeline" className="text-primary">
                    投递看板
                  </Link>
                  添加一份投递。
                </p>
              )}
            </Panel>
            <Link
              href="/resume-check"
              className="flex items-center justify-between rounded-xl border border-purple/30 bg-purple/5 p-5 text-sm"
            >
              使用本地规则检查简历结构
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
      <Modal
        open={add}
        onClose={() => {
          if (!busy) setAdd(false);
        }}
        title="上传简历版本"
        description="原文件仅保存在当前浏览器；不会上传到服务器。"
      >
        <div className="space-y-4">
          <Field label="简历文件">
            <Input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                setError(chosen ? (validateResumeFile(chosen) ?? '') : '');
                if (chosen) setName(chosen.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </Field>
          <Field label="版本名称">
            <Input
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：前端秋招_项目强化版"
            />
          </Field>
          <Field label="求职方向">
            <Pick
              label="简历求职方向"
              value={role}
              onChange={setRole}
              options={['前端开发', '后端开发', '产品经理', '通用']}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            onClick={create}
            disabled={busy || !file || !name.trim() || !!(file && validateResumeFile(file))}
          >
            {busy ? '正在提取并保存…' : '保存简历版本'}
          </Button>
        </div>
      </Modal>
      <Modal
        open={diff}
        onClose={() => setDiff(false)}
        title="版本对比"
        description="按实际提取文字逐行比较；原件的排版变化不在对比范围内。"
      >
        {current && previous && (
          <div className="space-y-4">
            <Field label="旧版本">
              <select
                className="rounded-md border bg-background p-2"
                value={previous.id}
                onChange={(e) => setCompareId(e.target.value)}
              >
                {library.value
                  .filter((x) => x.id !== current.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      v{x.version} · {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="text-sm">
              对比至 v{current.version} · {current.name}
            </p>
            {!previous.text || !current.text ? (
              <p role="alert" className="text-sm text-warning">
                至少一个版本没有可对比文字，请先在「提取文字校正」中补充。
              </p>
            ) : (
              <div
                className="max-h-[50vh] overflow-auto rounded-lg border p-3 font-mono text-xs leading-7"
                aria-label="简历文字差异"
              >
                {changes.map((line, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap break-words ${line.type === 'added' ? 'bg-status-offer/10 text-status-offer' : line.type === 'removed' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'}`}
                  >
                    <span
                      aria-label={
                        line.type === 'added' ? '新增' : line.type === 'removed' ? '删除' : '未变'
                      }
                    >
                      {line.type === 'added' ? '+ ' : line.type === 'removed' ? '− ' : '  '}
                    </span>
                    {line.text || ' '}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title="删除此简历版本？"
        description={`将删除「${current?.name ?? ''}」及原文件，并解除 ${linked.length} 份投递关联。此操作无法撤销。`}
      >
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setRemove(false)}>
            取消
          </Button>
          <Button variant="destructive" disabled={busy} onClick={deleteVersion}>
            {busy ? '正在删除…' : '确认删除版本'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

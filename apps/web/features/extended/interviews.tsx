'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CalendarDays,
  Save,
  BookOpen,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PageHeader,
  Panel,
  DemoNotice,
  CompanyLogo,
  SmallTag,
  ProgressBar,
  EmptyState,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { InterviewAudio, InterviewSpeechControls } from '@/components/interview-media';
import { useRadarStore } from '@/lib/store';
import { getJob, getCompany } from '@/lib/data';
import {
  analyzeAnswer,
  isInterviewReview,
  isInterviewRounds,
  type InterviewRound,
  type InterviewReview,
} from '@/lib/interview-domain';
import { deleteInterviewFile, useInterviewLocal } from '@/lib/interview-repository';
import { isResumeLibrary, type ResumeVersion } from '@/lib/resume-files';
import { Field, Modal, Pick } from './common';
import { isApiMode, readWorkspaceValue, saveWorkspaceValue } from '@/lib/api/workspace-client';

const emptyRound: InterviewRound = {
  id: '',
  title: '技术一面',
  date: '',
  status: '未安排',
  mode: '线上视频',
  questions: '',
  note: '',
};
function MissingApplication() {
  return (
    <EmptyState
      kind="calendar"
      title="这份投递记录不存在"
      description="从看板选择一份投递，记录它的面试进展。"
      action={
        <Link href="/pipeline">
          <Button>返回投递看板</Button>
        </Link>
      }
    />
  );
}
export function TimelinePage({ id }: { id: string }) {
  const app = useRadarStore((s) => s.applications.find((x) => x.id === id));
  const rounds = useInterviewLocal<InterviewRound[]>(
    `interview-rounds-v2-${id}`,
    [],
    isInterviewRounds,
  );
  const resumes = useInterviewLocal<ResumeVersion[]>('resume-library-v2', [], isResumeLibrary);
  const [expanded, setExpanded] = useState('');
  const [edit, setEdit] = useState<InterviewRound | null>(null);
  const [deleting, setDeleting] = useState<InterviewRound | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const job = app ? getJob(app.jobId) : undefined;
  if (!job || !app) return <MissingApplication />;
  const company = getCompany(job.companyId);
  const resume = resumes.value.find((x) => x.id === app.resumeId);
  async function saveRound() {
    if (!edit?.title.trim()) return;
    const item = {
      ...edit,
      title: edit.title.trim(),
      id: edit.id || `round-${crypto.randomUUID()}`,
    };
    if (
      await rounds.save((items) =>
        items.some((x) => x.id === item.id)
          ? items.map((x) => (x.id === item.id ? item : x))
          : [...items, item],
      )
    ) {
      setExpanded(item.id);
      setEdit(null);
      toast.success('面试轮次已保存');
    }
  }
  async function deleteRound() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    const previous = rounds.value;
    const reviewKey = `radar-extended-interview-review-v2-${id}-${deleting.id}`;
    try {
      const raw = isApiMode()
        ? JSON.stringify(readWorkspaceValue(reviewKey.replace('radar-extended-', ''), null))
        : localStorage.getItem(reviewKey);
      let audioId: string | undefined;
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (isInterviewReview(parsed)) audioId = parsed.audioId;
      } catch {
        /* The malformed metadata is removed with the explicitly deleted round. */
      }
      if (!(await rounds.save((items) => items.filter((x) => x.id !== deleting.id)))) return;
      try {
        if (
          isApiMode() &&
          !(await saveWorkspaceValue(reviewKey.replace('radar-extended-', ''), null))
        )
          throw new Error('复盘清理失败，请重试。');
        if (audioId) await deleteInterviewFile(audioId);
        if (!isApiMode()) localStorage.removeItem(reviewKey);
      } catch (e) {
        await rounds.save(previous);
        if (isApiMode() && raw) {
          const backup: unknown = JSON.parse(raw);
          if (isInterviewReview(backup))
            await saveWorkspaceValue(reviewKey.replace('radar-extended-', ''), backup);
        }
        throw e;
      }
      if (!isApiMode()) await useRadarStore.getState().setNote(`review-${id}-${deleting.id}`, '');
      window.dispatchEvent(new CustomEvent('radar-local-change', { detail: { key: reviewKey } }));
      setDeleting(null);
      toast.success('轮次、复盘与录音已删除');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="面试时间线"
        description={`${company.name} · ${job.title}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/calendar">
              <Button variant="outline">
                <CalendarDays className="size-4" />
                查看日程
              </Button>
            </Link>
            <Button disabled={!rounds.ready} onClick={() => setEdit({ ...emptyRound })}>
              <Plus className="size-4" />
              添加面试轮次
            </Button>
          </div>
        }
      />
      <DemoNotice>
        此时间线由你手动维护{isApiMode() ? '并保存在当前账户' : '并保存在本机'}
        ，与投递阶段和企业招聘进度独立。记录轮次、准备问题、笔记，再进入对应轮次的录音与复盘。
      </DemoNotice>
      {(rounds.error || error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {rounds.error || error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="每一轮，积累下一轮的底气">
          {!rounds.ready ? (
            <p role="status">正在读取时间线…</p>
          ) : !rounds.value.length ? (
            <div className="py-10 text-center">
              <CalendarDays className="mx-auto mb-4 size-9 text-subtle" />
              <h2 className="text-base font-medium">还没有记录面试轮次</h2>
              <p className="my-4 text-xs leading-7 text-muted-foreground">
                收到面试安排后添加轮次，也可以先建立一轮准备计划。
              </p>
              <Button onClick={() => setEdit({ ...emptyRound })}>添加第一轮面试</Button>
            </div>
          ) : (
            <div>
              {rounds.value.map((round, i) => (
                <div className="relative flex gap-4 pb-8 last:pb-0" key={round.id}>
                  <div className="relative flex w-9 shrink-0 justify-center">
                    <div
                      className={`z-10 flex size-9 items-center justify-center rounded-full border ${round.status === '已完成' ? 'border-status-offer bg-status-offer/10 text-status-offer' : 'border-border bg-surface text-primary'}`}
                    >
                      {round.status === '已完成' ? (
                        <Check className="size-4" />
                      ) : (
                        <span className="font-mono text-xs">{i + 1}</span>
                      )}
                    </div>
                    {i < rounds.value.length - 1 && (
                      <div className="absolute bottom-0 top-9 w-px bg-border" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      className="flex w-full items-start justify-between gap-4 text-left"
                      aria-expanded={expanded === round.id}
                      onClick={() => setExpanded(expanded === round.id ? '' : round.id)}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-base font-semibold">{round.title}</h2>
                          <SmallTag>{round.status}</SmallTag>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {round.date ? new Date(round.date).toLocaleString('zh-CN') : '时间待定'} ·{' '}
                          {round.mode}
                        </p>
                      </div>
                      {expanded === round.id ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    {expanded === round.id && (
                      <div className="mt-5 space-y-4 rounded-xl bg-background p-5">
                        <h3 className="text-xs font-semibold text-primary">题目与准备要点</h3>
                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                          {round.questions || '还没有添加题目。'}
                        </p>
                        <h3 className="border-t border-border pt-4 text-xs font-semibold">
                          轮次笔记
                        </h3>
                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                          {round.note || '还没有笔记。'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEdit({ ...round })}>
                            <Pencil className="size-3" />
                            编辑轮次与笔记
                          </Button>
                          <Link
                            href={`/interview/${id}/review?round=${encodeURIComponent(round.id)}`}
                          >
                            <Button size="sm" variant="outline">
                              打开本轮复盘
                              <ArrowRight className="size-3" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`删除${round.title}`}
                            onClick={() => setDeleting(round)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel>
            <CompanyLogo companyId={company.id} size="lg" />
            <h2 className="mt-4 font-semibold">{company.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{job.title}</p>
            <p className="mt-4 text-xs text-muted-foreground">工作地点：{job.city}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              关联简历：{resume ? `${resume.name} · v${resume.version}` : '未关联'}
            </p>
            <Link href="/resumes" className="mt-3 inline-block text-xs text-primary">
              管理简历版本 →
            </Link>
            <Link href={`/pack/${company.slug}`}>
              <Button className="mt-5 w-full" variant="outline">
                <BookOpen className="size-4" />
                公司面经包
              </Button>
            </Link>
          </Panel>
          <Panel title="下一场之前">
            <p className="text-xs leading-7 text-muted-foreground">
              把准备要点写成具体问题，回答时讲清自己的决策、验证和取舍。复盘中留下下次可执行的改进。
            </p>
            <Link className="mt-4 block text-xs text-primary" href="/mock">
              进入模拟面试 →
            </Link>
          </Panel>
        </div>
      </div>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? '编辑面试轮次' : '添加面试轮次'}
        description="记录自己的安排，不会自动改变投递看板阶段。"
      >
        {edit && (
          <div className="space-y-4">
            <Field label="轮次名称">
              <Input
                value={edit.title}
                maxLength={100}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="面试时间（可留空）">
              <Input
                type="datetime-local"
                value={edit.date}
                onChange={(e) => setEdit({ ...edit, date: e.target.value })}
              />
            </Field>
            <Field label="轮次状态">
              <Pick
                label="轮次状态"
                value={edit.status}
                onChange={(status) => setEdit({ ...edit, status })}
                options={['未安排', '待进行', '已完成', '已取消']}
              />
            </Field>
            <Field label="面试方式">
              <Pick
                label="面试方式"
                value={edit.mode}
                onChange={(mode) => setEdit({ ...edit, mode })}
                options={['线上视频', '电话', '线下面试', '未记录']}
              />
            </Field>
            <Field label="题目与准备要点">
              <Textarea
                value={edit.questions}
                maxLength={10000}
                rows={4}
                onChange={(e) => setEdit({ ...edit, questions: e.target.value })}
              />
            </Field>
            <Field label="轮次笔记">
              <Textarea
                value={edit.note}
                maxLength={20000}
                rows={4}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
            </Field>
            <Button disabled={!edit.title.trim()} onClick={saveRound}>
              保存面试轮次
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="删除面试轮次？"
        description={`删除「${deleting?.title ?? ''}」及其复盘、录音，无法撤销。`}
      >
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            取消
          </Button>
          <Button variant="destructive" disabled={busy} onClick={deleteRound}>
            {busy ? '正在删除…' : '确认删除轮次'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

const reviewReference = {
  id: 'review',
  title: '面试回答复盘',
  reference: '说明背景、任务、个人行动与结果，补充验证和反思。',
  keywords: ['背景', '任务', '行动', '结果', '验证'],
};
export function ReviewPage({ id, round = 'round-1' }: { id: string; round?: string }) {
  const app = useRadarStore((s) => s.applications.find((x) => x.id === id));
  const existingNote = useRadarStore((s) => s.notes[`review-${id}-${round}`] ?? '');
  const setNote = useRadarStore((s) => s.setNote);
  const rounds = useInterviewLocal<InterviewRound[]>(
    `interview-rounds-v2-${id}`,
    [],
    isInterviewRounds,
  );
  const saved = useInterviewLocal<InterviewReview>(
    `interview-review-v2-${id}-${round}`,
    { transcript: '', note: existingNote, selfScore: 3 },
    isInterviewReview,
  );
  const [draft, setDraft] = useState<InterviewReview>({
    transcript: '',
    note: existingNote,
    selfScore: 3,
  });
  const [title, setTitle] = useState('面试复盘');
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const textImport = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(saved.value);
    setChanged(false);
  }, [saved.value]);
  const roundInfo = rounds.value.find((x) => x.id === round);
  const job = app ? getJob(app.jobId) : undefined;
  if (!app || !job) return <MissingApplication />;
  function edit(patch: Partial<InterviewReview>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setChanged(true);
  }
  async function commit(next: InterviewReview, notify = true): Promise<boolean> {
    if (!roundInfo && !title.trim()) {
      setError('请先填写轮次名称。');
      return false;
    }
    if (
      !roundInfo &&
      !(await rounds.save((items) => [
        ...items,
        { ...emptyRound, id: round, title: title.trim(), status: '已完成' },
      ]))
    )
      return false;
    const value = { ...next, savedAt: new Date().toISOString() };
    if (!(await saved.save(value))) return false;
    if (!isApiMode()) await setNote(`review-${id}-${round}`, value.note);
    setDraft(value);
    setChanged(false);
    setError('');
    if (notify) toast.success('转写、笔记与自评已保存');
    return true;
  }
  async function generate() {
    if (!draft.transcript.trim()) {
      setError('请先输入、导入或离线识别面试文字。');
      return;
    }
    await commit({
      ...draft,
      analysis: analyzeAnswer(draft.transcript, reviewReference),
      analyzedText: draft.transcript,
    });
  }
  async function importText(file: File) {
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 2 * 1024 * 1024 || !file.size) {
      setError('请选择非空且小于 2 MB 的 TXT 或 MD 文本。');
      return;
    }
    try {
      const text = (await file.text()).slice(0, 100000);
      edit({ transcript: text });
      setError('');
    } catch {
      setError('文本读取失败，请重试或直接粘贴。');
    }
  }
  const stale = !!draft.analysis && draft.analyzedText !== draft.transcript;
  return (
    <div className="space-y-6">
      <PageHeader
        title="面试复盘"
        description={`${getCompany(job.companyId).name} · ${roundInfo?.title ?? '尚未命名轮次'} · 把一次面试变成下一次行动。`}
        action={
          <Link href={`/interview/${id}/timeline`}>
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              返回时间线
            </Button>
          </Link>
        }
      />
      <DemoNotice>
        {isApiMode() ? '音频与转写保存在当前账户的私有存储中。' : '音频与转写仅保存在本机。'}
        录制前请确认已获得对话参与者同意。浏览器支持离线识别时可实时转写；已有音频支持回放和手动转写，不调用外部转写或
        AI 服务。规则报告只检测表达标记，不判断技术正确性。
      </DemoNotice>
      {(saved.error || rounds.error || error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {saved.error || rounds.error || error}
        </p>
      )}
      {!saved.ready || !rounds.ready ? (
        <Panel>
          <p role="status">正在读取本轮复盘…</p>
        </Panel>
      ) : (
        <>
          {!roundInfo && (
            <Panel title="为本轮建立记录">
              <Field label="轮次名称">
                <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <p className="mt-3 text-xs text-muted-foreground">
                首次保存时会同步添加到面试时间线。
              </p>
            </Panel>
          )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <Panel title="面试录音">
                <InterviewAudio
                  audioId={draft.audioId}
                  audioName={draft.audioName}
                  onChange={(patch) => commit({ ...draft, ...patch }, false)}
                />
              </Panel>
              <Panel
                title="转写与面试对话"
                description="可手动输入、导入文字，或使用浏览器本地识别后校正。"
                action={
                  <Button size="sm" variant="outline" onClick={() => textImport.current?.click()}>
                    导入文字
                  </Button>
                }
              >
                <Input
                  ref={textImport}
                  className="hidden"
                  aria-label="导入转写文字"
                  type="file"
                  accept=".txt,.md,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importText(file);
                    e.target.value = '';
                  }}
                />
                <Textarea
                  aria-label="面试转写文字"
                  rows={12}
                  maxLength={100000}
                  value={draft.transcript}
                  onChange={(e) => edit({ transcript: e.target.value })}
                  placeholder="例如：面试官：项目遇到什么问题？\n我：背景是…我的任务是…我采取的行动是…结果通过…验证。"
                />
                <div className="mt-4">
                  <InterviewSpeechControls
                    text="请回顾这一轮面试，说明背景、任务、个人行动、结果和下一步。"
                    onTranscript={(text) =>
                      edit({
                        transcript:
                          `${draft.transcript}${draft.transcript ? '\n' : ''}${text}`.slice(
                            0,
                            100000,
                          ),
                      })
                    }
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {draft.transcript.length}/100000 字 · 识别后请核对人名、术语与说话人。
                </p>
              </Panel>
              <Panel
                title="我的复盘笔记"
                action={
                  <Button size="sm" variant="outline" onClick={() => commit(draft)}>
                    <Save className="size-3" />
                    保存复盘
                  </Button>
                }
              >
                <Textarea
                  aria-label="我的复盘笔记"
                  rows={6}
                  maxLength={20000}
                  value={draft.note}
                  onChange={(e) => edit({ note: e.target.value })}
                  placeholder="哪些回答值得保留？下次准备做出什么具体改进？"
                />
                <Field label="本轮自评（1—5）" className="mt-4">
                  <Pick
                    label="本轮自评"
                    value={String(draft.selfScore)}
                    options={['1', '2', '3', '4', '5']}
                    onChange={(score) => edit({ selfScore: Number(score) })}
                  />
                </Field>
                <p className="mt-3 text-xs text-muted-foreground" role="status">
                  {changed
                    ? '有尚未保存的修改'
                    : draft.savedAt
                      ? `已保存 · ${new Date(draft.savedAt).toLocaleString('zh-CN')}`
                      : '编辑后请保存复盘'}
                </p>
              </Panel>
            </div>
            <Panel title="本地规则复盘报告" action={<SmallTag>规则分析</SmallTag>}>
              <p className="mb-5 text-xs leading-7 text-muted-foreground">
                对「背景、任务、行动、结果、验证」的字面覆盖占 50%；分步因果标记占 20%；举证标记占
                20%；文字展开程度占 10%。这是一份表达检查清单。
              </p>
              <Button onClick={generate} disabled={!draft.transcript.trim()}>
                {draft.analysis ? '重新生成规则报告' : '生成本地规则报告'}
              </Button>
              {stale && (
                <p role="status" className="mt-4 text-xs text-warning">
                  转写已有修改，以下报告仍对应上次保存的文字，请重新生成。
                </p>
              )}
              {draft.analysis ? (
                <div className="mt-6 space-y-5">
                  <div className="flex items-end gap-3">
                    <strong className="font-display text-5xl text-status-interview">
                      {draft.analysis.score}
                    </strong>
                    <span className="pb-1 text-xs text-muted-foreground">/ 100 · 规则完成度</span>
                  </div>
                  {[
                    { name: '关键词覆盖', value: draft.analysis.coverage },
                    { name: '结构标记', value: draft.analysis.structure },
                    { name: '举证标记', value: draft.analysis.evidence },
                    { name: '展开程度', value: draft.analysis.completeness },
                  ].map((item) => (
                    <div key={item.name}>
                      <div className="mb-2 flex justify-between text-xs">
                        <span>{item.name}</span>
                        <span>{item.value}</span>
                      </div>
                      <ProgressBar value={item.value} color="purple" />
                    </div>
                  ))}
                  <div className="rounded-xl bg-background p-4">
                    <h3 className="text-xs font-medium">分析依据 · 文本摘录</h3>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-7 text-muted-foreground">
                      {draft.analysis.excerpt}
                    </p>
                    <p className="mt-3 text-xs text-primary">
                      字面命中：{draft.analysis.matched.join('、') || '无'}
                    </p>
                  </div>
                  <ul className="list-inside list-disc space-y-3 text-xs leading-7 text-muted-foreground">
                    {draft.analysis.suggestions.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    你的手动自评：{draft.selfScore}/5（与规则完成度分别记录）
                  </p>
                  <Link href="/questions?question=q-7">
                    <Button className="w-full" variant="outline">
                      继续练习 STAR 行为题
                      <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="mt-6 text-sm leading-7 text-muted-foreground">
                  填写左侧对话文字后，可生成与当前输入相关的检查结果；报告会与本轮一起持久保存。
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

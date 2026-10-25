'use client';
import { useEffect, useRef, useState } from 'react';
import { isApiMode, subscribeWorkspace, workspaceOwner } from '@/lib/api/workspace-client';
import Link from 'next/link';
import { PageHeader, Panel, DemoNotice, SmallTag, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { jobs, getCompany } from '@/lib/data';
import type { ResumeVersion } from '@/lib/resume-files';
import { diagnoseResume } from '@/lib/growth-domain';
import { downloadText } from '@/lib/growth-local';
import { useValidatedArray } from './growth-local-state';
import { resumeRecordSchema } from '@/lib/growth-storage';
import { Field, useLocal } from './common';
import { createCoalescedDraftWriter, type DraftSaveStatus } from '@/lib/coalesced-draft-writer';
// Session-only drafts survive route changes. Account changes erase them. No
// browser storage is used for private API content.
const resumeDrafts = new Map<string, string>();
let draftOwner = workspaceOwner();
let draftGeneration = 0;
subscribeWorkspace(() => {
  const owner = workspaceOwner();
  if (owner !== draftOwner) {
    draftOwner = owner;
    draftGeneration++;
    resumeDrafts.clear();
  }
});
const resumeScope = () =>
  isApiMode() ? (workspaceOwner() ? `${workspaceOwner()}:${draftGeneration}` : null) : 'local';

const sample =
  '教育：2027届计算机本科\n技能：JavaScript、React、TypeScript\n项目：协作文档平台\n参与编辑器开发，负责实现 React 组件与 HTTP 接口联调。\n优化页面加载，首屏耗时从 3 秒降低至 2 秒。';
export function ResumeCheckPage() {
  const [library] = useValidatedArray<ResumeVersion>('resume-library-v2', resumeRecordSchema, []);
  const [savedText, persistText] = useLocal('diagnosis-text-v2', '');
  const scope = useRef(resumeScope());
  const [editedText, setEditedText] = useState<string | null>(() => {
    const draft = scope.current ? resumeDrafts.get(scope.current) : undefined;
    return draft !== undefined && draft !== savedText ? draft : null;
  });
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>(
    editedText === null ? 'saved' : 'pending',
  );
  const active = useRef(true);
  const persistRef = useRef(persistText);
  persistRef.current = persistText;
  const [writer] = useState(() =>
    createCoalescedDraftWriter({
      save: (value: string) =>
        scope.current === resumeScope() ? persistRef.current(value) : Promise.resolve(false),
      scope: () => (scope.current === resumeScope() ? scope.current : null),
      onStatus: setSaveStatus,
      onConfirmed: (value) => {
        if (scope.current && resumeDrafts.get(scope.current) === value)
          resumeDrafts.delete(scope.current);
        if (active.current) setEditedText((current) => (current === value ? null : current));
      },
      initial: editedText ?? undefined,
      delay: isApiMode() ? 800 : 0,
    }),
  );
  useEffect(() => {
    active.current = true;
    writer.start();
    const warn = (event: BeforeUnloadEvent) => {
      if (writer.dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      active.current = false;
      writer.stop();
      window.removeEventListener('beforeunload', warn);
    };
  }, [writer]);
  const text = editedText ?? savedText;
  const [savedJobId, persistJobId] = useLocal('diagnosis-target-v2', jobs[0]?.id ?? '');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const jobId = selectedJobId ?? savedJobId;
  const [report, setReport] = useState<ReturnType<typeof diagnoseResume> | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<number[]>([]);
  const job = jobs.find((x) => x.id === jobId);
  const invalidate = () => {
    setReport(null);
    setApplied([]);
    setError('');
  };
  function setText(value: string | ((current: string) => string)) {
    const next = typeof value === 'function' ? value(text) : value;
    setEditedText(next);
    invalidate();
    if (scope.current && scope.current === resumeScope()) resumeDrafts.set(scope.current, next);
    writer.edit(next);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="简历诊断"
        description="使用可解释的本地规则，检查实际文本与目标岗位的关联。"
      />
      <DemoNotice>
        规则检查不调用
        AI，不预测录用概率。仅分析你输入的文字；关键词缺失不等于缺乏能力，修改建议不会生成虚构经历。
      </DemoNotice>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="输入简历文本"
          description="支持读取简历库中实际上传的文本，或导入 UTF-8 的 .txt、.md 文件。"
        >
          <div className="grid gap-4">
            {library.length > 0 && (
              <Field label="从简历库带入">
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  defaultValue=""
                  onChange={async (e) => {
                    const resume = library.find((r) => r.id === e.target.value);
                    if (resume) setText(resume.text);
                  }}
                >
                  <option value="">选择已保存简历版本</option>
                  {library.map((r) => (
                    <option value={r.id} key={r.id} disabled={!r.text.trim()}>
                      {r.name} · v{r.version}
                      {r.text ? '' : '（无可读文本）'}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="简历文本">
              <Textarea
                className="min-h-72"
                value={text}
                maxLength={30000}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                placeholder="粘贴教育、技能、项目与经历…"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {saveStatus === 'saved'
                  ? '文本无待保存修改'
                  : saveStatus === 'saving'
                    ? '正在保存文本…'
                    : saveStatus === 'failed'
                      ? '文本尚未保存，当前编辑已保留，请重试。'
                      : '文本有未保存修改，停止输入后自动保存。'}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={saveStatus === 'saved' || saveStatus === 'saving'}
                onClick={() => writer.flush()}
              >
                {saveStatus === 'failed' ? '重试保存文本' : '保存当前文本'}
              </Button>
            </div>
            <Field label="读取文本文件">
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200000) {
                    setError('文件过大，请使用 200KB 以内的文本');
                    return;
                  }
                  try {
                    const content = await file.text();
                    if (content.length > 30000 || content.includes('\0')) {
                      setError('请使用 30000 字以内的 UTF-8 文本文件');
                      return;
                    }
                    setText(content);
                  } catch {
                    setError('文件读取失败，请重新选择或粘贴文本');
                  }
                }}
              />
            </Field>
            <Field label="目标岗位">
              <select
                className="h-10 rounded-md border bg-background px-2 text-sm"
                value={jobId}
                disabled={!jobs.length}
                onChange={async (e) => {
                  const value = e.target.value;
                  setSelectedJobId(value);
                  invalidate();
                  await persistJobId(value);
                }}
              >
                <option value="">请选择真实目标岗位</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {getCompany(j.companyId).name} · {j.title}
                  </option>
                ))}
              </select>
            </Field>
            {!jobs.length && (
              <EmptyState
                kind="jobs"
                title="暂无可诊断的真实岗位"
                description="先在岗位页导入真实招聘信息，再返回选择目标岗位。"
                action={
                  <Button asChild variant="outline">
                    <Link href="/jobs">前往岗位库</Link>
                  </Button>
                }
              />
            )}
            <div className="flex flex-wrap gap-2">
              {process.env.NEXT_PUBLIC_DATA_MODE !== 'api' && (
                <Button variant="outline" onClick={() => setText(sample)}>
                  载入虚构样例
                </Button>
              )}
              <Button
                disabled={!job}
                onClick={() => {
                  if (!job) {
                    setError('请先选择已收录的真实岗位');
                    return;
                  }
                  if (text.trim().length < 20) {
                    setError('请至少输入 20 字的简历经历');
                    return;
                  }
                  setReport(diagnoseResume(text, job));
                  setApplied([]);
                  setError('');
                }}
              >
                开始规则诊断
              </Button>
              <Button
                variant="outline"
                disabled={!text.trim()}
                onClick={() => downloadText('优化简历.txt', text)}
              >
                下载当前文本
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </Panel>
        <Panel
          title="诊断结果"
          description="四项各 25 分：结构章节、量化证据、行动表达、岗位关键词覆盖。"
        >
          {!report ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              填写简历并选择岗位后开始诊断。
            </p>
          ) : (
            <div className="space-y-5">
              <p className="font-display text-4xl text-primary">
                {report.total}
                <span className="text-base text-muted-foreground"> / 100 · 规则得分</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {report.dimensions.map((d) => (
                  <div key={d.label} className="rounded-lg border p-3 text-sm">
                    {d.label}
                    <strong className="float-right">{d.score} / 25</strong>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                结构：教育/技能/项目/经历各占四分之一；证据：含数值结果的句子比例；行动：明确职责动词的句子比例；匹配：目标岗位标签和技术关键词覆盖率。
              </p>
              <div>
                <h3 className="text-sm font-medium">目标岗位尚未出现的关键词</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.missing.length ? (
                    report.missing.map((word) => <SmallTag key={word}>{word}</SmallTag>)
                  ) : (
                    <p className="text-xs text-muted-foreground">已覆盖本规则提取的全部关键词。</p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  仅在确有相关经历时补充，切勿堆砌。
                </p>
              </div>
              <h3 className="font-medium text-sm">逐条表达建议</h3>
              {!report.suggestions.length && (
                <p className="text-sm text-muted-foreground">暂未发现需要补充表达的句子。</p>
              )}
              {report.suggestions.map((s, i) => (
                <div className="space-y-2 rounded-lg border p-3 text-sm" key={`${i}-${s.original}`}>
                  <p>原文：{s.original}</p>
                  <p className="text-muted-foreground">{s.reason}</p>
                  <p>建议：{s.replacement}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applied.includes(i)}
                    onClick={async () => {
                      const next = text.replace(s.original, s.replacement);
                      setEditedText(next);
                      if (scope.current && scope.current === resumeScope())
                        resumeDrafts.set(scope.current, next);
                      writer.edit(next);
                      if (await writer.flush()) setApplied((v) => [...v, i]);
                    }}
                  >
                    {applied.includes(i) ? '已应用，重新诊断可更新得分' : '应用此条建议'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

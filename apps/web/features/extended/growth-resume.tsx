'use client';
import { useState } from 'react';
import { PageHeader, Panel, DemoNotice, SmallTag } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { jobs, getCompany } from '@/lib/data';
import type { ResumeVersion } from '@/lib/resume-files';
import { diagnoseResume } from '@/lib/growth-domain';
import { downloadText } from '@/lib/growth-local';
import { useValidatedArray } from './growth-local-state';
import { resumeRecordSchema } from '@/lib/growth-storage';
import { Field, useLocal } from './common';
const sample =
  '教育：2027届计算机本科\n技能：JavaScript、React、TypeScript\n项目：协作文档平台\n参与编辑器开发，负责实现 React 组件与 HTTP 接口联调。\n优化页面加载，首屏耗时从 3 秒降低至 2 秒。';
export function ResumeCheckPage() {
  const [library] = useValidatedArray<ResumeVersion>('resume-library-v2', resumeRecordSchema, []);
  const [text, setText] = useLocal('diagnosis-text-v2', '');
  const [jobId, setJobId] = useLocal('diagnosis-target-v2', jobs[0].id);
  const [report, setReport] = useState<ReturnType<typeof diagnoseResume> | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<number[]>([]);
  const job = jobs.find((x) => x.id === jobId) ?? jobs[0];
  const invalidate = () => {
    setReport(null);
    setApplied([]);
    setError('');
  };
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
          description="文本仅保存在当前浏览器。支持读取 UTF-8 的 .txt 或 .md 文件。"
        >
          <div className="grid gap-4">
            {library.length > 0 && (
              <Field label="从简历库带入">
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const resume = library.find((r) => r.id === e.target.value);
                    if (resume && setText(resume.text)) invalidate();
                  }}
                >
                  <option value="">选择已保存简历版本</option>
                  {library.map((r) => (
                    <option value={r.id} key={r.id}>
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
                  invalidate();
                }}
                placeholder="粘贴教育、技能、项目与经历…"
              />
            </Field>
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
                    invalidate();
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
                onChange={(e) => {
                  setJobId(e.target.value);
                  invalidate();
                }}
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {getCompany(j.companyId).name} · {j.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setText(sample);
                  invalidate();
                }}
              >
                载入虚构样例
              </Button>
              <Button
                onClick={() => {
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
                    onClick={() => {
                      setText((v) => v.replace(s.original, s.replacement));
                      setApplied((v) => [...v, i]);
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

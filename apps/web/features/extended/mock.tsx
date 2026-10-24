'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import Link from 'next/link';
import { Clock, ArrowRight, Check, Play, Pause, Download, Trash2 } from 'lucide-react';
import {
  PageHeader,
  Panel,
  DemoNotice,
  SmallTag,
  ProgressBar,
  PageTabs,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InterviewSpeechControls } from '@/components/interview-media';
import {
  buildPracticeQuestions,
  completePractice,
  elapsedPracticeSeconds,
  isDraftOrNull,
  isPracticeConfig,
  isPracticeReports,
  type PracticeConfig,
  type PracticeDraft,
  type PracticeReport,
} from '@/lib/interview-domain';
import { downloadInterviewBlob, useInterviewLocal } from '@/lib/interview-repository';
import { Field, Modal, Pick, Row } from './common';

const initialConfig: PracticeConfig = {
  role: '前端开发',
  company: '腾讯',
  round: '技术一面',
  level: '标准难度',
  minutes: 15,
};
export function MockPage() {
  const config = useInterviewLocal('mock-config-v2', initialConfig, isPracticeConfig);
  const drafts = useInterviewLocal<PracticeDraft | null>('mock-draft-v2', null, isDraftOrNull);
  const reports = useInterviewLocal<PracticeReport[]>('mock-reports-v2', [], isPracticeReports);
  const [view, setView] = useState('开始练习');
  const [phase, setPhase] = useState<'config' | 'active' | 'report'>('config');
  const [working, setWorking] = useState<PracticeDraft | null>(null);
  const [viewing, setViewing] = useState<PracticeReport | null>(null);
  const [now, setNow] = useState(0);
  const [discard, setDiscard] = useState(false);
  const finishing = useRef(false);
  useEffect(() => {
    if (drafts.ready) setWorking(drafts.value);
  }, [drafts.ready, drafts.value]);
  useEffect(() => {
    setNow(Date.now());
    if (phase !== 'active' || !working || working.startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, working?.startedAt]);
  const remaining = working
    ? Math.max(
        0,
        working.config.minutes * 60 -
          elapsedPracticeSeconds(working.elapsed, working.startedAt, now || Date.now()),
      )
    : 0;
  const finish = useCallback(() => {
    if (!working || finishing.current || !reports.ready) return;
    finishing.current = true;
    const report = completePractice(working, Date.now());
    if (!reports.save((items) => [report, ...items.filter((item) => item.id !== report.id)])) {
      finishing.current = false;
      return;
    }
    if (!drafts.save(null)) {
      finishing.current = false;
      return;
    }
    setWorking(null);
    setViewing(report);
    setPhase('report');
    setView('开始练习');
  }, [working, reports.ready, reports.save, drafts.save]);
  useEffect(() => {
    if (phase === 'active' && working?.startedAt !== null && remaining === 0) finish();
  }, [phase, working?.startedAt, remaining, finish]);
  function update(next: PracticeDraft) {
    setWorking(next);
    drafts.save(next);
  }
  function pause(exit = false) {
    if (!working) return;
    const next = {
      ...working,
      elapsed: elapsedPracticeSeconds(working.elapsed, working.startedAt, Date.now()),
      startedAt: null,
    };
    setWorking(next);
    if (drafts.save(next) && exit) setPhase('config');
  }
  function resume() {
    const previous = working ?? drafts.value;
    if (!previous) return;
    const next = { ...previous, startedAt: previous.startedAt ?? Date.now() };
    if (drafts.save(next)) {
      finishing.current = false;
      setNow(Date.now());
      setWorking(next);
      setPhase('active');
      setView('开始练习');
    }
  }
  function start() {
    const questions = buildPracticeQuestions(config.value);
    const next: PracticeDraft = {
      id: crypto.randomUUID(),
      config: config.value,
      questions,
      answers: questions.map(() => ''),
      index: 0,
      elapsed: 0,
      startedAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    if (drafts.save(next)) {
      finishing.current = false;
      setNow(Date.now());
      setWorking(next);
      setViewing(null);
      setPhase('active');
    }
  }
  function answer(text: string) {
    if (working)
      update({
        ...working,
        answers: working.answers.map((a, i) => (i === working.index ? text : a)),
      });
  }
  const question = working?.questions[working.index];
  const error = config.error || drafts.error || reports.error;
  const ready = config.ready && drafts.ready && reports.ready;
  const dimensions = viewing
    ? [
        {
          dimension: '关键词覆盖',
          score: Math.round(
            viewing.analyses.reduce((s, a) => s + a.coverage, 0) / viewing.analyses.length,
          ),
        },
        {
          dimension: '结构标记',
          score: Math.round(
            viewing.analyses.reduce((s, a) => s + a.structure, 0) / viewing.analyses.length,
          ),
        },
        {
          dimension: '举证标记',
          score: Math.round(
            viewing.analyses.reduce((s, a) => s + a.evidence, 0) / viewing.analyses.length,
          ),
        },
        {
          dimension: '展开程度',
          score: Math.round(
            viewing.analyses.reduce((s, a) => s + a.completeness, 0) / viewing.analyses.length,
          ),
        },
      ]
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="模拟面试"
        description="按目标练习，用可解释的本地规则回顾自己的回答。"
        action={
          <PageTabs
            items={['开始练习', '练习历史']}
            value={view}
            onChange={(next) => {
              if (phase === 'active') pause();
              setView(next);
            }}
          />
        }
      />
      <DemoNotice>
        题目来自内置练习库，所选公司仅改变假设业务场景，不代表真实面试风格。反馈由本地关键词和表达标记规则生成，不调用
        AI，也不判断技术正确性或预测录用结果。回答、进度和报告保存在当前浏览器。
      </DemoNotice>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!ready ? (
        <Panel>
          <p role="status">正在读取练习记录…</p>
        </Panel>
      ) : view === '练习历史' ? (
        <Panel title="你的练习轨迹">
          {!reports.value.length && (
            <p className="py-8 text-sm text-muted-foreground">
              还没有已完成的练习。开始一场练习后，这里会保存逐题答案和报告。
            </p>
          )}
          {reports.value.map((item) => (
            <Row key={item.id} className="flex-wrap">
              <div>
                <h3 className="text-sm font-medium">
                  {item.config.company} · {item.config.role}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(item.completedAt).toLocaleString('zh-CN')} · 完成{' '}
                  {item.answers.filter((a) => a.trim()).length}/{item.questions.length} 题 ·
                  本地规则
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl text-status-interview">{item.score}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setViewing(item);
                    setPhase('report');
                    setView('开始练习');
                  }}
                >
                  查看报告
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`删除${item.id}报告`}
                  onClick={() => {
                    if (
                      reports.save((items) => items.filter((x) => x.id !== item.id)) &&
                      viewing?.id === item.id
                    ) {
                      setViewing(null);
                      setPhase('config');
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </Row>
          ))}
        </Panel>
      ) : phase === 'config' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel
            title="配置你的练习"
            description="时长决定题量：15 分钟 3 题、30 分钟 5 题、45 分钟 7 题。"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="目标方向">
                <Pick
                  label="目标方向"
                  value={config.value.role}
                  onChange={(role) => config.save({ ...config.value, role })}
                  options={['前端开发', '后端开发', '产品经理']}
                />
              </Field>
              <Field label="模拟公司">
                <Pick
                  label="模拟公司"
                  value={config.value.company}
                  onChange={(company) => config.save({ ...config.value, company })}
                  options={['腾讯', '字节跳动', '阿里巴巴', '美团', '通用风格']}
                />
              </Field>
              <Field label="面试轮次">
                <Pick
                  label="面试轮次"
                  value={config.value.round}
                  onChange={(round) => config.save({ ...config.value, round })}
                  options={['技术一面', '技术二面', 'HR 面试']}
                />
              </Field>
              <Field label="题目难度">
                <Pick
                  label="题目难度"
                  value={config.value.level}
                  onChange={(level) => config.save({ ...config.value, level })}
                  options={['基础热身', '标准难度', '深度挑战']}
                />
              </Field>
              <Field label="练习时长">
                <Pick
                  label="练习时长"
                  value={`${config.value.minutes} 分钟`}
                  onChange={(minutes) =>
                    config.save({ ...config.value, minutes: parseInt(minutes) })
                  }
                  options={['15 分钟', '30 分钟', '45 分钟']}
                />
              </Field>
              <div className="text-xs leading-7 text-muted-foreground">
                文字作答始终可用。浏览器支持中文离线识别时，可使用语音转文字和本机朗读。
              </div>
            </div>
            <Button className="mt-7" disabled={!!working} onClick={start}>
              <Play className="size-4" />
              开始本地模拟
            </Button>
            {working && (
              <div className="mt-6 rounded-xl border border-primary/30 p-4">
                <h3 className="text-sm font-medium">有一场未完成练习</h3>
                <p className="my-3 text-xs text-muted-foreground">
                  {working.config.company} · {working.config.role} · 第 {working.index + 1}/
                  {working.questions.length} 题 ·{' '}
                  {working.startedAt === null ? '已暂停' : '计时仍在继续'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={resume}>恢复上次练习</Button>
                  <Button variant="outline" onClick={() => setDiscard(true)}>
                    放弃未完成练习
                  </Button>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="练习方式">
            <p className="text-sm leading-7 text-muted-foreground">
              基础热身侧重概念与例子；标准难度要求原理与应用；深度挑战会追问替代方案和失败边界。技术二面优先项目与设计题，HR
              轮次使用行为与动机题。
            </p>
            <p className="mt-5 text-xs leading-7 text-muted-foreground">
              练习中可暂停、保存退出，刷新后恢复。运行中的倒计时使用实际时间；离开页面前点击「保存退出」可暂停计时。
            </p>
            <Link href="/questions" className="mt-5 inline-block text-xs text-primary">
              先去题库准备 →
            </Link>
          </Panel>
        </div>
      ) : phase === 'active' && working && question ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Panel
            title={
              <div className="flex flex-wrap gap-3">
                <SmallTag>
                  第 {working.index + 1} / {working.questions.length} 题
                </SmallTag>
                <span>
                  {working.config.company} · {working.config.round}
                </span>
              </div>
            }
            action={
              <span
                className="flex items-center gap-2 font-mono text-sm text-primary"
                aria-label="剩余练习时间"
              >
                <Clock className="size-4" />
                {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                {String(remaining % 60).padStart(2, '0')}
              </span>
            }
          >
            <ProgressBar
              value={((working.index + 1) / working.questions.length) * 100}
              color="purple"
            />
            <h2 className="my-7 whitespace-pre-line text-xl font-semibold leading-9">
              {question.title}
            </h2>
            {working.startedAt === null && (
              <p role="status" className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-warning">
                练习已暂停，点击继续后恢复作答与计时。
              </p>
            )}
            <Textarea
              aria-label="本题回答"
              className="min-h-64 leading-7"
              maxLength={20000}
              disabled={working.startedAt === null}
              value={working.answers[working.index]}
              onChange={(e) => answer(e.target.value)}
              placeholder="先给出结论，再展开原理、例子和验证方法。"
            />
            <div className="mt-4">
              <InterviewSpeechControls
                text={question.title}
                disabled={working.startedAt === null}
                onTranscript={(text) => answer(`${working.answers[working.index]}${text}`)}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {working.answers[working.index].length} / 20000 字 · 自动保存于本机
              </span>
              <div className="flex gap-2">
                {working.index > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => update({ ...working, index: working.index - 1 })}
                  >
                    上一题
                  </Button>
                )}
                {working.index < working.questions.length - 1 ? (
                  <Button onClick={() => update({ ...working, index: working.index + 1 })}>
                    下一题
                    <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button onClick={finish}>结束并查看报告</Button>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="练习进度">
            <div className="space-y-2">
              {working.answers.map((a, i) => (
                <button
                  key={i}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-xs hover:bg-raised"
                  onClick={() => update({ ...working, index: i })}
                >
                  <span>题目 {i + 1}</span>
                  {a.trim() ? <Check className="size-4 text-status-offer" /> : '待回答'}
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3">
              <Button
                variant="outline"
                onClick={() => (working.startedAt === null ? resume() : pause())}
              >
                {working.startedAt === null ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
                {working.startedAt === null ? '继续练习' : '暂停练习'}
              </Button>
              <Button variant="outline" onClick={() => pause(true)}>
                保存退出
              </Button>
              <Button variant="outline" onClick={finish}>
                提前结束
              </Button>
            </div>
          </Panel>
        </div>
      ) : viewing ? (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Panel title="练习报告 · 本地规则">
            <div className="py-7 text-center">
              <strong className="font-display text-6xl text-status-interview">
                {viewing.score}
              </strong>
              <p className="mt-3 text-xs text-muted-foreground">规则完成度 / 100</p>
            </div>
            <p className="text-sm">
              {viewing.config.company} · {viewing.config.role}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {viewing.answers.filter((a) => a.trim()).length}/{viewing.questions.length} 题 · 用时{' '}
              {Math.floor(viewing.elapsed / 60)} 分 {viewing.elapsed % 60} 秒
            </p>
            <div
              className="mt-4 flex justify-center"
              role="img"
              aria-label={`本地规则评分雷达：${dimensions.map((x) => `${x.dimension}${x.score}`).join('、')}`}
            >
              <RadarChart width={260} height={220} outerRadius={70} data={dimensions}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                />
                <Radar
                  dataKey="score"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.16}
                  isAnimationActive={false}
                />
              </RadarChart>
            </div>
            <dl className="space-y-2 text-xs">
              {dimensions.map((x) => (
                <div className="flex justify-between" key={x.dimension}>
                  <dt>{x.dimension}</dt>
                  <dd>{x.score}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              计算：关键词覆盖 50% + 结构标记 20% + 举证标记 20% + 字数展开 10%。空答为
              0。命中词语不代表回答正确。
            </p>
            <Button
              className="mt-5 w-full"
              variant="outline"
              onClick={() =>
                downloadInterviewBlob(
                  new Blob([JSON.stringify(viewing, null, 2)], {
                    type: 'application/json;charset=utf-8',
                  }),
                  `练习报告_${viewing.id}.json`,
                )
              }
            >
              <Download className="size-3" />
              下载完整报告
            </Button>
            <Button
              className="mt-3 w-full"
              onClick={() => {
                setViewing(null);
                setPhase('config');
              }}
            >
              再练一场
            </Button>
          </Panel>
          <Panel title="逐题回顾">
            <div className="space-y-5">
              {viewing.questions.map((q, i) => {
                const analysis = viewing.analyses[i];
                return (
                  <section key={`${q.id}-${i}`} className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex justify-between text-xs">
                      <span>第 {i + 1} 题</span>
                      <span className="text-primary">规则完成度 {analysis.score}</span>
                    </div>
                    <h3 className="whitespace-pre-line text-sm font-medium leading-7">{q.title}</h3>
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                      {viewing.answers[i] || '本题未作答。'}
                    </p>
                    <div className="mt-4 rounded-lg bg-raised p-4">
                      <h4 className="text-xs font-medium">参考思路</h4>
                      <p className="mt-2 text-xs leading-7 text-muted-foreground">{q.reference}</p>
                      <p className="mt-3 text-xs text-primary">
                        字面命中：{analysis.matched.join('、') || '无'}
                      </p>
                    </div>
                    <ul className="mt-4 list-inside list-disc space-y-2 text-xs leading-6 text-muted-foreground">
                      {analysis.suggestions.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    <Link
                      href={
                        q.id.startsWith('q-') ? `/questions?preview=question:${q.id}` : '/questions'
                      }
                      className="mt-4 inline-block text-xs text-primary"
                    >
                      去题库继续练习 →
                    </Link>
                  </section>
                );
              })}
            </div>
          </Panel>
        </div>
      ) : (
        <Panel>
          <Button onClick={() => setPhase('config')}>返回练习配置</Button>
        </Panel>
      )}
      <Modal
        open={discard}
        onClose={() => setDiscard(false)}
        title="放弃未完成练习？"
        description="将删除这场练习的进度与答案；已完成的历史报告会保留。"
      >
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setDiscard(false)}>
            继续保留
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (drafts.save(null)) {
                setWorking(null);
                setDiscard(false);
              }
            }}
          >
            确认放弃练习
          </Button>
        </div>
      </Modal>
    </div>
  );
}

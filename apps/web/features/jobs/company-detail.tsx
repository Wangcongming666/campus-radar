'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bookmark, ArrowLeft, ArrowUpRight, Building2, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CompanyLogo,
  Panel,
  StatCard,
  SmallTag,
  DemoNotice,
  EmptyState,
} from '@/components/shared';
import { companies, jobs, experiences } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { useValidatedArray } from '@/features/extended/growth-local-state';
import { companyNoteSchema, companyResultSchema, stringSchema } from '@/lib/growth-storage';
import { Field, Pick, Modal, Row } from '@/features/extended/common';
import { JobCard } from './jobs-page';
import styles from './jobs.module.css';
import { cn } from '@/lib/utils';
type Note = {
  id: string;
  category: string;
  title: string;
  team: string;
  role: string;
  date: string;
  rating: number;
  body: string;
  tags: string;
  hidden: boolean;
};
type ResultEvent = {
  id: string;
  date: string;
  title: string;
  role: string;
  result: string;
  note: string;
};
const checks = [
  '确认劳动合同主体与实际工作地点',
  '以书面文件核对薪酬、月数、奖金条件',
  '核实试用期、加班制度与培养安排',
  '通过官方渠道核验身份，不支付内推或录用费用',
];
const newNote = (category: string): Note => ({
  id: '',
  category,
  title: '',
  team: '',
  role: '',
  date: new Date().toLocaleDateString('sv-SE'),
  rating: 3,
  body: '',
  tags: '',
  hidden: false,
});
export default function CompanyDetail({ id }: { id: string }) {
  const company = companies.find((c) => c.id === id || c.slug === id);
  const [tab, setTab] = useState('在招岗位');
  const [error, setError] = useState('');
  const favorites = useRadarStore((s) => s.favorites);
  const toggleFavorite = useRadarStore((s) => s.toggleFavorite);
  const applications = useRadarStore((s) => s.applications);
  const [notes, setNotes] = useValidatedArray<Note>(
    `company-notes-v2-${id}`,
    companyNoteSchema,
    [],
  );
  const [timeline, setTimeline] = useValidatedArray<ResultEvent>(
    `company-results-v2-${id}`,
    companyResultSchema,
    [],
  );
  const [checked, setChecked] = useValidatedArray<string>(
    `company-checklist-v2-${id}`,
    stringSchema,
    [],
  );
  const [draft, setDraft] = useState<Note | null>(null);
  const [eventDraft, setEventDraft] = useState<ResultEvent | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('全部结果');
  if (!company)
    return (
      <EmptyState
        kind="jobs"
        title="未找到这家公司"
        description="返回岗位广场选择当前可用的公司。"
        action={
          <Button asChild>
            <Link href="/jobs">浏览岗位</Link>
          </Button>
        }
      />
    );
  const companyJobs = jobs.filter((j) => j.companyId === company.id);
  const companyExperiences = experiences.filter((e) => e.companyId === company.id);
  const category = tab === '面试风格' ? '面试风格' : tab === '员工评价' ? '团队评价' : '避坑记录';
  const visibleNotes = notes.filter(
    (n) =>
      n.category === category &&
      (showHidden || !n.hidden) &&
      `${n.title}${n.role}${n.team}${n.tags}${n.body}`.includes(query),
  );
  const ratings = notes.filter((n) => n.category === '团队评价' && !n.hidden);
  const ownApplications = applications.filter((a) => companyJobs.some((j) => j.id === a.jobId));
  function saveNote() {
    if (
      !draft?.title.trim() ||
      draft.body.trim().length < 5 ||
      !draft.date ||
      !Number.isFinite(draft.rating) ||
      draft.rating < 1 ||
      draft.rating > 5
    ) {
      setError('请填写标题、至少 5 字正文和记录日期；评分为 1–5。');
      return;
    }
    const item = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim(),
      body: draft.body.trim(),
    };
    if (
      !setNotes((xs) =>
        xs.some((x) => x.id === item.id)
          ? xs.map((x) => (x.id === item.id ? item : x))
          : [...xs, item],
      )
    )
      return;
    setDraft(null);
  }
  function saveEvent() {
    if (!eventDraft?.title.trim() || !eventDraft.date || !eventDraft.role.trim()) {
      setError('请填写时间、事件标题和对应岗位。');
      return;
    }
    const item = { ...eventDraft, id: eventDraft.id || crypto.randomUUID() };
    if (
      !setTimeline((xs) =>
        xs.some((x) => x.id === item.id)
          ? xs.map((x) => (x.id === item.id ? item : x))
          : [...xs, item],
      )
    )
      return;
    setEventDraft(null);
  }
  return (
    <div className="space-y-5">
      <Link href="/jobs" className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowLeft className="size-3.5" />
        返回岗位广场
      </Link>
      <div className={styles.detailHero}>
        <div className="flex items-center gap-4">
          <CompanyLogo companyId={company.id} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">
              {company.name}
              <span className="ml-3 text-base text-subtle">{company.en}</span>
            </h1>
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{company.industry}</span>
              <span>{company.size}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => toggleFavorite('company', company.id)}>
            <Bookmark
              className={
                favorites.includes(`company:${company.id}`) ? 'fill-current text-primary' : ''
              }
            />
            {favorites.includes(`company:${company.id}`) ? '已关注' : '关注公司'}
          </Button>
        </div>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">{company.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {company.tags.map((t) => (
            <SmallTag key={t}>{t}</SmallTag>
          ))}
        </div>
      </div>
      <DemoNotice>
        公司与招聘信息来自本地演示库；评价、风格、避坑与开奖记录由你自行保存，仅本机可见，不代表已核验的员工意见或官方进度。
      </DemoNotice>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="演示在招岗位" value={companyJobs.length} />
        <StatCard label="本机投递记录" value={ownApplications.length} />
        <StatCard
          label="本机团队评价"
          value={
            ratings.length
              ? `${(ratings.reduce((n, r) => n + r.rating, 0) / ratings.length).toFixed(1)} / 5`
              : '暂无评价'
          }
          detail={`${ratings.length} 条个人记录`}
        />
        <StatCard label="开奖记录" value={timeline.length} />
      </div>
      <div className={styles.companyTabs}>
        {['在招岗位', '面试经验', '薪资参考', '面试风格', '员工评价', '避坑指南', '开奖时间轴'].map(
          (t) => (
            <button
              className={cn(tab === t && styles.active)}
              key={t}
              onClick={() => {
                setTab(t);
                setQuery('');
              }}
            >
              {t}
            </button>
          ),
        )}
      </div>
      <div className="content-grid">
        <div className="min-w-0 space-y-5">
          {tab === '在招岗位' &&
            (companyJobs.length ? (
              <div className="grid gap-4">
                {companyJobs.map((j) => (
                  <JobCard job={j} key={j.id} />
                ))}
              </div>
            ) : (
              <Panel title="暂无在招岗位">
                <p className="text-sm text-muted-foreground">
                  可以关注公司，稍后再查看本地岗位库。
                </p>
              </Panel>
            ))}
          {tab === '面试经验' && (
            <Panel title="面试经验与复盘">
              {companyExperiences.map((e) => (
                <Link
                  key={e.id}
                  href={`/experiences/${e.id}`}
                  className="block border-b py-4 last:border-0"
                >
                  <h2 className="text-sm font-semibold">{e.title}</h2>
                  <p className="mt-2 text-xs leading-7 text-muted-foreground">{e.excerpt}</p>
                </Link>
              ))}
              {!companyExperiences.length && (
                <EmptyState
                  kind="knowledge"
                  title="暂无该公司的面经"
                  description="可以阅读其他公司的同方向经验。"
                  action={
                    <Button asChild>
                      <Link href="/experiences">浏览面经</Link>
                    </Button>
                  }
                />
              )}
            </Panel>
          )}
          {tab === '薪资参考' && (
            <Panel
              title="岗位薪资口径"
              description="以下为岗位库演示区间，不代表已发放 Offer 或真实行情。"
            >
              {companyJobs.map((j) => (
                <Row key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="text-sm">
                    {j.title}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {j.city} · {j.type}
                    </p>
                  </Link>
                  <SmallTag>{j.salary || '薪资待确认'}</SmallTag>
                </Row>
              ))}
              {!companyJobs.length && (
                <p className="py-4 text-sm text-muted-foreground">本地岗位库暂无薪资信息。</p>
              )}
              <Button asChild variant="outline" className="mt-4">
                <Link href="/salary">
                  查看薪资样本与公司对比
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </Panel>
          )}
          {['面试风格', '员工评价', '避坑指南'].includes(tab) && (
            <>
              {tab === '面试风格' && (
                <Panel
                  title="梳理面试风格"
                  description="从自己的面试与公开面经提炼观察，附上岗位和团队上下文。"
                >
                  <p className="text-sm leading-7 text-muted-foreground">
                    可以记录：轮次数量、项目追问深度、算法/基础/业务侧重、面试互动方式与反问环节。每个团队可能不同。
                  </p>
                  <Button asChild variant="outline" className="mt-4">
                    <Link href={`/style/${company.slug}`}>查看演示风格与准备清单</Link>
                  </Button>
                </Panel>
              )}
              {tab === '避坑指南' && (
                <Panel title="我的信息核验清单">
                  {checks.map((check) => (
                    <label className="mb-4 flex items-start gap-3 text-sm leading-7" key={check}>
                      <input
                        className="mt-2"
                        type="checkbox"
                        checked={checked.includes(check)}
                        onChange={(e) =>
                          setChecked((xs) =>
                            e.target.checked ? [...xs, check] : xs.filter((x) => x !== check),
                          )
                        }
                      />
                      {check}
                    </label>
                  ))}
                </Panel>
              )}
              <Panel
                title={category === '团队评价' ? '我的团队评价与观察' : `我的${category}`}
                description="仅自己可见。请记录具体情境、时间与信息来源，区分事实和个人感受。"
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setDraft(newNote(category));
                      setError('');
                    }}
                  >
                    新增{category}
                  </Button>
                }
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Input
                    className="max-w-sm"
                    placeholder="筛选记录内容、岗位或标签"
                    aria-label="筛选公司记录"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={showHidden}
                      onChange={(e) => setShowHidden(e.target.checked)}
                    />
                    显示已隐藏记录
                  </label>
                </div>
                {!visibleNotes.length && (
                  <EmptyState
                    kind="knowledge"
                    title="暂无匹配的公司观察"
                    description="暂无匹配的本地记录，添加第一条观察。"
                    action={
                      <Button
                        onClick={() => {
                          setDraft(newNote(category));
                          setError('');
                        }}
                      >
                        记录第一条观察
                      </Button>
                    }
                  />
                )}
                {visibleNotes.map((n) => (
                  <article className="space-y-3 border-t py-5" key={n.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">
                        {n.title} {n.hidden && <SmallTag>已隐藏</SmallTag>}
                      </h3>
                      {n.category === '团队评价' && <SmallTag>个人评分 {n.rating} / 5</SmallTag>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {n.team || '团队未填'} · {n.role || '岗位未填'} · {n.date}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-7">{n.body}</p>
                    <div className="flex flex-wrap gap-2">
                      {n.tags
                        .split(/[,，]/)
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .map((t, i) => (
                          <SmallTag key={`${t}-${i}`}>{t}</SmallTag>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft(n);
                          setError('');
                        }}
                      >
                        编辑记录
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setNotes((xs) =>
                            xs.map((x) => (x.id === n.id ? { ...x, hidden: !x.hidden } : x)),
                          )
                        }
                      >
                        {n.hidden ? '恢复显示' : '隐藏记录'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setNotes((xs) => xs.filter((x) => x.id !== n.id))}
                      >
                        删除记录
                      </Button>
                    </div>
                  </article>
                ))}
              </Panel>
            </>
          )}
          {tab === '开奖时间轴' && (
            <Panel
              title="我的开奖与沟通时间轴"
              description="手动保存已知结果，不根据他人记录推断自己的结果。"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEventDraft({
                      id: '',
                      date: new Date().toLocaleDateString('sv-SE'),
                      title: '',
                      role: '',
                      result: '等待反馈',
                      note: '',
                    });
                    setError('');
                  }}
                >
                  新增开奖记录
                </Button>
              }
            >
              <Field label="结果筛选">
                <Pick
                  value={resultFilter}
                  onChange={setResultFilter}
                  options={['全部结果', '等待反馈', '笔试通知', '面试通知', 'Offer', '流程结束']}
                />
              </Field>
              <div className="mt-5 space-y-4">
                {[...timeline]
                  .filter((e) => resultFilter === '全部结果' || e.result === resultFilter)
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((event) => (
                    <div className="relative ml-2 border-l pl-5" key={event.id}>
                      <span className="absolute -left-1 top-2 size-2 rounded-full bg-primary" />
                      <p className="text-xs text-muted-foreground">
                        {event.date} · {event.role}
                      </p>
                      <h3 className="mt-2 text-sm font-medium">
                        {event.title} <SmallTag>{event.result}</SmallTag>
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {event.note}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEventDraft(event);
                            setError('');
                          }}
                        >
                          编辑开奖记录
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTimeline((xs) => xs.filter((x) => x.id !== event.id))}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                {!timeline.some(
                  (e) => resultFilter === '全部结果' || e.result === resultFilter,
                ) && (
                  <EmptyState
                    kind="calendar"
                    title="暂无匹配的开奖记录。"
                    description="记录你收到的通知、对应岗位和已确认的结果，建立自己的沟通时间轴。"
                    action={
                      <Button
                        onClick={() => {
                          setEventDraft({
                            id: '',
                            date: new Date().toLocaleDateString('sv-SE'),
                            title: '',
                            role: '',
                            result: '等待反馈',
                            note: '',
                          });
                          setError('');
                        }}
                      >
                        记录第一条结果
                      </Button>
                    }
                  />
                )}
              </div>
            </Panel>
          )}
        </div>
        <aside className="grid content-start gap-5">
          <Panel title="我的公司准备">
            <p className="text-xs leading-7 text-muted-foreground">
              将面经、面试风格、岗位要求与自己的观察放在一起，针对当前岗位准备。
            </p>
            <Button asChild className="mt-4 w-full" size="sm">
              <Link href={`/pack/${company.slug}`}>
                查看公司面经包
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="mt-3 w-full" size="sm">
              <Link href="/pipeline">查看投递看板</Link>
            </Button>
          </Panel>
          <Panel title="信息可信度">
            <p className="text-xs leading-7 text-muted-foreground">
              记录来源、岗位、团队和时间。任何招聘节奏、薪酬与录用结论都需以公司正式通知为准。
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              本机记录：{notes.length} 条观察 · {timeline.length} 条开奖
            </p>
          </Panel>
        </aside>
      </div>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑公司记录' : `新增${category}`}
        description="个人笔记仅存本机；请勿填入他人隐私。"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveNote();
          }}
        >
          {draft && (
            <>
              <Field label="记录标题">
                <Input
                  value={draft.title}
                  maxLength={100}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="团队 / 部门">
                  <Input
                    value={draft.team}
                    onChange={(e) => setDraft({ ...draft, team: e.target.value })}
                  />
                </Field>
                <Field label="对应岗位">
                  <Input
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  />
                </Field>
                <Field label="记录日期">
                  <Input
                    type="date"
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </Field>
                {draft.category === '团队评价' && (
                  <Field label="个人评分（1–5）">
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      value={draft.rating}
                      onChange={(e) => setDraft({ ...draft, rating: Number(e.target.value) })}
                    />
                  </Field>
                )}
              </div>
              <Field label="事实、感受与来源">
                <Textarea
                  value={draft.body}
                  maxLength={5000}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="例如：在某次沟通中确认的培养方式，以及仍需核实的问题。"
                />
              </Field>
              <Field label="标签（逗号分隔）">
                <Input
                  value={draft.tags}
                  maxLength={150}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存公司记录</Button>
            </>
          )}
        </form>
      </Modal>
      <Modal
        open={!!eventDraft}
        onClose={() => setEventDraft(null)}
        title={eventDraft?.id ? '编辑开奖记录' : '新增开奖记录'}
        description="手动记录你收到的通知或已知沟通结果。"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveEvent();
          }}
        >
          {eventDraft && (
            <>
              <Field label="事件标题">
                <Input
                  value={eventDraft.title}
                  maxLength={120}
                  onChange={(e) => setEventDraft({ ...eventDraft, title: e.target.value })}
                />
              </Field>
              <Field label="对应岗位">
                <Input
                  value={eventDraft.role}
                  onChange={(e) => setEventDraft({ ...eventDraft, role: e.target.value })}
                />
              </Field>
              <Field label="事件日期">
                <Input
                  type="date"
                  value={eventDraft.date}
                  onChange={(e) => setEventDraft({ ...eventDraft, date: e.target.value })}
                />
              </Field>
              <Field label="沟通结果">
                <Pick
                  value={eventDraft.result}
                  onChange={(result) => setEventDraft({ ...eventDraft, result })}
                  options={['等待反馈', '笔试通知', '面试通知', 'Offer', '流程结束']}
                />
              </Field>
              <Field label="备注与来源">
                <Textarea
                  value={eventDraft.note}
                  maxLength={3000}
                  onChange={(e) => setEventDraft({ ...eventDraft, note: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存开奖记录</Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

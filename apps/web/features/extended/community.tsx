'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Heart,
  Plus,
  ArrowRight,
  Users,
  Check,
  Flag,
  Trash2,
  Search,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PageHeader,
  Panel,
  DemoNotice,
  SmallTag,
  ProgressBar,
  MatchRing,
  CompanyLogo,
  EmptyState,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { questions, getCompany } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { validateText, joinRoom, questionMatchesRole, type Learning } from '@/lib/knowledge-domain';
import { useKnowledgeLocal } from '@/lib/knowledge-local';
import { LocalDiscussion } from '@/features/knowledge/local-discussion';
import type { PracticeCollection } from './knowledge';
import { RadarCompanyRanking } from './growth-radar-ranking';
import { FilterButtons, Modal, Field, Pick, useLocal } from './common';
type Post = {
  id: number;
  name: string;
  avatar: string;
  time: string;
  body: string;
  tag: string;
  likes: number;
  liked: boolean;
  mine?: boolean;
};
const initialPosts: Post[] = [
  {
    id: 1,
    name: '今天也在学习',
    avatar: '学',
    time: '20 分钟前',
    body: '今天终于能完整讲清楚事件循环了。以前一直背结论，自己写几个小例子、画出调用顺序以后，突然就串起来了。准备秋招的同学一起加油！',
    tag: '学习记录',
    likes: 42,
    liked: false,
  },
  {
    id: 2,
    name: '一颗努力的栗子',
    avatar: '栗',
    time: '1 小时前',
    body: '面试复盘时发现，自己总是急着说方案，忘记先讲问题和约束。下次试试先花半分钟交代背景，再解释为什么这样选择。',
    tag: '面试复盘',
    likes: 68,
    liked: false,
  },
  {
    id: 3,
    name: '小林同学',
    avatar: '林',
    time: '2 小时前',
    body: '整理了一份前端项目自查清单：目标用户是谁？我负责什么？最难的决策是什么？怎么确认做对了？能回答这四个问题，项目故事就有骨架了。',
    tag: '经验分享',
    likes: 103,
    liked: false,
  },
  {
    id: 4,
    name: '南风',
    avatar: '南',
    time: '3 小时前',
    body: '找一位同方向的小伙伴，每周互相模拟一次面试。不卷时长，认真听完彼此的回答，再给两条具体反馈就好。',
    tag: '求职搭子',
    likes: 26,
    liked: false,
  },
];
export function CommunityPage() {
  const [posts, savePosts, error] = useKnowledgeLocal<Post[]>('posts', initialPosts);
  const [reports, saveReports, reportError] = useKnowledgeLocal<
    Record<string, { reason: string; date: string }>
  >('community-reports', {});
  const [draft, saveDraft, draftError, ready] = useKnowledgeLocal('community-draft', {
    body: '',
    tag: '学习记录',
  });
  const [tab, setTab] = useState('全部动态');
  const [publish, setPublish] = useState(false);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('学习记录');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<number | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reason, setReason] = useState('不实信息');
  const [validation, setValidation] = useState('');
  const [status, setStatus] = useState('');
  const [deleting, setDeleting] = useState<Post | null>(null);
  const name = useRadarStore((s) => s.userName);
  const visible = posts.filter(
    (p) =>
      (tab === '我的举报'
        ? !!reports[p.id]
        : !reports[p.id] &&
          (tab === '全部动态' || (tab === '我的动态' ? p.mine : p.tag === tab))) &&
      `${p.body}${p.tag}${p.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  function open() {
    setBody(draft.body);
    setTag(draft.tag);
    setPublish(true);
    setValidation('');
    setStatus('');
  }
  function add() {
    try {
      const text = validateText(body, 1, 1000);
      if (
        savePosts((v) => [
          {
            id: Date.now(),
            name: `${name} · 我`,
            avatar: name.slice(0, 1),
            time: new Date().toLocaleString('zh-CN'),
            body: text,
            tag,
            likes: 0,
            liked: false,
            mine: true,
          },
          ...v,
        ])
      ) {
        saveDraft({ body: '', tag: '学习记录' });
        setBody('');
        setPublish(false);
        setTab('全部动态');
        setStatus('动态已保存到本机社区');
      }
    } catch (e) {
      setValidation((e as Error).message);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="同频社区"
        description="分享一小步，也接住彼此向前走的力量。"
        action={
          <Button disabled={!ready} onClick={open}>
            <Plus size={14} />
            发布演示动态
          </Button>
        }
      />
      <DemoNotice>
        所有用户为虚构样本。发布、讨论、点赞、举报和组队仅保存于本机，不会向他人发送消息。
      </DemoNotice>
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <FilterButtons
            items={[
              '全部动态',
              '学习记录',
              '面试复盘',
              '经验分享',
              '求职搭子',
              '我的动态',
              '我的举报',
            ]}
            value={tab}
            onChange={setTab}
          />
          <Input
            aria-label="搜索社区动态"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索动态、作者或标签"
          />
          {(error || reportError || draftError) && (
            <p role="alert">{error || reportError || draftError}</p>
          )}
          {status && (
            <p role="status" className="text-sm text-primary">
              {status}
            </p>
          )}
          {visible.map((p) => (
            <Panel key={p.id}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {p.avatar}
                </span>
                <div className="flex-1">
                  <h2 className="text-sm font-medium">{p.name}</h2>
                  <p className="text-xs text-subtle mt-1">
                    {p.time} · {p.mine ? '本机动态' : '演示样本'}
                  </p>
                </div>
                <button onClick={() => setTab(p.tag)}>
                  <SmallTag>{p.tag}</SmallTag>
                </button>
              </div>
              <p className="my-5 whitespace-pre-wrap break-words text-sm leading-8">{p.body}</p>
              {reports[p.id] && (
                <div className="mb-4 rounded bg-background p-3 text-xs">
                  已在本机隐藏 · {reports[p.id].reason} · {reports[p.id].date}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      saveReports((v) => {
                        const next = { ...v };
                        delete next[p.id];
                        return next;
                      })
                    }
                  >
                    撤回举报并恢复
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      savePosts((v) =>
                        v.map((x) =>
                          x.id === p.id
                            ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }
                            : x,
                        ),
                      )
                    }
                  >
                    <Heart size={14} className={p.liked ? 'fill-current text-primary' : ''} />
                    {p.likes}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCurrent(p.id)}>
                    交流讨论
                  </Button>
                </div>
                {p.mine ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="删除我的动态"
                    onClick={() => setDeleting(p)}
                  >
                    <Trash2 size={14} />
                    删除动态
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="举报演示内容"
                    onClick={() => setReporting(p)}
                  >
                    <Flag size={14} />
                    {reports[p.id] ? '查看举报' : '举报'}
                  </Button>
                )}
              </div>
            </Panel>
          ))}
          {!visible.length && (
            <EmptyState
              kind="community"
              title={tab === '我的举报' ? '还没有本机举报记录' : '这个话题还很安静'}
              description="调整搜索或写下自己的第一条本机动态。"
              action={<Button onClick={open}>写一条动态</Button>}
            />
          )}
        </div>
        <div className="space-y-5">
          <Panel title="本周话题">
            <h2 className="text-lg leading-8">你最近学会讲清楚哪一个问题？</h2>
            <p className="my-4 text-xs leading-7 text-subtle">
              一个知识点、一段经历，或一个终于理解的原理，都值得记录。
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setBody('最近我学会讲清楚的问题是：');
                setTag('学习记录');
                setPublish(true);
              }}
            >
              参与演示话题
            </Button>
          </Panel>
          <Panel title="找一位同路人">
            <Users className="mb-4 text-primary" />
            <p className="text-xs leading-7">共享题库、互相练习，在本机组织准备计划。</p>
            <Button asChild className="mt-4">
              <Link href="/buddy">
                发现求职搭子
                <ArrowRight size={14} />
              </Link>
            </Button>
          </Panel>
          <Panel title="社区规则">
            <p className="text-xs leading-7 text-subtle">
              尊重差异，不发布隐私、保密信息或未经验证的招聘承诺。举报将在本机隐藏内容并保留理由，人工审核与多人互动尚未连接。
            </p>
          </Panel>
        </div>
      </div>
      <Modal
        open={publish}
        onClose={() => setPublish(false)}
        title="记录今天的一小步"
        description="保存后在本机动态列表可阅读；关闭前可保存草稿。"
      >
        <Field label="动态内容">
          <Textarea
            rows={6}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field label="话题">
          <Pick
            label="话题"
            value={tag}
            onChange={setTag}
            options={['学习记录', '面试复盘', '经验分享', '求职搭子']}
          />
        </Field>
        <p className="text-xs text-subtle">{body.length} / 1000</p>
        {(validation || error || draftError) && (
          <p role="alert">{validation || error || draftError}</p>
        )}
        {status && <p role="status">{status}</p>}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (saveDraft({ body, tag })) setStatus('动态草稿已保存');
            }}
          >
            保存动态草稿
          </Button>
          <Button onClick={add}>保存演示动态</Button>
        </div>
      </Modal>
      <Modal open={current !== null} onClose={() => setCurrent(null)} title="讨论 · 本机演示">
        {current !== null && <LocalDiscussion id={`community-${current}`} />}
      </Modal>
      <Modal open={!!reporting} onClose={() => setReporting(null)} title="记录本机举报">
        <p className="text-sm leading-7">
          选择原因后，此动态会在本机列表隐藏，记录保留在“我的举报”。不会提交至外部审核。
        </p>
        <Field label="举报原因">
          <Pick
            label="举报原因"
            value={reason}
            onChange={setReason}
            options={['不实信息', '侵犯隐私', '不友善内容', '广告或垃圾信息', '其他违规内容']}
          />
        </Field>
        {reportError && <p role="alert">{reportError}</p>}
        <Button
          onClick={() => {
            if (
              reporting &&
              saveReports((v) => ({
                ...v,
                [reporting.id]: { reason, date: new Date().toLocaleString('zh-CN') },
              }))
            ) {
              setReporting(null);
              setStatus('本机举报已记录，动态已隐藏');
            }
          }}
        >
          确认本机举报
        </Button>
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="删除我的动态？">
        <p className="text-sm">删除后将从本机社区列表移除。</p>
        <Button
          onClick={() => {
            if (deleting && savePosts((v) => v.filter((p) => p.id !== deleting.id)))
              setDeleting(null);
          }}
        >
          确认删除动态
        </Button>
      </Modal>
    </div>
  );
}
const buddies = [
  {
    id: 1,
    name: '小林同学',
    avatar: '林',
    school: '华东地区 · 2027届',
    role: '前端开发',
    score: 96,
    tags: ['React', '每周互面', '晚间学习'],
    description: '正在准备前端秋招，希望一起练习项目深挖和 React 原理。',
    time: '工作日 20:00 — 22:00',
  },
  {
    id: 2,
    name: '今天也在学习',
    avatar: '学',
    school: '华南地区 · 2027届',
    role: '前端开发',
    score: 92,
    tags: ['TypeScript', '基础巩固', '周末练习'],
    description: '重视基础和表达，找一个互相监督、认真反馈的小伙伴。',
    time: '周末 14:00 — 17:00',
  },
  {
    id: 3,
    name: '码上有 Offer',
    avatar: '码',
    school: '华北地区 · 2027届',
    role: '后端开发',
    score: 85,
    tags: ['Java', '系统设计', '模拟面试'],
    description: 'Java 后端方向，可以互相检查项目介绍与数据库知识。',
    time: '工作日 19:30 — 21:30',
  },
];
type Room = {
  id: string;
  title: string;
  role: string;
  schedule: string;
  capacity: number;
  members: number;
  joined: boolean;
  mine: boolean;
  questionIds: string[];
  notes: { id: string; content: string }[];
};
const sampleRooms: Room[] = [
  {
    id: 'sample-weekend',
    title: '前端秋招 · 周末互面组',
    role: '前端开发',
    schedule: '周六 15:00',
    capacity: 5,
    members: 3,
    joined: false,
    mine: false,
    questionIds: questions
      .filter((q) => q.topic === 'React' || q.topic === '行为面试')
      .map((q) => q.id),
    notes: [],
  },
];
export function BuddyPage() {
  const [role, setRole] = useState('全部方向');
  const [time, setTime] = useState('全部时间');
  const [query, setQuery] = useState('');
  const [requests, saveRequests, requestError] = useKnowledgeLocal<number[]>('buddy-requests', []);
  const [rooms, saveRooms, error] = useKnowledgeLocal<Room[]>('community-rooms', sampleRooms);
  const [learning, , learningError] = useKnowledgeLocal<Learning>('knowledge-learning', {
    mastery: {},
    wrong: [],
    attempts: {},
  });
  const [, saveCollections, collectionError] = useKnowledgeLocal<PracticeCollection[]>(
    'knowledge-collections',
    [],
  );
  const [current, setCurrent] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [roomRole, setRoomRole] = useState('前端开发');
  const [schedule, setSchedule] = useState('');
  const [capacity, setCapacity] = useState('5');
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState('');
  const [status, setStatus] = useState('');
  const active = rooms.find((r) => r.id === current);
  const visible = buddies.filter(
    (b) =>
      (role === '全部方向' || b.role === role) &&
      (time === '全部时间' ||
        (time === '周末' ? b.time.includes('周末') : b.time.includes('工作日'))) &&
      `${b.name}${b.tags.join('')}${b.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  function create() {
    try {
      const roomTitle = validateText(title, 2, 60);
      const when = validateText(schedule, 2, 80);
      const count = Number(capacity);
      if (!Number.isInteger(count) || count < 2 || count > 10)
        throw new Error('房间人数需为 2 至 10');
      if (!selected.length) throw new Error('请至少选择一道共享题目');
      const room: Room = {
        id: `room-${crypto.randomUUID()}`,
        title: roomTitle,
        role: roomRole,
        schedule: when,
        capacity: count,
        members: 1,
        joined: true,
        mine: true,
        questionIds: selected.filter((id) => questions.some((q) => q.id === id)),
        notes: [],
      };
      if (saveRooms((v) => [room, ...v])) {
        setCreating(false);
        setCurrent(room.id);
        setTitle('');
        setSchedule('');
        setSelected([]);
        setValidation('');
      }
    } catch (e) {
      setValidation((e as Error).message);
    }
  }
  function enter(room: Room) {
    try {
      const next = joinRoom(room);
      if (saveRooms((v) => v.map((r) => (r.id === room.id ? next : r)))) {
        setCurrent(room.id);
        setStatus('');
        setNote('');
      }
    } catch (e) {
      setValidation((e as Error).message);
    }
  }
  function addCollection(room: Room) {
    if (
      saveCollections((v) => [
        ...v.filter((c) => c.id !== room.id),
        {
          id: room.id,
          title: room.title,
          questionIds: room.questionIds,
          source: '本机组队共享题单',
        },
      ])
    )
      setStatus('共享题单已加入我的练习集合');
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="寻找同路人"
        description="从共同方向与可练习时间，找到一起准备的节奏。"
        action={
          <Button
            onClick={() => {
              setCreating(true);
              setValidation('');
            }}
          >
            创建本机练习组
          </Button>
        }
      />
      <DemoNotice>
        个人资料为虚构样本。申请、组队与留言是本机练习记录；房间进度显示你自己的题库自评，尚无真实多人同步。
      </DemoNotice>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <FilterButtons
            items={['全部方向', '前端开发', '后端开发']}
            value={role}
            onChange={setRole}
          />
          <div className="flex flex-wrap gap-3">
            <Pick
              label="可练习时间"
              value={time}
              onChange={setTime}
              options={['全部时间', '工作日', '周末']}
            />
            <Input
              aria-label="搜索同路人"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标签或学习目标"
            />
          </div>
          <p className="text-xs text-subtle">
            按共同方向和练习时间筛选 · {visible.length} 位样本同路人
          </p>
          {(requestError || error || learningError || validation) && (
            <p role="alert">{requestError || error || learningError || validation}</p>
          )}
          {visible.map((b) => (
            <Panel key={b.id}>
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {b.avatar}
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold">{b.name}</h2>
                  <p className="mt-1 text-xs text-subtle">
                    {b.school} · {b.role}
                  </p>
                </div>
                <SmallTag>{role === b.role ? '同方向' : '方向样本'}</SmallTag>
              </div>
              <p className="my-5 text-sm leading-7 text-muted-foreground">{b.description}</p>
              <div className="my-4 flex flex-wrap gap-2">
                {b.tags.map((t) => (
                  <button key={t} onClick={() => setQuery(t)}>
                    <SmallTag>{t}</SmallTag>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-xs text-subtle">{b.time}</span>
                <Button
                  size="sm"
                  variant={requests.includes(b.id) ? 'outline' : 'default'}
                  onClick={() =>
                    saveRequests((v) =>
                      v.includes(b.id) ? v.filter((x) => x !== b.id) : [...v, b.id],
                    )
                  }
                >
                  {requests.includes(b.id) ? '已申请 · 撤回' : '记录搭子申请'}
                </Button>
              </div>
              {requests.includes(b.id) && (
                <p className="mt-3 text-xs text-primary">
                  申请已在本机保存，未发送给真实用户。可以创建一个本机练习组安排练习。
                </p>
              )}
            </Panel>
          ))}
          {!visible.length && (
            <EmptyState
              kind="community"
              title="还没有匹配的样本同路人"
              description="调整方向、时间或关键词，也可以创建自己的练习组。"
              action={
                <Button
                  onClick={() => {
                    setRole('全部方向');
                    setTime('全部时间');
                    setQuery('');
                  }}
                >
                  清空匹配条件
                </Button>
              }
            />
          )}
        </div>
        <div className="space-y-5">
          <h2 className="font-semibold">一起练习的房间</h2>
          {rooms
            .filter((r) => role === '全部方向' || r.role === role)
            .map((r) => (
              <Panel key={r.id}>
                <SmallTag>{r.mine ? '我创建的本机组' : '样本练习组'}</SmallTag>
                <h3 className="my-4 font-medium">{r.title}</h3>
                <p className="text-xs leading-7 text-subtle">
                  {r.role} · {r.schedule}
                  <br />
                  {r.members} / {r.capacity} 人 · {r.questionIds.length} 道共享题目
                </p>
                <ProgressBar value={(r.members / r.capacity) * 100} />
                <Button
                  className="mt-4 w-full"
                  disabled={!r.joined && r.members >= r.capacity}
                  onClick={() => enter(r)}
                >
                  {r.joined
                    ? '打开练习房间'
                    : r.members >= r.capacity
                      ? '房间已满'
                      : '加入本机练习组'}
                </Button>
              </Panel>
            ))}
          {!rooms.some((r) => role === '全部方向' || r.role === role) && (
            <p className="text-xs text-subtle">这个方向还没有练习组。</p>
          )}
          <Button variant="outline" onClick={() => setCreating(true)}>
            创建新的练习组
          </Button>
        </div>
      </div>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="创建本机练习组"
        description="配置练习时间与题单；成员名额为本机模拟。"
      >
        <div className="space-y-4">
          <Field label="练习组名称">
            <Input maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="组队方向">
            <Pick
              label="组队方向"
              value={roomRole}
              onChange={(v) => {
                setRoomRole(v);
                setSelected([]);
              }}
              options={['前端开发', '后端开发']}
            />
          </Field>
          <Field label="练习安排">
            <Input
              maxLength={80}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="例如：周六 15:00，每次 40 分钟"
            />
          </Field>
          <Field label="人数上限（2-10）">
            <Input
              type="number"
              min={2}
              max={10}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm">选择共享题目</legend>
            {questions
              .filter((q) => questionMatchesRole(q, roomRole))
              .map((q) => (
                <label className="flex gap-2 py-2 text-sm" key={q.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(q.id)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked ? [...v, q.id] : v.filter((id) => id !== q.id),
                      )
                    }
                  />
                  {q.title}
                </label>
              ))}
          </fieldset>
          {(validation || error) && <p role="alert">{validation || error}</p>}
          <Button onClick={create}>创建并加入练习组</Button>
        </div>
      </Modal>
      <Modal
        open={!!active}
        onClose={() => setCurrent(null)}
        title={active?.title || '练习房间'}
        description="共享题库和备忘均为本机记录，进度读取你的题库自评。"
      >
        {active && (
          <div className="space-y-5">
            <p className="text-sm">
              {active.schedule} · {active.members}/{active.capacity} 人
            </p>
            <p className="text-xs text-primary">
              已掌握 {active.questionIds.filter((id) => learning.mastery[id] === '已掌握').length} /{' '}
              {active.questionIds.length} 道共享题目
            </p>
            <ProgressBar
              value={
                active.questionIds.length
                  ? (active.questionIds.filter((id) => learning.mastery[id] === '已掌握').length /
                      active.questionIds.length) *
                    100
                  : 0
              }
            />
            {active.questionIds
              .map((id) => questions.find((q) => q.id === id))
              .filter((q) => !!q)
              .map((q) => (
                <Link
                  key={q.id}
                  href={`/questions?question=${q.id}`}
                  className="block rounded border border-border p-3 text-sm text-primary"
                >
                  {q.title}
                  <span className="mt-2 block text-xs text-subtle">
                    {learning.mastery[q.id] || '未学习'} · 练习 {learning.attempts[q.id] || 0} 次
                  </span>
                </Link>
              ))}
            <Button onClick={() => addCollection(active)}>共享题单加入我的题库</Button>
            {status && (
              <p role="status" className="text-sm text-primary">
                {status}
              </p>
            )}
            {collectionError && <p role="alert">{collectionError}</p>}
            <h3 className="text-sm font-semibold">本机组队备忘</h3>
            {active.notes.map((n) => (
              <div key={n.id} className="rounded bg-background p-3">
                <p className="whitespace-pre-wrap break-words text-sm">{n.content}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    saveRooms((v) =>
                      v.map((r) =>
                        r.id === active.id
                          ? { ...r, notes: r.notes.filter((x) => x.id !== n.id) }
                          : r,
                      ),
                    )
                  }
                >
                  删除备忘
                </Button>
              </div>
            ))}
            <Textarea
              aria-label="组队备忘"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记录练习安排和反馈"
            />
            <Button
              onClick={() => {
                try {
                  const text = validateText(note, 1, 1000);
                  if (
                    saveRooms((v) =>
                      v.map((r) =>
                        r.id === active.id
                          ? {
                              ...r,
                              notes: [...r.notes, { id: crypto.randomUUID(), content: text }],
                            }
                          : r,
                      ),
                    )
                  ) {
                    setNote('');
                    setValidation('');
                  }
                } catch (e) {
                  setValidation((e as Error).message);
                }
              }}
            >
              保存组队备忘
            </Button>
            {(validation || error) && <p role="alert">{validation || error}</p>}
            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    saveRooms((v) =>
                      v.map((r) =>
                        r.id === active.id
                          ? { ...r, joined: false, members: Math.max(0, r.members - 1) }
                          : r,
                      ),
                    )
                  )
                    setCurrent(null);
                }}
              >
                退出练习组
              </Button>
              {active.mine && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (saveRooms((v) => v.filter((r) => r.id !== active.id))) setCurrent(null);
                  }}
                >
                  删除我创建的组
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
const signals = [
  {
    id: 1,
    companyId: 'tencent',
    type: '招聘动态',
    title: '2027 秋招前端岗位开放 · 演示',
    body: '微信事业群与腾讯云方向新增岗位卡片。可以先查看要求，再决定是否加入准备清单。',
    time: '20 分钟前',
    confidence: '演示样本',
    x: 32,
    y: 43,
    r: 45,
  },
  {
    id: 2,
    companyId: 'bytedance',
    type: '面试风向',
    title: '前端项目追问持续受到关注 · 演示',
    body: '样例面经中，工程取舍与项目证据是常见的追问方向。建议整理一条完整的问题链。',
    time: '1 小时前',
    confidence: '样例观察',
    x: 61,
    y: 30,
    r: 54,
  },
  {
    id: 3,
    companyId: 'alibaba',
    type: '招聘动态',
    title: '云计算与后端方向更新 · 演示',
    body: '后端与云计算岗位样例更新，包含数据库与分布式相关要求。',
    time: '2 小时前',
    confidence: '演示样本',
    x: 73,
    y: 67,
    r: 36,
  },
  {
    id: 4,
    companyId: 'meituan',
    type: '截止提醒',
    title: '美团笔试准备节点 · 演示',
    body: '演示提醒：在线笔试前确认设备与网络，围绕算法和基础知识进行一次限时练习。',
    time: '3 小时前',
    confidence: '演示样本',
    x: 43,
    y: 77,
    r: 31,
  },
  {
    id: 5,
    companyId: 'ant',
    type: '面试风向',
    title: '体验技术关注组件设计 · 演示',
    body: '演示资料涉及可复用组件、可访问性与工程实践，可结合相关题目准备。',
    time: '4 小时前',
    confidence: '样例观察',
    x: 18,
    y: 71,
    r: 28,
  },
  {
    id: 6,
    companyId: 'huawei',
    type: '招聘动态',
    title: '鸿蒙与嵌入式方向岗位 · 演示',
    body: '样例岗位强调操作系统与 C/C++ 基础，适合对软硬件协同感兴趣的同学。',
    time: '5 小时前',
    confidence: '演示样本',
    x: 18,
    y: 20,
    r: 25,
  },
];
export function RadarPage() {
  const [scope, setScope] = useState('全部公司');
  const favorites = useRadarStore((s) => s.favorites);
  const [type, setType] = useState('全部信号');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(1);
  const [subscribed, setSubscribed] = useLocal<number[]>('signals-saved', []);
  const visible = signals.filter(
    (s) =>
      (type === '全部信号' || s.type === type) &&
      (scope === '全部公司' ||
        favorites.includes(`company:${s.companyId}`) ||
        subscribed.includes(s.id)) &&
      (getCompany(s.companyId).name + s.title).includes(query),
  );
  const current = visible.find((s) => s.id === selected) ?? visible[0];
  return (
    <div className="space-y-6">
      <PageHeader
        title="情报雷达"
        description="从信息噪声中，找到与你有关的那一束信号。"
        action={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-status-offer" />
            演示信号源 · 2026.10.23
          </span>
        }
      />
      <DemoNotice>
        所有信号、公司热度和时间为虚构演示，不代表真实招聘情报。气泡大小仅用于展示界面效果。
      </DemoNotice>
      <div className="flex flex-wrap justify-between gap-4">
        <FilterButtons
          items={['全部信号', '招聘动态', '面试风向', '截止提醒']}
          value={type}
          onChange={setType}
        />
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-3 size-4 text-subtle" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="定位一家公司"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterButtons items={['全部公司', '仅已关注']} value={scope} onChange={setScope} />
        <p className="text-xs text-muted-foreground">已关注公司与已关注信号均可在这里筛选。</p>
      </div>
      <RadarCompanyRanking
        companyIds={visible.map((s) => s.companyId)}
        selectedCompanyId={current?.companyId}
        onSelect={(id) => {
          const signal = visible.find((s) => s.companyId === id);
          if (signal) setSelected(signal.id);
        }}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="公司信号分布" description="选择气泡，查看对应信号">
          <div className="relative min-h-[380px] overflow-hidden rounded-xl bg-background">
            <svg viewBox="0 0 500 380" className="absolute inset-0 h-full w-full" aria-hidden>
              <circle cx="250" cy="190" r="60" fill="none" stroke="var(--color-border)" />
              <circle
                cx="250"
                cy="190"
                r="115"
                fill="none"
                stroke="var(--color-border)"
                strokeDasharray="3 7"
              />
              <circle
                cx="250"
                cy="190"
                r="172"
                fill="none"
                stroke="var(--color-border)"
                strokeDasharray="3 7"
              />
              <path d="M250 18V362M78 190H422" stroke="var(--color-border)" strokeDasharray="3 7" />
            </svg>
            {visible.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                aria-label={`查看${getCompany(s.companyId).name}信号`}
                aria-pressed={current?.id === s.id}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 ${current?.id === s.id ? 'border-primary bg-primary/20 text-primary' : 'border-purple/40 bg-purple/15 text-status-interview'}`}
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2 }}
              >
                <span className="text-xs font-semibold">{getCompany(s.companyId).name}</span>
                {s.r > 35 && <span className="mt-2 text-[10px] opacity-70">{s.type}</span>}
              </button>
            ))}
            {!visible.length && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                没有匹配的演示信号
              </div>
            )}
          </div>
          <p className="mt-4 text-[11px] text-subtle">
            图示仅展示分布。可通过右侧列表阅读相同信息。
          </p>
        </Panel>
        <Panel title="信号详情" action={current && <SmallTag>{current.type}</SmallTag>}>
          {current ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <CompanyLogo companyId={current.companyId} />
                <div>
                  <h2 className="font-semibold">{getCompany(current.companyId).name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current.time} · {current.confidence}
                  </p>
                </div>
              </div>
              <h3 className="text-lg font-medium leading-8">{current.title}</h3>
              <p className="text-sm leading-8 text-muted-foreground">{current.body}</p>
              <div className="rounded-lg bg-background p-4 text-xs leading-7 text-muted-foreground">
                来源：校招雷达虚构种子数据
                <br />
                核验状态：未连接真实来源
                <br />
                请以企业官网的实际招聘公告为准。
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    setSubscribed((v) =>
                      v.includes(current.id)
                        ? v.filter((x) => x !== current.id)
                        : [...v, current.id],
                    )
                  }
                >
                  {subscribed.includes(current.id) ? (
                    <Check className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {subscribed.includes(current.id) ? '已关注 · 取消' : '关注这条信号'}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/company/${current.companyId}`}>
                    查看公司
                    <ArrowUpRight className="size-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              kind="community"
              title="暂时未探测到匹配信号"
              description="清空搜索或切换信号类别继续探索。"
              action={
                <Button
                  onClick={() => {
                    setType('全部信号');
                    setQuery('');
                    setScope('全部公司');
                  }}
                >
                  清空筛选
                </Button>
              }
            />
          )}
        </Panel>
      </div>
      <Panel title={`${visible.length} 条演示信号`}>
        {visible.map((s) => (
          <button
            key={s.id}
            className={`flex w-full items-center gap-4 border-b border-border py-4 text-left last:border-0 ${current?.id === s.id ? 'text-primary' : ''}`}
            onClick={() => setSelected(s.id)}
          >
            <CompanyLogo companyId={s.companyId} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm">{s.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.type} · {s.time}
              </p>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-subtle" />
          </button>
        ))}
      </Panel>
    </div>
  );
}

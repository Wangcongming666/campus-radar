'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  GraduationCap,
  MapPin,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CompanyLogo,
  DemoNotice,
  EmptyState,
  FavoriteButton,
  PageHeader,
  PageTabs,
  Panel,
  ProgressBar,
  SectionLink,
  SmallTag,
  StatCard,
} from '@/components/shared';
import {
  chapters,
  companies,
  experiences,
  getCompany,
  getJob,
  jobs,
  questions,
  stages,
} from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import s from './account.module.css';
import { useCampus } from '@/components/campus-provider';
import { ApiAccountPage } from './api-account-page';
import { useAllExperiences } from '@/lib/knowledge-local';
import type { Experience } from '@/lib/data';
import { LocalDataTools } from './local-data-tools';
import { clearInterviewFiles } from '@/lib/interview-repository';
import { parseSavedProfile } from '@/lib/local-matching';
type DemoProfile = {
  school?: string;
  degree?: string;
  year?: string;
  roles?: string[];
  cities?: string[];
  sampleResume?: boolean;
};
function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(fallback))
      return (
        Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
          ? parsed
          : fallback
      ) as T;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const record = parsed as Record<string, unknown>;
    if (
      !Object.entries(fallback as Record<string, unknown>).every(
        ([key, item]) => typeof record[key] === typeof item,
      )
    )
      return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}
export function MePage() {
  const { mode } = useCampus();
  return mode === 'api' ? <ApiAccountPage /> : <DemoMePage />;
}
function DemoMePage() {
  const allExperiences = useAllExperiences();
  const store = useRadarStore();
  const [tab, setTab] = useState('我的概览');
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(store.userName);
  const profile = parseSavedProfile(store.notes['onboarding-profile']);
  const activeApplications = store.applications.filter((application) => !application.archived);
  const offerCount = activeApplications.filter((a) => a.stage === 'OFFER').length;
  const matchedCount = profile.roles?.length
    ? jobs.filter(
        (job) =>
          profile.roles!.includes(job.role) &&
          (!profile.cities?.length || profile.cities.includes(job.city)),
      ).length
    : 0;
  const achievements = [
    {
      title: '主动出发',
      hint: '追踪至少 1 份投递',
      earned: store.applications.length > 0,
      href: '/pipeline',
    },
    {
      title: '知识积累',
      hint: '完成至少 3 个宝典章节',
      earned:
        store.completed.filter((id) => chapters.some((chapter) => chapter.id === id)).length >= 3,
      href: '/handbook',
    },
    {
      title: '经验分享',
      hint: '发布至少 1 篇本机面经',
      earned: allExperiences.some((experience) => experience.id.startsWith('local-exp-')),
      href: '/experiences',
    },
    { title: '收获认可', hint: '记录至少 1 份 Offer', earned: offerCount > 0, href: '/pipeline' },
  ];
  return (
    <>
      <PageHeader
        title="个人中心"
        description="每一步积累，都在让你更靠近理想的自己。"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">
              <Settings size={14} />
              账号设置
            </Link>
          </Button>
        }
      />
      <section className={s.profileBanner}>
        <div className={s.profileAvatar}>{store.userName.charAt(0)}</div>
        <div className={s.profileInfo}>
          <h2>
            {store.userName}{' '}
            <span className="inline-block align-middle ml-2">
              <SmallTag active>{profile.year || '2027'} 届校招生</SmallTag>
            </span>
          </h2>
          <p>{profile.roles?.join(' / ') || '前端开发'} · 愿每一份努力都有回响</p>
          <div className={s.profileMeta}>
            <span>
              <GraduationCap size={12} />
              {profile.school || '学校待完善'}
            </span>
            <span>
              <MapPin size={12} />
              {profile.cities?.join('、') || '意向城市待完善'}
            </span>
            <span>
              <ShieldCheck size={12} />
              本地演示资料
            </span>
          </div>
        </div>
        <div className={s.profileAction}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setName(store.userName);
              setEdit(true);
            }}
          >
            <PenLine size={13} />
            编辑资料
          </Button>
          <small>{store.profileComplete ? '资料已完善，继续向前' : '完善画像，发现更多可能'}</small>
        </div>
      </section>
      <div className={s.stats}>
        {[
          [activeApplications.length, '跟进中的投递', '/pipeline'],
          [
            activeApplications.filter((application) =>
              ['INTERVIEW_1', 'INTERVIEW_2', 'HR'].includes(application.stage),
            ).length,
            '进行中的面试',
            '/calendar',
          ],
          [offerCount, '已记录 Offer', '/pipeline'],
          [matchedCount, '符合偏好的岗位', '/jobs'],
        ].map(([v, l, href]) => (
          <Link href={String(href)} key={l}>
            <strong>{v}</strong>
            <span>{l}</span>
          </Link>
        ))}
      </div>
      <Panel title="成长徽章" description="根据当前本机记录解锁；样本投递也计入统计。">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {achievements.map((badge) => (
            <Link
              href={badge.href}
              key={badge.title}
              className={`rounded-xl border p-4 transition-colors hover:border-primary/40 ${badge.earned ? 'border-primary/25 bg-primary/5' : 'border-border opacity-60'}`}
            >
              <Sparkles
                className={`size-5 mb-3 ${badge.earned ? 'text-primary' : 'text-subtle'}`}
              />
              <h3 className="text-xs font-medium">
                {badge.title} · {badge.earned ? '已解锁' : '待解锁'}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-2">{badge.hint}</p>
            </Link>
          ))}
        </div>
      </Panel>
      <div className="h-6" />
      <PageTabs items={['我的概览', '个人资料', '最近动态']} value={tab} onChange={setTab} />
      {tab === '个人资料' ? (
        <Panel title="我的演示画像" action={<SectionLink href="/onboarding">重新完善</SectionLink>}>
          <dl className={s.profileDetails}>
            {[
              ['昵称', store.userName],
              ['学校', profile.school || '尚未填写'],
              ['学历', profile.degree || '本科'],
              ['毕业年份', profile.year || '2027'],
              ['意向方向', profile.roles?.join('、') || '前端开发'],
              ['意向城市', profile.cities?.join('、') || '尚未选择'],
            ].map(([l, v]) => (
              <div key={l}>
                <dt>{l}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-7">
            <DemoNotice>资料只用于产品体验，不会生成正式账号或用于真实岗位申请。</DemoNotice>
          </div>
        </Panel>
      ) : (
        <div className={s.twoCol}>
          <div>
            <Panel
              title={tab === '最近动态' ? '全部近期动态' : '我的校招足迹'}
              action={<SectionLink href="/pipeline">查看投递</SectionLink>}
            >
              <div className="pt-1">
                {[...store.applications]
                  .reverse()
                  .slice(0, tab === '最近动态' ? 12 : 5)
                  .map((a) => {
                    const job = getJob(a.jobId);
                    return job ? (
                      <Link
                        className={`${s.activity} block`}
                        href={`/pipeline?preview=job:${job.id}`}
                        key={a.id}
                      >
                        <div className={s.activityTop}>
                          <span>{a.date}</span>
                          <span>{stages.find((st) => st.id === a.stage)?.label}</span>
                        </div>
                        <h3>
                          {getCompany(job.companyId).name} · {job.title}
                        </h3>
                        <p>{a.notes || '给这次投递记一笔，帮助下次跟进。'}</p>
                      </Link>
                    ) : null;
                  })}
              </div>
              {store.applications.length === 0 && (
                <EmptyState
                  kind="pipeline"
                  title="你的故事，从第一次行动开始"
                  action={
                    <Button size="sm" asChild>
                      <Link href="/jobs">发现岗位</Link>
                    </Button>
                  }
                />
              )}
            </Panel>
            <div className="mt-5">
              <Panel
                title="学习的每一步，都算数"
                action={<SectionLink href="/handbook">继续学习</SectionLink>}
              >
                <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
                  <span>知识手册完成进度</span>
                  <span>
                    {store.completed.filter((x) => chapters.some((c) => c.id === x)).length} /{' '}
                    {chapters.length}
                  </span>
                </div>
                <ProgressBar
                  value={
                    (store.completed.filter((x) => chapters.some((c) => c.id === x)).length /
                      chapters.length) *
                    100
                  }
                />
                <div className="grid sm:grid-cols-2 gap-3 mt-5">
                  {chapters.slice(0, 4).map((c) => (
                    <Link
                      href={`/handbook?chapter=${c.id}`}
                      key={c.id}
                      className="flex gap-2 text-[11px] text-muted-foreground items-center"
                    >
                      {store.completed.includes(c.id) ? (
                        <CheckCheck size={14} className="text-status-offer" />
                      ) : (
                        <BookOpen size={14} className="text-subtle" />
                      )}
                      {c.title}
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
          <aside>
            <Panel title="下一步，做点什么？">
              {[
                ['/jobs', '发现新的可能', '找到适合你的校招机会', Target],
                ['/favorites', '回到我的收藏', '岗位、面经与知识灵感', Bookmark],
                ['/analytics', '看看我的成长', '让准备更有方向', Sparkles],
                ['/notifications', '查看消息提醒', '跟进演示日程与产品动态', Bell],
              ].map(([href, title, desc, Icon]) => {
                const ItemIcon = Icon as typeof Target;
                return (
                  <Link key={String(href)} href={String(href)} className={s.quickLink}>
                    <span className={s.quickIcon}>
                      <ItemIcon size={16} />
                    </span>
                    <span>
                      <strong>{String(title)}</strong>
                      <small>{String(desc)}</small>
                    </span>
                    <ChevronRight size={13} className="ml-auto text-subtle" />
                  </Link>
                );
              })}
            </Panel>
            <div className="mt-5">
              <Panel title="这份资料，只属于此刻的你">
                <p className="text-[11px] text-muted-foreground leading-7">
                  当前使用本地演示账号。收藏、学习笔记和投递进展保存在当前浏览器，可在设置中导出备份。
                </p>
                <Button variant="outline" size="sm" asChild className="w-full mt-4">
                  <Link href="/settings#privacy">
                    <ShieldCheck size={13} />
                    数据与隐私
                  </Link>
                </Button>
              </Panel>
            </div>
          </aside>
        </div>
      )}
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑演示资料</DialogTitle>
            <DialogDescription>昵称将在工作台与本地讨论中显示。</DialogDescription>
          </DialogHeader>
          <label className="form-label">
            昵称
            <Input
              className="mt-2"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：林同学"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (name.trim().length < 2) {
                  toast.error('昵称至少需要 2 个字');
                  return;
                }
                store.setProfile(name.trim());
                setEdit(false);
                toast.success('演示资料已更新');
              }}
            >
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-6">
        <DemoNotice />
      </div>
    </>
  );
}
type FavoriteItem = {
  key: string;
  type: string;
  id: string;
  title: string;
  description: string;
  href: string;
  companyId?: string;
  tags: string[];
};
function favoriteItem(
  key: string,
  allExperiences: Experience[] = experiences,
): FavoriteItem | null {
  const [type, id] = key.split(':');
  if (type === 'job') {
    const job = jobs.find((x) => x.id === id);
    return job
      ? {
          key,
          type,
          id,
          title: job.title,
          description: `${getCompany(job.companyId).name} · ${job.department} · ${job.city}`,
          href: `/jobs?preview=job:${id}`,
          companyId: job.companyId,
          tags: [job.type, job.salary, ...job.tags.slice(0, 2)],
        }
      : null;
  }
  if (type === 'experience') {
    const exp = allExperiences.find((x) => x.id === id);
    return exp
      ? {
          key,
          type,
          id,
          title: exp.title,
          description: exp.excerpt,
          href: `/experiences?preview=experience:${id}`,
          companyId: exp.companyId,
          tags: [exp.role, exp.round, ...exp.tags.slice(0, 2)],
        }
      : null;
  }
  if (type === 'question') {
    const q = questions.find((x) => x.id === id);
    return q
      ? {
          key,
          type,
          id,
          title: q.title,
          description: `${q.topic} · 高频面试知识点`,
          href: `/questions?preview=question:${id}`,
          tags: [q.difficulty, `${q.frequency}% 演示频率`],
        }
      : null;
  }
  if (type === 'company') {
    const company = companies.find((x) => x.id === id);
    return company
      ? {
          key,
          type,
          id,
          title: company.name,
          description: company.description,
          href: `/company/${company.slug}`,
          companyId: company.id,
          tags: company.tags,
        }
      : null;
  }
  if (type === 'chapter') {
    const chapter = chapters.find((x) => x.id === id);
    return chapter
      ? {
          key,
          type,
          id,
          title: chapter.title,
          description: `${chapter.category} · 知识手册`,
          href: `/handbook?chapter=${id}`,
          tags: [`${chapter.sections.length} 个知识小节`, '知识手册'],
        }
      : null;
  }
  return null;
}
export function FavoritesPage() {
  const allExperiences = useAllExperiences();
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  const [tab, setTab] = useState('全部收藏');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const types: Record<string, string> = {
    收藏岗位: 'job',
    收藏面经: 'experience',
    收藏题目: 'question',
    关注企业: 'company',
    知识章节: 'chapter',
  };
  const items = useMemo(
    () =>
      favorites
        .map((key) => favoriteItem(key, allExperiences))
        .filter((x): x is FavoriteItem => !!x)
        .filter(
          (x) =>
            (tab === '全部收藏' || x.type === types[tab]) &&
            `${x.title}${x.description}${x.tags.join('')}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        ),
    [favorites, tab, search, allExperiences],
  );
  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get('type');
    const label = Object.entries(types).find(([, value]) => value === type)?.[0];
    if (label) setTab(label);
  }, []);
  const checked = items.length > 0 && items.every((x) => selected.includes(x.key));
  function remove() {
    selected.forEach((key) => {
      if (favorites.includes(key)) {
        const [type, id] = key.split(':');
        toggle(type, id);
      }
    });
    setSelected([]);
    setConfirm(false);
    toast.success('所选收藏已移除');
  }
  return (
    <>
      <PageHeader
        title="我的收藏"
        description="把心动的机会、有用的经验和知识灵感，放在一起。"
        action={<SmallTag active>{favorites.length} 项收藏</SmallTag>}
      />
      <PageTabs
        items={['全部收藏', '收藏岗位', '收藏面经', '收藏题目', '关注企业', '知识章节']}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSelected([]);
        }}
      />
      <div className={s.filterBar}>
        <div className={s.search}>
          <Search size={14} />
          <Input
            aria-label="搜索收藏"
            placeholder="在收藏中搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[10px] text-subtle ml-auto">{items.length} 项结果</span>
        {items.length > 0 && (
          <label className={s.selectAll}>
            <input
              type="checkbox"
              className={s.check}
              checked={checked}
              onChange={() => setSelected(checked ? [] : items.map((x) => x.key))}
            />
            全选
          </label>
        )}
      </div>
      {selected.length > 0 && (
        <div className={s.bulk}>
          <span>已选择 {selected.length} 项</span>
          <button className="text-subtle text-[10px]" onClick={() => setSelected([])}>
            取消选择
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive h-7 text-[10px]"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={12} />
            批量移除
          </Button>
        </div>
      )}
      {items.length ? (
        <div className={s.collection}>
          {items.map((item) => (
            <div className={s.listRow} key={item.key}>
              <input
                type="checkbox"
                className={s.check}
                aria-label={`选择 ${item.title}`}
                checked={selected.includes(item.key)}
                onChange={() =>
                  setSelected((x) =>
                    x.includes(item.key) ? x.filter((k) => k !== item.key) : [...x, item.key],
                  )
                }
              />
              {item.companyId ? (
                <CompanyLogo companyId={item.companyId} />
              ) : (
                <div className={s.listIcon}>
                  <BookOpen size={20} />
                </div>
              )}
              <div className={s.listBody}>
                <Link href={item.href}>
                  <h3>{item.title}</h3>
                  <p className="line-clamp-1">{item.description}</p>
                </Link>
                <div className={s.listMeta}>
                  {item.tags.map((t) => (
                    <SmallTag key={t}>{t}</SmallTag>
                  ))}
                </div>
              </div>
              <FavoriteButton
                active
                onClick={() => {
                  toggle(item.type, item.id);
                  setSelected((x) => x.filter((k) => k !== item.key));
                  toast.success('已取消收藏');
                }}
              />
              <Link
                href={item.href}
                className="text-subtle hover:text-primary"
                aria-label={`查看 ${item.title}`}
              >
                <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          kind="favorites"
          title={search ? '没有找到这份收藏' : '给未来的自己，留一点灵感'}
          description={
            search
              ? '换个关键词，试试企业、技术栈或岗位名称。'
              : '发现心仪岗位或有用面经时，点击收藏，就能在这里找到。'
          }
          action={
            <Button size="sm" asChild>
              <Link href="/jobs">
                去发现机会 <ArrowRight size={13} />
              </Link>
            </Button>
          }
        />
      )}
      <div className="mt-6">
        <DemoNotice>收藏跨页面同步，并保存在当前浏览器中。</DemoNotice>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除这 {selected.length} 项收藏？</DialogTitle>
            <DialogDescription>
              移除后可以在原页面重新收藏，不影响投递与学习笔记。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              保留收藏
            </Button>
            <Button variant="destructive" onClick={remove}>
              移除所选收藏
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export const demoNotifications = [
  {
    id: 'notice-1',
    category: '面试提醒',
    title: '下一场对话，准备好了吗？',
    content:
      '腾讯 WXG 前端二面示例提醒：复习项目深挖与 React 性能优化。此日期仅用于演示，不是真实面试邀请。',
    date: '今天 09:00',
    href: '/pipeline',
    action: '查看投递记录',
    icon: CalendarDays,
  },
  {
    id: 'notice-2',
    category: '岗位动态',
    title: '你的收藏岗位即将截止',
    content:
      '演示岗位「阿里巴巴 Java 研发工程师」标记截止日期为 10 月 26 日。请以企业官方发布的信息为准。',
    date: '今天 08:30',
    href: '/jobs?preview=job:job-3',
    action: '查看岗位',
    icon: BriefcaseBusiness,
  },
  {
    id: 'notice-3',
    category: '学习提醒',
    title: '保持一点点进步，就很好',
    content:
      '知识手册的 React 与现代前端章节已准备就绪。用一个具体例子，把 Hooks 与状态更新讲清楚。',
    date: '昨天 18:00',
    href: '/handbook?chapter=react',
    action: '继续学习',
    icon: BookOpen,
  },
  {
    id: 'notice-4',
    category: '系统通知',
    title: '欢迎来到校招雷达',
    content:
      '这是一个完整的产品交互演示。所有招聘内容均为样本，你的收藏、笔记和操作只保存在当前浏览器。',
    date: '10 月 21 日',
    href: '/settings#privacy',
    action: '了解数据与隐私',
    icon: Sparkles,
  },
  {
    id: 'notice-5',
    category: '岗位动态',
    title: '一份新的可能，值得看看',
    content: '演示岗位「蚂蚁集团 前端开发实习生」已加入岗位广场。体验技能匹配与岗位预览。',
    date: '10 月 20 日',
    href: '/jobs?preview=job:job-8',
    action: '探索这份岗位',
    icon: Target,
  },
];
export function NotificationsPage() {
  const localNotifications = useRadarStore((s) => s.notifications);
  const removeNotification = useRadarStore((s) => s.removeNotification);
  const notes = useRadarStore((s) => s.notes);
  const setNote = useRadarStore((s) => s.setNote);
  const read = parseJson<string[]>(notes['notifications-read'], []);
  const hidden = parseJson<string[]>(notes['notifications-hidden'], []);
  const icons = {
    面试提醒: CalendarDays,
    岗位动态: BriefcaseBusiness,
    学习提醒: BookOpen,
    系统通知: Sparkles,
  };
  const allNotifications = [
    ...localNotifications.map((notice) => ({ ...notice, icon: icons[notice.category] })),
    ...demoNotifications,
  ].filter((notice) => !hidden.includes(notice.id));
  const [category, setCategory] = useState('全部消息');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const unread = allNotifications.filter((n) => !read.includes(n.id)).length;
  function mark(ids: string[]) {
    setNote('notifications-read', JSON.stringify([...new Set([...read, ...ids])]));
  }
  const list = allNotifications.filter(
    (n) =>
      (category === '全部消息' || category === n.category) && (!onlyUnread || !read.includes(n.id)),
  );
  return (
    <>
      <PageHeader
        title="消息中心"
        description={
          <>
            把重要的下一步，放在你看得见的地方。
            <span className="text-primary ml-2">{unread} 条未读</span>
          </>
        }
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!unread}
            onClick={() => {
              mark(allNotifications.map((n) => n.id));
              toast.success('所有消息已标记为已读');
            }}
          >
            <CheckCheck size={14} />
            全部已读
          </Button>
        }
      />
      <PageTabs
        items={['全部消息', '面试提醒', '岗位动态', '学习提醒', '系统通知']}
        value={category}
        onChange={setCategory}
      />
      <div className="flex justify-between items-center mb-5">
        <p className="text-[10px] text-subtle">本机操作提醒与预置样本，不会发送邮件或外部推送。</p>
        <label className={s.selectAll}>
          <input
            type="checkbox"
            className={s.check}
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
          />
          只看未读
        </label>
      </div>
      {list.length ? (
        <div className={s.collection}>
          {list.map((n) => (
            <article
              key={n.id}
              className={`${s.notification} ${!read.includes(n.id) ? s.notificationUnread : ''}`}
            >
              <span className={s.notificationIcon}>
                <n.icon size={17} />
              </span>
              <div className="flex-1">
                <div className="flex items-start gap-3 justify-between">
                  <h3>{n.title}</h3>
                  <SmallTag>{n.category}</SmallTag>
                  <button
                    aria-label={`删除通知 ${n.title}`}
                    className="text-subtle hover:text-destructive"
                    onClick={() => {
                      if (n.id.startsWith('notice-local-')) removeNotification(n.id);
                      else setNote('notifications-hidden', JSON.stringify([...hidden, n.id]));
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p>{n.content}</p>
                <div className={s.notificationFoot}>
                  <Link
                    href={n.href}
                    onClick={() => mark([n.id])}
                    className="inline-flex items-center gap-1"
                  >
                    {n.action} <ArrowUpRight size={11} />
                  </Link>
                  <small>{n.date}</small>
                  {!read.includes(n.id) ? (
                    <button
                      onClick={() => mark([n.id])}
                      className="ml-auto text-[9px] text-subtle hover:text-primary"
                    >
                      标为已读
                    </button>
                  ) : (
                    <span className="ml-auto text-[9px] text-subtle flex items-center gap-1">
                      <Check size={10} />
                      已读
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          kind="notifications"
          title="重要的消息，都已经看过了"
          description="暂时没有新的演示提醒。去发现一个新机会，或者继续今天的学习。"
          action={
            <Button size="sm" variant="outline" onClick={() => setOnlyUnread(false)}>
              查看全部消息
            </Button>
          }
        />
      )}
      <div className="mt-6">
        <DemoNotice>已读状态保存在当前浏览器。提醒中的日期与安排均为演示数据。</DemoNotice>
      </div>
    </>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={s.switch}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
export function SettingsPage() {
  const store = useRadarStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(store.userName);
  const profile = parseSavedProfile(store.notes['onboarding-profile']);
  const [school, setSchool] = useState(profile.school || '');
  const [degree, setDegree] = useState(profile.degree || '本科');
  const [year, setYear] = useState(profile.year || '2027');
  const [role, setRole] = useState(profile.roles?.[0] || '前端开发');
  const [city, setCity] = useState(profile.cities?.[0] || '深圳');
  const [reset, setReset] = useState(false);
  const preferences = parseJson<Record<string, boolean>>(store.notes['account-preferences'], {
    deadline: true,
    interview: true,
    learning: false,
  });
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    setName(store.userName);
    const p = parseSavedProfile(store.notes['onboarding-profile']);
    setSchool(p.school || '');
    setDegree(p.degree || '本科');
    setYear(p.year || '2027');
    setRole(p.roles?.[0] || '前端开发');
    setCity(p.cities?.[0] || '深圳');
  }, [store.userName, store.notes['onboarding-profile']]);
  function save() {
    if (name.trim().length < 2) {
      toast.error('昵称至少需要 2 个字');
      return;
    }
    store.setProfile(name.trim());
    store.setNote(
      'onboarding-profile',
      JSON.stringify({ ...profile, school, degree, year, roles: [role], cities: [city] }),
    );
    toast.success('演示资料与求职偏好已保存');
  }
  return (
    <>
      <PageHeader title="账号设置" description="让这张校招地图，更贴合你的使用习惯。" />
      <div className={s.settingsLayout}>
        <nav className={s.settingsNav} aria-label="设置分区">
          {[
            ['profile', '个人资料', UserRound],
            ['appearance', '外观设置', Sun],
            ['preferences', '提醒偏好', Bell],
            ['privacy', '数据与隐私', ShieldCheck],
          ].map(([id, label, Icon]) => {
            const ItemIcon = Icon as typeof Sun;
            return (
              <a href={`#${id}`} key={String(id)}>
                <ItemIcon size={15} />
                {String(label)}
              </a>
            );
          })}
        </nav>
        <div>
          <section id="profile" className={s.settingsSection}>
            <Panel title="个人资料与求职偏好" description="仅用于本地演示，不会创建真实账号。">
              <div className={s.fieldGrid}>
                <label className={s.field}>
                  演示昵称
                  <Input
                    maxLength={20}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="你的演示昵称"
                  />
                </label>
                <label className={s.field}>
                  学校（选填）
                  <Input
                    maxLength={40}
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="例如：某某大学"
                  />
                </label>
                <label className={s.field}>
                  学历
                  <select
                    className={s.nativeSelect}
                    value={degree}
                    onChange={(e) => setDegree(e.target.value)}
                  >
                    {['本科', '硕士', '博士', '专科'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  毕业年份
                  <select
                    className={s.nativeSelect}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    {['2026', '2027', '2028'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  主要意向方向
                  <select
                    className={s.nativeSelect}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {['前端开发', '后端开发', '算法工程师', '产品经理'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  主要意向城市
                  <select
                    className={s.nativeSelect}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    {['深圳', '北京', '上海', '杭州', '广州', '成都'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Button className="mt-6" size="sm" onClick={save}>
                保存资料与偏好
              </Button>
            </Panel>
          </section>
          <section id="appearance" className={s.settingsSection}>
            <Panel title="外观设置" description="选择适合你此刻环境的界面，让准备更专注。">
              <div className={s.themeGrid}>
                {[
                  ['dark', '深色模式'],
                  ['light', '浅色模式'],
                  ['system', '跟随系统'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={s.themeChoice}
                    aria-pressed={mounted && theme === id}
                    onClick={() => {
                      setTheme(id);
                      toast.success(`已切换为${label}`);
                    }}
                  >
                    <div
                      className={`${s.themePreview} ${id === 'light' ? s.themeLight : id === 'system' ? s.themeAuto : ''}`}
                    >
                      <i />
                      <span>
                        <b />
                        <b />
                        <b />
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      {label}
                      {mounted && theme === id && <Check size={12} className="text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          </section>
          <section id="preferences" className={s.settingsSection}>
            <Panel
              title="提醒偏好"
              description="这里是本地偏好演示，当前不会发送邮件、短信或系统推送。"
            >
              {[
                ['deadline', '岗位截止提醒', '为收藏的岗位保留截止提醒偏好。'],
                ['interview', '面试日程提醒', '记录你希望接收面试安排提醒的偏好。'],
                ['learning', '学习节奏提醒', '为每天的一点进步，留一个温柔的提醒。'],
              ].map(([key, title, desc]) => (
                <div key={key} className={s.settingRow}>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                  <Toggle
                    label={title}
                    checked={!!preferences[key]}
                    onChange={() => {
                      store.setNote(
                        'account-preferences',
                        JSON.stringify({ ...preferences, [key]: !preferences[key] }),
                      );
                      toast.success('本地提醒偏好已保存');
                    }}
                  />
                </div>
              ))}
            </Panel>
          </section>
          <section id="privacy" className={s.settingsSection}>
            <Panel title="数据与隐私">
              <div className={s.privacy}>
                <ShieldCheck size={18} />
                <div>
                  <b className="text-foreground font-medium">你正在使用本地产品演示</b>
                  <br />
                  演示口令不会存储或传输。收藏、投递记录、笔记与资料保存在当前浏览器；上传的简历与录音也只在本机处理。不会对外投递申请，请勿在演示登录中填写真实密码。
                </div>
              </div>
              <LocalDataTools />
              <div className={s.settingRow}>
                <div>
                  <h3>重置演示数据</h3>
                  <p>清除收藏、笔记和个人资料，恢复初始投递样本。</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/20"
                  onClick={() => setReset(true)}
                >
                  <Trash2 size={13} />
                  重置
                </Button>
              </div>
            </Panel>
          </section>
          <p className="text-[10px] text-subtle text-center py-3">
            Campus Radar v1.0 · 用清晰陪伴每一段校招旅程
          </p>
        </div>
      </div>
      <Dialog open={reset} onOpenChange={setReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新开始这次演示？</DialogTitle>
            <DialogDescription>
              你的本地收藏、学习笔记、讨论与个人资料将被清除，投递记录恢复为初始样本。建议先导出数据备份。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReset(false)}>
              保留数据
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await clearInterviewFiles();
                  store.reset();
                  setReset(false);
                  window.location.reload();
                } catch {
                  toast.error('文件库清理失败，尚未重置。请关闭其他标签后重试。');
                }
              }}
            >
              确认重置演示
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

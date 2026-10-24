'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Table2,
  MapPin,
  Clock,
  ChevronDown,
  Check,
  X,
  Plus,
  Radar,
  Bell,
  Flame,
  Sparkles,
  RefreshCw,
  CheckCheck,
  CalendarDays,
  Bookmark,
  Loader2,
  Signal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from '@/components/ui/select';
import {
  PageHeader,
  Panel,
  CompanyLogo,
  MatchRing,
  SmallTag,
  FavoriteButton,
  DemoNotice,
  EmptyState,
  ProgressBar,
  SectionLink,
} from '@/components/shared';
import { jobs, companies, getCompany, type Job } from '@/lib/data';
import { filterJobs, deadlineDays } from '@/lib/domain';
import { useRadarStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import styles from './jobs.module.css';
import { matchJob, filterJobYear, postedOrder, PROFILE_YEARS } from '@/lib/local-matching';
import { useLocalJobProfile } from '@/lib/use-local-job-profile';
import { useLocalState } from '@/lib/use-local-state';
import type { CalendarEvent } from '@/lib/calendar-domain';
export function JobCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  const { favorites, toggleFavorite, addApplication } = useRadarStore();
  const pathname = usePathname();
  const params = useSearchParams();
  const nextPreview = new URLSearchParams(params.toString());
  nextPreview.set('preview', `job:${job.id}`);
  const previewHref = `${pathname}?${nextPreview}`;
  const days = deadlineDays(job.deadline);
  const profile = useLocalJobProfile();
  const matching = matchJob(job, profile);
  return (
    <article className={styles.jobCard}>
      <div className={styles.jobTop}>
        <Link href={`/company/${job.companyId}`}>
          <CompanyLogo companyId={job.companyId} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={previewHref} className={styles.jobTitle}>
            {job.title}
          </Link>
          <div className={styles.jobMeta}>
            <Link href={`/company/${job.companyId}`} className="text-foreground hover:text-primary">
              {getCompany(job.companyId).name}
            </Link>
            <i />
            <span>{job.department}</span>
          </div>
          <div className={styles.jobMeta}>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {job.city}
            </span>
            <i />
            <span>{job.education}及以上</span>
            <i />
            <span>{job.requirements.join(' ').match(/20\d{2}\s*届/)?.[0] || '届别未明确'}</span>
          </div>
          <p className={styles.salary}>{job.salary}</p>
        </div>
        <div className={styles.match}>
          {matching.score === null ? (
            <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-subtle">
              未计算
            </span>
          ) : (
            <MatchRing value={matching.score} />
          )}
          <small>{matching.score === null ? '待完善画像' : '本机规则匹配'}</small>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {job.tags.map((tag) => (
          <SmallTag key={tag}>{tag}</SmallTag>
        ))}
        {matching.matched.length > 0 && (
          <span
            className={cn(
              'ml-auto text-[9px] inline-flex items-center gap-1',
              days !== null && days <= 3 ? 'text-warning' : 'text-status-offer',
            )}
          >
            <Sparkles className="size-2.5" />
            {matching.matched.slice(0, 2).join('、')} 有交集
          </span>
        )}
      </div>
      <div className={styles.cardBottom}>
        <span
          className={cn(
            'flex items-center gap-1 text-[9px]',
            days !== null && days <= 5 ? 'text-warning' : 'text-subtle',
          )}
        >
          <Clock className="size-3" />
          {days === null ? '持续招聘' : days < 0 ? '已截止' : `${days} 天后截止`}
          <span className="text-subtle ml-2 hidden sm:inline">· {job.posted}更新</span>
        </span>
        <div className="flex items-center gap-1">
          <FavoriteButton
            active={favorites.includes(`job:${job.id}`)}
            onClick={() => toggleFavorite('job', job.id)}
          />
          <Button variant="ghost" size="sm" onClick={() => addApplication(job.id)}>
            <Plus />
            加入投递
          </Button>
        </div>
      </div>
    </article>
  );
}
export default function JobsPage() {
  const params = useSearchParams(),
    router = useRouter();
  const [view, setView] = useState(params.get('view') ?? 'list'),
    [tab, setTab] = useState('全部岗位'),
    [visible, setVisible] = useState(6),
    [loading, setLoading] = useState(false),
    [mobileFilter, setMobileFilter] = useState(false);
  useEffect(() => setView(params.get('view') ?? 'list'), [params.get('view')]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { favorites, applications } = useRadarStore();
  const profile = useLocalJobProfile();
  const [events] = useLocalState<CalendarEvent[]>('events', []);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayEvents = events
    .filter((event) => event.date === today && !event.completed)
    .sort((a, b) => a.time.localeCompare(b.time));
  const { data } = useQuery({
    queryKey: ['demo-jobs'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return jobs;
    },
    initialData: jobs,
  });
  const filters = {
    q: params.get('q') ?? '',
    city: params.get('city') ?? '',
    role: params.get('role') ?? '',
    education: params.get('education') ?? '',
    type: params.get('type') ?? '',
    company: params.get('company') ?? '',
    year: params.get('year') ?? '',
    sort: params.get('sort') ?? (tab === '为我推荐' ? 'match' : 'newest'),
  };
  const scoredJobs = useMemo(
    () => data.map((job) => ({ ...job, match: matchJob(job, profile).score ?? 0 })),
    [data, profile],
  );
  const filtered = useMemo(() => {
    const result = filterJobs(scoredJobs, filters).filter(
      (job) =>
        filterJobYear(job, filters.year) &&
        (tab !== '我的收藏' || favorites.includes(`job:${job.id}`)),
    );
    return filters.sort === 'newest'
      ? result.sort((a, b) => postedOrder(a.posted) - postedOrder(b.posted))
      : result;
  }, [scoredJobs, params.toString(), tab, favorites]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== '不限') next.set(key, value);
    else next.delete(key);
    next.delete('preview');
    setVisible(6);
    router.replace(`/jobs${next.size ? '?' + next : ''}`, { scroll: false });
  };
  const reset = () => {
    setVisible(6);
    setTab('全部岗位');
    router.replace('/jobs', { scroll: false });
  };
  const loadMore = () => {
    if (loading || visible >= filtered.length) return;
    setLoading(true);
    setTimeout(() => {
      setVisible((v) => v + 6);
      setLoading(false);
    }, 450);
  };
  useEffect(() => {
    const current = sentinel.current;
    if (!current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '100px' },
    );
    observer.observe(current);
    return () => observer.disconnect();
  }, [visible, filtered.length, loading]);
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== 'sort' && k !== 'q');
  const FilterContent = () => (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex gap-2 items-center">
          <SlidersHorizontal className="size-3.5" />
          筛选条件
        </span>
        <button className="text-[10px] text-subtle hover:text-primary" onClick={reset}>
          重置
        </button>
      </div>
      {[
        { label: '招聘类型', key: 'type', options: ['不限', '秋招', '实习'] },
        {
          label: '工作城市',
          key: 'city',
          options: ['不限', '北京', '上海', '深圳', '杭州', '广州'],
        },
        {
          label: '岗位方向',
          key: 'role',
          options: ['不限', '前端开发', '后端开发', '算法工程师', '产品经理', '设计师', '数据分析'],
        },
        { label: '学历要求', key: 'education', options: ['不限', '本科', '硕士'] },
        { label: '毕业届别', key: 'year', options: ['不限', ...PROFILE_YEARS] },
      ].map((group) => (
        <div key={group.key} className={styles.filterGroup}>
          <h3 className={styles.filterTitle}>
            {group.label}
            <ChevronDown className="size-3 text-subtle" />
          </h3>
          <div className={styles.filterOptions}>
            {group.options.map((option) => (
              <button
                key={option}
                className={cn(
                  styles.filterOption,
                  (filters[group.key as keyof typeof filters] || '不限') === option &&
                    styles.active,
                )}
                onClick={() => update(group.key, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className={styles.filterGroup}>
        <h3 className={styles.filterTitle}>
          心仪公司
          <ChevronDown className="size-3 text-subtle" />
        </h3>
        {companies.map((company) => (
          <button
            key={company.id}
            className={styles.companyFilter}
            onClick={() => update('company', filters.company === company.id ? '' : company.id)}
          >
            <span className={cn('check-box', filters.company === company.id && 'checked')}>
              {filters.company === company.id && <Check className="size-3" />}
            </span>
            {company.name}
            <span>{jobs.filter((j) => j.companyId === company.id).length}</span>
          </button>
        ))}
      </div>
    </>
  );
  return (
    <>
      <PageHeader
        title="岗位广场"
        description="把每一份努力，投向更适合你的机会。"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/subscriptions">
              <Bell />
              订阅岗位
            </Link>
          </Button>
        }
      />
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>为你发现的机会</p>
          <strong className={styles.summaryNumber}>
            {jobs.length}
            <small>个岗位</small>
          </strong>
          <p className={styles.summaryNote}>
            <ArrowUpRight className="size-3" />
            覆盖 6 个岗位方向
          </p>
        </div>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>与你高度匹配</p>
          <strong className={styles.summaryNumber}>
            {scoredJobs.filter((j) => j.match >= 80).length}
            <small>个岗位</small>
          </strong>
          <p className={styles.summaryNote}>本机规则匹配 ≥ 80% · 可完善画像</p>
        </div>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>优质企业</p>
          <strong className={styles.summaryNumber}>
            {companies.length}
            <small>家企业</small>
          </strong>
          <p className={styles.summaryNote}>探索不同的可能</p>
        </div>
        <div className={styles.season}>
          <div>
            <strong>2027 秋招进行时</strong>
            <p>保持探索，好机会正在靠近。</p>
          </div>
          <div className={styles.miniRadar}>
            <Radar className="size-7" />
          </div>
        </div>
      </div>
      <div className={styles.layout}>
        <aside>
          <div className={styles.filters}>
            <FilterContent />
          </div>
          <p className={styles.filterBottom}>
            选择适合你的方向
            <br />
            让每一次投递更有把握
          </p>
        </aside>
        <section className="min-w-0">
          <div className={styles.searchbar}>
            <Search className="size-4 text-subtle" />
            <input
              aria-label="搜索岗位或公司"
              placeholder="搜索职位、公司或技能关键词"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
            />
            {filters.q && (
              <button aria-label="清空搜索" onClick={() => update('q', '')}>
                <X className="size-3.5 text-subtle" />
              </button>
            )}
            <Button size="sm" onClick={() => update('q', filters.q)}>
              搜索
            </Button>
          </div>
          <div className={styles.toolbar}>
            <div className="flex items-center gap-4">
              {['全部岗位', '为我推荐', '我的收藏'].map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setTab(item);
                    setVisible(6);
                  }}
                  className={cn(
                    'text-[11px] relative py-1',
                    tab === item ? 'text-primary font-medium' : 'text-muted-foreground',
                  )}
                >
                  {item}
                  {item === '为我推荐' && <span className="text-[7px] ml-1 text-purple">规则</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                className={cn('size-8', styles.mobileFilter)}
                size="icon"
                variant="outline"
                aria-label="打开筛选"
                onClick={() => setMobileFilter(true)}
              >
                <SlidersHorizontal />
              </Button>
              <div className={styles.viewButtons}>
                {[
                  { key: 'list', icon: List, label: '列表视图' },
                  { key: 'card', icon: LayoutGrid, label: '卡片视图' },
                  { key: 'table', icon: Table2, label: '表格视图' },
                ].map((v) => (
                  <button
                    key={v.key}
                    aria-label={v.label}
                    aria-pressed={view === v.key}
                    onClick={() => {
                      setView(v.key);
                      update('view', v.key);
                    }}
                    className={cn(view === v.key && styles.active)}
                  >
                    <v.icon className="size-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-subtle mb-4">
            <span>
              共 <strong className="text-foreground font-mono">{filtered.length}</strong>{' '}
              个符合条件的岗位
            </span>
            <Select value={filters.sort} onValueChange={(value) => update('sort', value)}>
              <SelectTrigger
                className="border-0 bg-transparent w-auto h-6 p-0 text-[10px] text-muted-foreground"
                aria-label="排序方式"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="newest">最新发布</SelectItem>
                  <SelectItem value="match">匹配度优先</SelectItem>
                  <SelectItem value="deadline">即将截止</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {activeFilters.length > 0 && (
            <div className={styles.activeFilters}>
              {activeFilters.map(([key, value]) => (
                <button className="filter-chip" key={key} onClick={() => update(key, '')}>
                  {key === 'company' ? getCompany(value).name : value}
                  <X className="size-2.5" />
                </button>
              ))}
            </div>
          )}
          {params.get('state') === 'error' ? (
            <EmptyState
              kind="jobs"
              title="岗位信号暂时中断"
              description="演示错误状态：请重试，筛选条件会保留。"
              action={<Button onClick={() => update('state', '')}>重新加载</Button>}
            />
          ) : filtered.length === 0 ? (
            <Panel>
              <EmptyState
                kind="jobs"
                title="还没有探测到匹配的岗位"
                description="试试放宽城市或方向条件，让更多机会进入雷达。"
                action={
                  <Button variant="outline" onClick={reset}>
                    清空筛选
                  </Button>
                }
              />
            </Panel>
          ) : view === 'table' ? (
            <div className="overflow-x-auto panel">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>职位 / 公司</th>
                    <th>城市</th>
                    <th>薪资</th>
                    <th>匹配度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link
                          href={`/jobs?${new URLSearchParams({ ...Object.fromEntries(params.entries()), preview: `job:${job.id}` })}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {job.title}
                        </Link>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {getCompany(job.companyId).name}
                        </p>
                      </td>
                      <td>{job.city}</td>
                      <td className="text-primary whitespace-nowrap">{job.salary}</td>
                      <td>
                        {matchJob(job, profile).score === null ? (
                          <span className="text-xs text-subtle">待完善画像</span>
                        ) : (
                          <MatchRing value={job.match} size={34} />
                        )}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="加入投递"
                          onClick={() => useRadarStore.getState().addApplication(job.id)}
                        >
                          <Plus />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cn(styles.jobList, view === 'card' && styles.cardsGrid)}>
              {filtered.slice(0, visible).map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
          {loading && (
            <div className="grid gap-3 mt-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          <div ref={sentinel} className="flex justify-center py-6">
            {visible < filtered.length ? (
              <Button variant="ghost" size="sm" disabled={loading} onClick={loadMore}>
                {loading ? <Loader2 className="animate-spin" /> : <Plus />}加载更多岗位
              </Button>
            ) : (
              filtered.length > 0 && (
                <p className="text-[10px] text-subtle flex gap-1 items-center">
                  <CheckCheck className="size-3" />
                  你已查看全部机会，新的信号会在这里出现
                </p>
              )
            )}
          </div>
          <DemoNotice />
        </section>
        <aside className={styles.sidebar}>
          <Panel title="我的求职进度" action={<SectionLink href="/pipeline">看板</SectionLink>}>
            <div className="flex items-end gap-1 mb-3">
              <strong className="font-display text-3xl">
                {applications.filter((a) => !a.archived).length}
              </strong>
              <span className="text-[10px] text-subtle pb-1 ml-1">份投递正在追踪</span>
            </div>
            <ProgressBar
              value={
                (applications.filter((a) => !a.archived && a.stage !== 'PENDING').length /
                  Math.max(1, applications.filter((a) => !a.archived).length)) *
                100
              }
            />
            <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
              <span>
                {
                  applications.filter((a) => a.stage.includes('INTERVIEW') || a.stage === 'HR')
                    .length
                }{' '}
                场面试进行中
              </span>
              <span className="text-status-offer">
                {applications.filter((a) => a.stage === 'OFFER').length} 份 Offer
              </span>
            </div>
          </Panel>
          <Panel title="今日待办" action={<SectionLink href="/calendar">全部</SectionLink>}>
            {todayEvents.length ? (
              todayEvents.slice(0, 3).map((event) => (
                <Link
                  key={event.id}
                  href={
                    event.applicationId ? `/interview/${event.applicationId}/timeline` : '/calendar'
                  }
                  className={styles.taskItem}
                >
                  <span className={styles.taskTime}>{event.time}</span>
                  <div className={styles.taskBody}>
                    <strong>{event.title}</strong>
                    <p>
                      {event.type} · {event.duration}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-xs leading-7 text-subtle">
                今天还没有未完成的本机日程。可在日历中安排下一次练习。
              </p>
            )}
          </Panel>
          <Panel title="本周热门公司" action={<Flame className="size-3.5 text-warning" />}>
            {companies.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/company/${c.id}`} className={styles.companyRow}>
                <CompanyLogo companyId={c.id} size="sm" />
                <div>
                  <strong>{c.name}</strong>
                  <small>{c.industry}</small>
                </div>
                <span>
                  {jobs.filter((j) => j.companyId === c.id).length} 岗位
                  <ChevronDown className="inline size-2.5 -rotate-90 ml-1" />
                </span>
              </Link>
            ))}
          </Panel>
          <div className={styles.aiCard}>
            <Sparkles className="size-5 text-purple mb-3" />
            <h3>
              下一场面试，
              <br />
              让准备更有方向。
            </h3>
            <p>
              本地规则练习，使用实际题库，
              <br />
              发现可以更进一步的地方。
            </p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/mock">
                开始模拟面试
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </aside>
      </div>
      <Sheet open={mobileFilter} onOpenChange={setMobileFilter}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetTitle>筛选岗位</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            按城市、方向和公司缩小范围
          </SheetDescription>
          <div>
            <FilterContent />
          </div>
          <Button onClick={() => setMobileFilter(false)}>查看 {filtered.length} 个结果</Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

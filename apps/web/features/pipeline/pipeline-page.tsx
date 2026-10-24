'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  GripVertical,
  Plus,
  Columns3,
  List,
  Building2,
  Search,
  ChevronDown,
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Clock,
  MessageSquare,
  BriefcaseBusiness,
  CheckCheck,
  Trophy,
  Undo2,
  Archive,
  Info,
  Filter,
  Save,
  RotateCcw,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import {
  PageHeader,
  StatCard,
  CompanyLogo,
  SmallTag,
  DemoNotice,
  EmptyState,
  Panel,
} from '@/components/shared';
import { useRadarStore } from '@/lib/store';
import {
  jobs,
  companies,
  stages,
  getJob,
  getCompany,
  type Application,
  type Stage,
} from '@/lib/data';
import { cn } from '@/lib/utils';
import styles from './pipeline.module.css';
import { useInterviewLocal } from '@/lib/interview-repository';
import { isResumeLibrary, type ResumeVersion } from '@/lib/resume-files';
// A pointer drop belongs to the column under the pointer. Corner distance can
// otherwise prefer a nearby short card over a tall, mostly empty target column.
const boardCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return closestCorners(args);
  const cards = hits.filter((hit) => !String(hit.id).startsWith('column-'));
  return cards.length ? cards : hits;
};
function stageColor(stage: Stage) {
  return stage === 'OFFER'
    ? 'text-status-offer'
    : stage === 'CLOSED'
      ? 'text-status-closed'
      : stage.startsWith('INTERVIEW') || stage === 'HR'
        ? 'text-status-interview'
        : stage === 'PENDING'
          ? 'text-subtle'
          : 'text-status-applied';
}
function ApplicationCard({
  application,
  onOpen,
}: {
  application: Application;
  onOpen: (id: string) => void;
}) {
  const job = getJob(application.jobId);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: application.id,
    data: { stage: application.stage, companyId: job?.companyId },
  });
  const move = useRadarStore((s) => s.moveApplication);
  if (!job) return null;
  return (
    <article
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={styles.application}
    >
      <div className="flex gap-2.5 items-center">
        <CompanyLogo companyId={job.companyId} size="sm" />
        <div>
          <p className="text-[11px] font-medium">{getCompany(job.companyId).name}</p>
          <small>
            {job.city} · {job.type}
          </small>
        </div>
      </div>
      <button
        ref={setActivatorNodeRef}
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label={`拖动 ${getCompany(job.companyId).name} ${job.title}`}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button className="text-left hover:text-primary" onClick={() => onOpen(application.id)}>
        <h3>{job.title}</h3>
      </button>
      <p className={styles.note}>{application.notes || '添加一条笔记，记录下一步计划。'}</p>
      <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
        <span className="text-[9px] text-subtle flex gap-1 items-center">
          <Clock className="size-2.5" />
          {application.date}
        </span>
        <select
          aria-label={`移动 ${job.title} 的阶段`}
          value={application.stage}
          onChange={(e) => move(application.id, e.target.value as Stage)}
          className="ml-auto max-w-[65px] rounded bg-transparent text-[9px] text-muted-foreground outline-none cursor-pointer"
        >
          {stages.map((s) => (
            <option value={s.id} key={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
function Column({
  stage,
  items,
  onOpen,
  companyId,
}: {
  stage: (typeof stages)[number];
  items: Application[];
  onOpen: (id: string) => void;
  companyId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${stage.id}-${companyId ?? 'all'}`,
    data: { stage: stage.id, companyId },
  });
  return (
    <div
      ref={setNodeRef}
      data-stage={stage.id}
      className={cn(styles.column, isOver && styles.columnOver)}
    >
      <div className={styles.columnHeader}>
        <span className={cn('size-1.5 rounded-full bg-current', stageColor(stage.id))} />
        {stage.label}
        <span>{items.length}</span>
        <Plus className="size-3 ml-auto text-subtle" aria-hidden />
      </div>
      <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        {items.map((a) => (
          <ApplicationCard key={a.id} application={a} onOpen={onOpen} />
        ))}
      </SortableContext>
      {items.length === 0 && <div className={styles.emptyColumn}>拖动卡片至此阶段</div>}
    </div>
  );
}
export default function PipelinePage() {
  const {
    applications,
    moveApplication,
    undoMove,
    lastMove,
    updateApplication,
    addApplication,
    reorderApplication,
    removeApplication,
  } = useRadarStore();
  const resumes = useInterviewLocal<ResumeVersion[]>(
    'resume-library-v2',
    [],
    isResumeLibrary,
  ).value;
  const [noteVersion, setNoteVersion] = useState(0);
  const [noteConflict, setNoteConflict] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mode, setMode] = useState('board'),
    [company, setCompany] = useState('all'),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [newOpen, setNewOpen] = useState(false),
    [selectedJob, setSelectedJob] = useState('job-1'),
    [selected, setSelected] = useState<string | null>(null),
    [note, setNote] = useState(''),
    [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const current = applications.find((a) => a.id === selected);
  useEffect(() => {
    setNote(current?.notes ?? '');
    setNoteVersion(current?.version ?? 0);
    setNoteConflict(false);
  }, [selected]);
  const active = applications.filter((a) => !a.archived),
    display = applications
      .filter((a) => !!a.archived === archived)
      .filter((a) => {
        const job = getJob(a.jobId);
        return (
          job &&
          (company === 'all' || job.companyId === company) &&
          (!query || (job.title + getCompany(job.companyId).name).includes(query))
        );
      });
  const drag = applications.find((a) => a.id === dragId);
  const onDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    if (!event.over) return;
    const item = applications.find((a) => a.id === String(event.active.id));
    if (!item) return;
    const target = event.over.data.current;
    const job = getJob(item.jobId);
    if (mode === 'company' && target?.companyId && target.companyId !== job?.companyId) {
      toast.info('请在同一家公司的泳道内移动');
      return;
    }
    const stage = target?.stage as Stage | undefined;
    if (!stage) return;
    if (item.stage === stage && String(event.over.id) !== item.id) {
      const from = applications.findIndex((a) => a.id === item.id),
        to = applications.findIndex((a) => a.id === String(event.over!.id));
      if (to >= 0) {
        reorderApplication(item.id, String(event.over!.id));
        toast.success('卡片顺序已更新');
      }
    } else moveApplication(item.id, stage);
  };
  const open = (id: string) => setSelected(id);
  const renderBoard = (items: Application[], companyId?: string) => (
    <div className={styles.board} data-swimlane={companyId || undefined}>
      {stages.map((stage) => (
        <Column
          key={stage.id}
          stage={stage}
          items={items.filter((a) => a.stage === stage.id)}
          onOpen={open}
          companyId={companyId}
        />
      ))}
    </div>
  );
  return (
    <>
      <PageHeader
        title="投递看板"
        description="每一份投递都有迹可循，每一次进步都值得记录。"
        action={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/calendar">
                <CalendarDays />
                <span className="hidden sm:inline">面试日程</span>
              </Link>
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus />
              添加投递
            </Button>
          </>
        }
      />
      <div className="stat-grid">
        <StatCard
          label="正在追踪"
          value={active.length}
          icon={BriefcaseBusiness}
          detail="记录每一次主动出发"
        />
        <StatCard
          label="面试进行中"
          value={
            active.filter((a) => ['INTERVIEW_1', 'INTERVIEW_2', 'HR'].includes(a.stage)).length
          }
          icon={MessageSquare}
          change="继续向前"
        />
        <StatCard
          label="已收获 Offer"
          value={active.filter((a) => a.stage === 'OFFER').length}
          icon={Trophy}
          detail="每一份认可都值得庆祝"
        />
        <StatCard
          label="待投递岗位"
          value={active.filter((a) => a.stage === 'PENDING').length}
          icon={Clock}
          detail="准备好后再从容投递"
        />
      </div>
      <div className={styles.toolbar}>
        <div className="flex rounded-lg border border-border bg-surface p-1 gap-1">
          {[
            { id: 'board', label: '看板', icon: Columns3 },
            { id: 'list', label: '列表', icon: List },
            { id: 'company', label: '公司泳道', icon: Building2 },
          ].map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={mode === v.id ? 'secondary' : 'ghost'}
              onClick={() => setMode(v.id)}
            >
              <v.icon />
              {v.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative min-w-0">
            <Search className="size-3 absolute top-3 left-3 text-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索岗位或公司"
              aria-label="搜索投递"
              className="h-8 pl-8 w-32 xl:w-40 text-xs"
            />
          </div>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="h-8 w-28 text-[11px]" aria-label="按公司筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部公司</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant={archived ? 'secondary' : 'outline'}
            size="icon"
            className="size-8"
            aria-label={archived ? '返回活跃投递' : '查看归档'}
            onClick={() => setArchived(!archived)}
          >
            <Archive />
          </Button>
          {lastMove && (
            <Button
              size="icon"
              className="size-8"
              variant="outline"
              aria-label="撤销最近移动"
              onClick={undoMove}
            >
              <Undo2 />
            </Button>
          )}
        </div>
      </div>
      <div className={styles.tip}>
        <Info className="size-3" />
        {archived
          ? '正在查看已归档投递，可在详情中恢复。'
          : '拖动卡片更新进度，或使用卡片右下角菜单。点击岗位名称记录面试与笔记。'}
      </div>
      {display.length === 0 ? (
        <Panel>
          <EmptyState
            kind="pipeline"
            title={archived ? '归档箱还是空的' : '你的下一段旅程，从这里开始'}
            description={
              archived
                ? '完成的投递可以归档保留，随时回来查看。'
                : '先挑一个心仪岗位，加入待投清单。'
            }
            action={
              <Button asChild>
                <Link href="/jobs">
                  去发现机会
                  <ArrowUpRight />
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : mode === 'list' ? (
        <div className={styles.list}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>公司 / 岗位</th>
                  <th>阶段</th>
                  <th>投递日期</th>
                  <th>我的笔记</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {display.map((a) => {
                  const job = getJob(a.jobId)!;
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="flex gap-3 items-center">
                          <CompanyLogo companyId={job.companyId} size="sm" />
                          <div>
                            <button
                              className="font-medium hover:text-primary"
                              onClick={() => open(a.id)}
                            >
                              {job.title}
                            </button>
                            <p className="text-[10px] text-subtle mt-1">
                              {getCompany(job.companyId).name} · {job.city}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={stageColor(a.stage)}>
                          {stages.find((s) => s.id === a.stage)?.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">{a.date}</td>
                      <td className="max-w-[250px] truncate text-muted-foreground">{a.notes}</td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => open(a.id)}>
                          详情
                          <ArrowUpRight />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <DndContext
          id="campus-pipeline"
          sensors={sensors}
          collisionDetection={boardCollision}
          onDragStart={(event: DragStartEvent) => setDragId(String(event.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragId(null)}
        >
          {mode === 'company'
            ? companies
                .filter((c) => display.some((a) => getJob(a.jobId)?.companyId === c.id))
                .map((c) => (
                  <section key={c.id} className={styles.swimlane}>
                    <div className={styles.swimlaneTitle}>
                      <CompanyLogo companyId={c.id} size="sm" />
                      {c.name}
                      <span>
                        {display.filter((a) => getJob(a.jobId)?.companyId === c.id).length}份投递
                      </span>
                    </div>
                    {renderBoard(
                      display.filter((a) => getJob(a.jobId)?.companyId === c.id),
                      c.id,
                    )}
                  </section>
                ))
            : renderBoard(display)}
          <DragOverlay>
            {drag && (
              <div className={styles.dragOverlay}>
                <strong className="text-xs">
                  {getCompany(getJob(drag.jobId)!.companyId).name}
                </strong>
                <p className="mt-3 text-sm">{getJob(drag.jobId)?.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <div className="flex items-center justify-between gap-3 mt-5">
        <DemoNotice />
        <Link href="/analytics" className="section-link hidden sm:flex">
          看看投递的趋势
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加一份新投递</DialogTitle>
            <DialogDescription>先加入待投清单；实际投递需要你在企业官网完成。</DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-xs text-muted-foreground">
            选择岗位
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {getCompany(j.companyId).name} · {j.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                addApplication(selectedJob);
                setNewOpen(false);
              }}
            >
              加入待投递
              <Plus />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>投递详情</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              阶段与笔记保存在本机演示记录中
            </SheetDescription>
          </SheetHeader>
          {current &&
            (() => {
              const job = getJob(current.jobId)!;
              return (
                <>
                  <div className="flex gap-3 items-center mt-4">
                    <CompanyLogo companyId={job.companyId} size="lg" />
                    <div>
                      <h2 className="text-lg font-semibold">{job.title}</h2>
                      <p className="text-xs text-muted-foreground mt-2">
                        {getCompany(job.companyId).name} · {job.city}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 my-4">
                    <div>
                      <label className="form-label">当前阶段</label>
                      <Select
                        value={current.stage}
                        onValueChange={(v) => moveApplication(current.id, v as Stage)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="grid gap-2 text-xs text-muted-foreground">
                      记录日期
                      <Input
                        type="date"
                        value={
                          /^\d{4}-\d{2}-\d{2}$/.test(current.date)
                            ? current.date
                            : `2026-${current.date
                                .replace('月', '-')
                                .replace('日', '')
                                .split('-')
                                .map((value) => value.padStart(2, '0'))
                                .join('-')}`
                        }
                        onChange={(event) => {
                          if (event.target.value)
                            updateApplication(current.id, { date: event.target.value });
                        }}
                      />
                    </label>
                  </div>
                  <label className="grid gap-2 text-xs text-muted-foreground mb-5">
                    投递使用的简历
                    <select
                      aria-label="投递使用的简历"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={current.resumeId ?? ''}
                      onChange={(event) =>
                        updateApplication(current.id, { resumeId: event.target.value || undefined })
                      }
                    >
                      <option value="">未指定简历版本</option>
                      {resumes.map((resume) => (
                        <option key={resume.id} value={resume.id}>
                          {resume.name} · v{resume.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!resumes.length && (
                    <Link href="/resumes" className="text-xs text-primary mb-5 inline-block">
                      上传一份简历后可关联到本次投递 →
                    </Link>
                  )}
                  <div>
                    <label className="form-label" htmlFor="application-note">
                      我的笔记与下一步计划
                    </label>
                    <Textarea
                      id="application-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={6}
                      maxLength={50000}
                      placeholder="记录面试要点、提醒自己下一步做什么…"
                    />
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={() => {
                        if (!updateApplication(current.id, { notes: note }, noteVersion)) {
                          setNoteConflict(true);
                          return;
                        }
                        setNoteVersion(noteVersion + 1);
                        setNoteConflict(false);
                        toast.success('笔记已保存到本机');
                      }}
                    >
                      <Save />
                      保存笔记
                    </Button>
                    {noteConflict && (
                      <div
                        role="alert"
                        className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm"
                      >
                        <p>记录已更新。你的草稿仍保留，请先载入最新笔记再编辑。</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setNote(current.notes ?? '');
                            setNoteVersion(current.version);
                            setNoteConflict(false);
                          }}
                        >
                          载入最新笔记
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-6 mt-4 grid gap-3">
                    <Button variant="outline" asChild>
                      <Link href={`/calendar?new=1&application=${current.id}`}>
                        <CalendarDays />
                        安排面试日程
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/interview/${current.id}/timeline`}>
                        查看面试时间线
                        <ArrowUpRight />
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/interview/${current.id}/review`}>
                        打开面试复盘
                        <ArrowUpRight />
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link href={`/jobs/${job.id}`}>
                        查看原岗位
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  </div>
                  <section className="border-t border-border pt-5 mt-5">
                    <h3 className="text-sm font-medium mb-3">阶段变更记录</h3>
                    {current.history?.length ? (
                      <ol className="space-y-3">
                        {[...current.history]
                          .reverse()
                          .slice(0, 20)
                          .map((event) => (
                            <li key={event.id} className="text-xs text-muted-foreground">
                              <p>
                                {stages.find((stage) => stage.id === event.from)?.label} →{' '}
                                <span className="text-foreground">
                                  {stages.find((stage) => stage.id === event.to)?.label}
                                </span>
                              </p>
                              <time className="text-[10px] text-subtle">
                                {new Date(event.at).toLocaleString('zh-CN', {
                                  timeZone: 'Asia/Shanghai',
                                })}
                              </time>
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        调整阶段后会记录实际变化时间；初始样本不伪造操作历史。
                      </p>
                    )}
                  </section>
                  <Button
                    variant="outline"
                    className="mt-auto"
                    onClick={() => {
                      updateApplication(current.id, { archived: !current.archived });
                      setSelected(null);
                      toast.success(
                        current.archived ? '已恢复到活跃投递' : '已归档，可在归档箱中恢复',
                      );
                    }}
                  >
                    {current.archived ? <RotateCcw /> : <Archive />}
                    {current.archived ? '恢复投递' : '归档这份投递'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 />
                    删除投递记录
                  </Button>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这份投递记录？</DialogTitle>
            <DialogDescription>
              记录将从本机看板和统计中移除，岗位收藏与已上传简历仍保留。此操作不会撤回企业官网的申请。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              保留记录
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (current) removeApplication(current.id);
                setDeleteOpen(false);
                setSelected(null);
                toast.success('投递记录已删除');
              }}
            >
              确认删除投递
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

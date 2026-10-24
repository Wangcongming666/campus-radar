'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { scheduleConflictIds } from '@/lib/schedule';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  CalendarDays,
  Video,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Download,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import {
  PageHeader,
  Panel,
  DemoNotice,
  SmallTag,
  CompanyLogo,
  PageTabs,
  EmptyState,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { companies, getCompany, getJob } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import {
  calendarIcs,
  validateCalendarEvent,
  isCalendarEvents,
  type CalendarEvent,
} from '@/lib/calendar-domain';
import { downloadLocalFile } from '@/lib/local-workspace';
import { toast } from 'sonner';
import { Modal, Field, Pick, useLocal } from './common';
type Event = CalendarEvent;
const initial: Event[] = [
  {
    id: 1,
    date: '2026-10-23',
    time: '14:00',
    title: '腾讯 WXG · 前端二面',
    companyId: 'tencent',
    type: '面试',
    duration: '60 分钟',
  },
  {
    id: 2,
    date: '2026-10-24',
    time: '10:00',
    title: '字节跳动 · 技术一面',
    companyId: 'bytedance',
    type: '面试',
    duration: '90 分钟',
  },
  {
    id: 3,
    date: '2026-10-25',
    time: '19:00',
    title: '阿里巴巴 · 在线笔试',
    companyId: 'alibaba',
    type: '笔试',
    duration: '120 分钟',
  },
  {
    id: 4,
    date: '2026-10-28',
    time: '23:59',
    title: '腾讯秋招投递截止',
    companyId: 'tencent',
    type: '截止',
    duration: '当日截止',
  },
  {
    id: 5,
    date: '2026-10-29',
    time: '15:30',
    title: '华为 · HR 面谈',
    companyId: 'huawei',
    type: '面试',
    duration: '30 分钟',
  },
  {
    id: 6,
    date: '2026-11-02',
    time: '23:59',
    title: '字节跳动秋招截止',
    companyId: 'bytedance',
    type: '截止',
    duration: '当日截止',
  },
];
const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function CalendarPage() {
  const params = useSearchParams();
  const applications = useRadarStore((s) => s.applications);
  const notify = useRadarStore((s) => s.notify);
  const [events, setEvents] = useLocal('events', initial, isCalendarEvents);
  const conflicts = scheduleConflictIds(events);
  const [view, setView] = useState('月');
  const [cursor, setCursor] = useState(new Date(2026, 9, 23));
  const [day, setDay] = useState('2026-10-23');
  const [selected, setSelected] = useState<Event | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('2026-10-26');
  const [time, setTime] = useState('14:00');
  const [type, setType] = useState('面试');
  const [editing, setEditing] = useState<number | null>(null);
  const [duration, setDuration] = useState('60');
  const [companyId, setCompanyId] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const selectedCurrent = selected
    ? (events.find((event) => event.id === selected.id) ?? null)
    : null;
  function openNew() {
    setEditing(null);
    setTitle('');
    setDate(day);
    setTime('14:00');
    setType('面试');
    setDuration('60');
    setCompanyId('');
    setApplicationId('');
    setLocation('');
    setMeetingUrl('');
    setNotes('');
    setError('');
    setAdding(true);
  }
  function editEvent(event: Event) {
    setEditing(event.id);
    setTitle(event.title);
    setDate(event.date);
    setTime(event.time);
    setType(event.type);
    setDuration(String(parseInt(event.duration, 10) || 60));
    setCompanyId(event.companyId);
    setApplicationId(event.applicationId ?? '');
    setLocation(event.location ?? '');
    setMeetingUrl(event.meetingUrl ?? '');
    setNotes(event.notes ?? '');
    setError('');
    setSelected(null);
    setAdding(true);
  }
  useEffect(() => {
    if (params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!)) {
      const target = new Date(params.get('date')! + 'T12:00:00');
      if (!Number.isNaN(target.getTime())) {
        setDay(params.get('date')!);
        setCursor(target);
      }
    }
    const linked = applications.find((app) => app.id === params.get('application'));
    if (params.get('new') === '1' && linked) {
      const job = getJob(linked.jobId);
      setApplicationId(linked.id);
      setTitle(`${job ? getCompany(job.companyId).name + ' · ' + job.title : '面试'}安排`);
      setCompanyId(job?.companyId ?? '');
      setAdding(true);
    }
  }, [params.toString()]);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
  const selectedDay = new Date(day + 'T12:00:00');
  const weekStart = new Date(selectedDay);
  weekStart.setDate(selectedDay.getDate() - ((selectedDay.getDay() + 6) % 7));
  const visible =
    view === '月'
      ? days
      : view === '周'
        ? Array.from(
            { length: 7 },
            (_, i) =>
              new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i),
          )
        : [selectedDay];
  const dayEvents = events
    .filter((x) => x.date === day)
    .sort((a, b) => a.time.localeCompare(b.time));
  const shift = (n: number) => {
    if (view === '月') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
    else {
      const next = new Date(selectedDay);
      next.setDate(next.getDate() + n * (view === '周' ? 7 : 1));
      setDay(key(next));
      setCursor(next);
    }
  };
  function add() {
    const candidate: Event = {
      id: editing ?? Date.now(),
      date,
      time,
      title: title.trim(),
      companyId,
      type,
      duration: type === '截止' ? '当日截止' : `${duration} 分钟`,
      applicationId: applicationId || undefined,
      location: location.trim(),
      meetingUrl: meetingUrl.trim(),
      notes: notes.trim(),
    };
    const invalid = validateCalendarEvent(candidate);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (
      !setEvents((v) =>
        editing
          ? v.map((event) => (event.id === editing ? { ...event, ...candidate } : event))
          : [...v, candidate],
      )
    )
      return;
    notify({
      category: '面试提醒',
      title: editing ? '日程已调整' : '新的日程已安排',
      content: `${title.trim()} · ${date} ${time}（上海时间）`,
      href: `/calendar?date=${date}`,
      action: '查看安排',
    });
    setDay(date);
    setCursor(new Date(date + 'T12:00:00'));
    setAdding(false);
    setTitle('');
    toast.success(editing ? '日程已更新' : '日程已保存到本机');
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="求职日程"
        description="每一次准备都有安排，每一个重要节点都不遗漏。"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              aria-label="导出日历"
              onClick={() =>
                downloadLocalFile(
                  'campus-radar-calendar.ics',
                  calendarIcs(events),
                  'text/calendar;charset=utf-8',
                )
              }
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">导出日历</span>
            </Button>
            <Button onClick={openNew}>
              <Plus className="size-4" />
              新建日程
            </Button>
          </div>
        }
      />
      <DemoNotice>
        日程保存在本机；可导出 ICS
        加入系统日历。应用打开时显示站内提醒，不会发送邮件。所有时间均为上海时区。
      </DemoNotice>
      {conflicts.size > 0 && (
        <div
          role="alert"
          className="flex gap-3 items-center rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {conflicts.size} 项日程时间重叠，请联系对方确认或调整安排。
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Panel
          className="min-w-0"
          title={
            <div className="flex items-center gap-3">
              <span className="font-display text-xl">
                {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
              </span>
              <Button variant="ghost" size="icon" aria-label="上一期" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="下一期" onClick={() => shift(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          }
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCursor(new Date(2026, 9, 23));
                setDay('2026-10-23');
              }}
            >
              回到今天
            </Button>
          }
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <PageTabs items={['月', '周', '日']} value={view} onChange={setView} />
            <span className="hidden text-xs text-muted-foreground sm:block">点击日期查看安排</span>
          </div>
          {view !== '日' && (
            <div className="grid grid-cols-7 border-b border-border pb-3 text-center text-xs text-muted-foreground">
              {['一', '二', '三', '四', '五', '六', '日'].map((x) => (
                <span key={x}>周{x}</span>
              ))}
            </div>
          )}
          <div className={view === '日' ? '' : 'grid grid-cols-7'}>
            {visible.map((d) => {
              const k = key(d);
              const entries = events.filter((x) => x.date === k);
              return (
                <button
                  key={k}
                  onClick={() => setDay(k)}
                  className={`min-h-24 border-b border-r border-border/60 p-1.5 text-left transition-colors hover:bg-raised sm:min-h-28 sm:p-2 ${k === day ? 'bg-primary/5' : ''} ${d.getMonth() !== cursor.getMonth() ? 'opacity-40' : ''} ${view === '日' ? 'w-full' : ''}`}
                >
                  <span
                    className={`mb-2 inline-flex size-7 items-center justify-center rounded-full font-mono text-xs ${k === '2026-10-23' ? 'bg-primary text-primary-foreground' : k === day ? 'border border-primary text-primary' : ''}`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="space-y-1">
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded px-1.5 py-1 text-[10px] sm:text-xs ${conflicts.has(e.id) ? 'bg-destructive/10 text-destructive' : e.type === '截止' ? 'bg-warning/10 text-warning' : e.type === '笔试' ? 'bg-status-applied/10 text-status-applied' : 'bg-purple/10 text-status-interview'}`}
                        title={e.title}
                      >
                        {view === '月' ? '' : e.time + ' '}
                        {conflicts.has(e.id) && <AlertTriangle className="inline size-2.5 mr-1" />}
                        {e.title}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-purple" />
              面试
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-status-applied" />
              笔试
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-warning" />
              截止
            </span>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel
            title={`${day.slice(5).replace('-', ' 月 ')} 日的安排`}
            description={`${dayEvents.length} 项日程 · Asia/Shanghai`}
          >
            {dayEvents.length ? (
              dayEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="w-full border-b border-border py-4 text-left last:border-0"
                >
                  <p className="mb-2 font-mono text-xs text-primary">
                    {e.time}
                    {conflicts.has(e.id) && (
                      <span className="ml-2 text-[10px] text-destructive">时间冲突</span>
                    )}
                  </p>
                  <h3 className="text-sm font-medium leading-6">{e.title}</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{e.duration}</span>
                    <ArrowUpRight className="size-4 text-subtle" />
                  </div>
                </button>
              ))
            ) : (
              <div className="py-6">
                <CalendarDays className="mb-4 size-8 text-subtle" />
                <p className="text-sm">今天留给你自由准备</p>
                <p className="mt-2 text-xs text-muted-foreground">也可以添加一项学习安排。</p>
                <Button className="mt-5" size="sm" variant="outline" onClick={openNew}>
                  添加日程
                </Button>
              </div>
            )}
          </Panel>
          <Panel title="接下来值得留意">
            <p className="text-xs leading-6 text-muted-foreground">
              腾讯秋招将于 10 月 28 日截止，请提前检查简历与投递状态。
            </p>
            <Link href="/pipeline" className="mt-4 flex items-center gap-2 text-xs text-primary">
              查看投递看板
              <ArrowUpRight className="size-3" />
            </Link>
          </Panel>
        </div>
      </div>
      <Modal
        open={!!selectedCurrent}
        onClose={() => setSelected(null)}
        title={selectedCurrent?.title ?? '日程详情'}
      >
        <div className="space-y-5 text-sm">
          {selected && conflicts.has(selected.id) && (
            <p className="text-xs text-destructive">这项安排与另一项日程重叠，请提前调整。</p>
          )}
          <div className="flex gap-3">
            <Clock className="size-4 text-primary" />
            {selectedCurrent?.date} {selectedCurrent?.time} · {selectedCurrent?.duration}
          </div>
          <div className="flex gap-3">
            <Video className="size-4 text-primary" />
            {selectedCurrent?.location || '未填写地点'}
          </div>
          {selectedCurrent?.meetingUrl && (
            <Button variant="outline" asChild>
              <a href={selectedCurrent.meetingUrl} target="_blank" rel="noopener noreferrer">
                打开会议链接 <ArrowUpRight />
              </a>
            </Button>
          )}
          <div className="rounded-lg bg-raised p-4 leading-7 text-muted-foreground">
            {selectedCurrent?.notes ||
              '准备建议：梳理一个完整项目，检查网络与设备，提前 10 分钟进入等候状态。'}
          </div>
          {selectedCurrent?.applicationId && (
            <Link href={`/interview/${selectedCurrent.applicationId}/timeline`}>
              <Button className="w-full">查看面试时间线</Button>
            </Link>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => selectedCurrent && editEvent(selectedCurrent)}>
              <Pencil />
              编辑日程
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  selectedCurrent &&
                  setEvents((items) =>
                    items.map((item) =>
                      item.id === selectedCurrent.id
                        ? { ...item, completed: !item.completed }
                        : item,
                    ),
                  )
                )
                  toast.success(selectedCurrent.completed ? '已恢复日程' : '已标记完成');
              }}
            >
              <Check />
              {selectedCurrent?.completed ? '恢复未完成' : '标记完成'}
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              删除日程
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="删除这项日程？"
        description="删除只影响本机日历，不会通知企业或取消外部会议。"
      >
        <Button
          variant="destructive"
          onClick={() => {
            if (
              selectedCurrent &&
              setEvents((items) => items.filter((item) => item.id !== selectedCurrent.id))
            ) {
              setDeleting(false);
              setSelected(null);
              toast.success('日程已删除');
            }
          }}
        >
          确认删除日程
        </Button>
      </Modal>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={editing ? '编辑日程' : '新建日程'}
        description="保存在当前浏览器，支持导出系统日历；不会向企业发送消息。"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Field label="日程标题">
            <Input
              value={title}
              required
              maxLength={160}
              placeholder="例如：前端模拟练习"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="日期">
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="时间">
              <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="类型">
            <Pick
              label="日程类型"
              value={type}
              onChange={setType}
              options={['面试', '笔试', '学习', '截止']}
            />
          </Field>
          {type !== '截止' && (
            <Field label="时长（分钟）">
              <Input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required
              />
            </Field>
          )}
          <Field label="关联投递">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={applicationId}
              onChange={(event) => {
                setApplicationId(event.target.value);
                const app = applications.find((item) => item.id === event.target.value);
                const job = app ? getJob(app.jobId) : null;
                if (job) setCompanyId(job.companyId);
              }}
            >
              <option value="">不关联投递</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {getJob(app.jobId)?.title ?? app.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="公司">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">暂不指定</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="地点或会议室">
            <Input
              maxLength={200}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="例如：线上会议 / 学校就业中心"
            />
          </Field>
          <Field label="会议链接（选填）">
            <Input
              type="url"
              maxLength={1000}
              value={meetingUrl}
              onChange={(event) => setMeetingUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="准备笔记">
            <Textarea
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!title.trim() || !date || !time}>
            保存到本机日程
          </Button>
        </form>
      </Modal>
    </div>
  );
}

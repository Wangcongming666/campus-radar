'use client';
import { useEffect, useRef, useState } from 'react';
import { PageHeader, Panel, DemoNotice, StatCard, SmallTag, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRadarStore } from '@/lib/store';
import { useValidatedArray, useValidatedValue } from './growth-local-state';
import { plannerTaskSchema, milestoneSchema, remindedSchema } from '@/lib/growth-storage';
import { Field, Pick, Modal, Row } from './common';
type Milestone = { id: string; title: string; date: string };
type Task = {
  id: string;
  title: string;
  milestoneId: string;
  status: string;
  date: string;
  remind: boolean;
};
const statuses = ['待开始', '进行中', '已完成'];
const blankTask = (): Task => ({
  id: '',
  title: '',
  milestoneId: '',
  status: '待开始',
  date: '',
  remind: true,
});
export function PlannerPage() {
  const [milestones, setMilestones] = useValidatedArray<Milestone>(
    'planner-milestones-v2',
    milestoneSchema,
    [],
  );
  const notify = useRadarStore((s) => s.notify);
  const [reminded, setReminded] = useValidatedValue<Record<string, string>>(
    'planner-reminded-v2',
    remindedSchema,
    {},
  );
  const [tasks, setTasks] = useValidatedArray<Task>('planner-tasks-v2', plannerTaskSchema, []);
  const [draft, setDraft] = useState<Task | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('全部里程碑');
  const reminding = useRef(new Set<string>());
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const due = tasks.filter((t) => t.remind && t.status !== '已完成' && t.date && t.date <= today);
  const visibleTasks = tasks.filter(
    (t) =>
      filter === '全部里程碑' ||
      (filter === '未分组'
        ? !t.milestoneId || !milestones.some((m) => m.id === t.milestoneId)
        : milestones.find((m) => m.id === t.milestoneId)?.title === filter),
  );
  useEffect(() => {
    const pending = tasks.filter(
      (t) =>
        t.remind && t.status !== '已完成' && t.date && t.date <= today && reminded[t.id] !== t.date,
    );
    for (const task of pending) {
      const token = `${task.id}:${task.date}`;
      if (reminding.current.has(token)) continue;
      reminding.current.add(token);
      void (async () => {
        try {
          const saved = await notify({
            title: `规划任务到期：${task.title}`,
            content: `截止 ${task.date}，当前状态：${task.status}。`,
            category: '学习提醒',
            href: '/planner',
          });
          if (saved) await setReminded((current) => ({ ...current, [task.id]: task.date }));
        } finally {
          reminding.current.delete(token);
        }
      })();
    }
  }, [tasks, reminded, notify, today]);
  async function saveTask() {
    if (!draft?.title.trim()) {
      setError('请输入任务名称');
      return;
    }
    const item = { ...draft, title: draft.title.trim(), id: draft.id || crypto.randomUUID() };
    if (
      !(await setTasks((xs) =>
        xs.some((x) => x.id === item.id)
          ? xs.map((x) => (x.id === item.id ? item : x))
          : [...xs, item],
      ))
    )
      return;
    setDraft(null);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="求职规划"
        description="把目标拆成里程碑与可执行的任务。"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMilestone({ id: '', title: '', date: '' });
                setError('');
              }}
            >
              新增里程碑
            </Button>
            <Button
              onClick={() => {
                setDraft(blankTask());
                setError('');
              }}
            >
              新增任务
            </Button>
          </div>
        }
      />
      <DemoNotice>
        {process.env.NEXT_PUBLIC_DATA_MODE === 'api'
          ? '任务与提醒随账号保存；'
          : '任务与提醒保存在本机；'}
        打开本页时检查到期任务并生成站内通知，不触发系统推送。
      </DemoNotice>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="任务总数" value={tasks.length} />
        <StatCard
          label="已完成"
          value={`${tasks.filter((t) => t.status === '已完成').length} / ${tasks.length}`}
        />
        <StatCard label="到期提醒" value={due.length} />
      </div>
      {due.length > 0 && (
        <Panel title="到期提醒">
          <div role="status" className="space-y-2">
            {due.map((t) => (
              <p key={t.id} className="text-sm">
                {t.date < today ? '已逾期' : '今日到期'} · {t.title} · {t.date}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, remind: false } : x)))
                  }
                >
                  关闭此提醒
                </Button>
              </p>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="里程碑">
        {!milestones.length && (
          <EmptyState
            kind="calendar"
            title="为求职设定第一个里程碑"
            description="例如完成简历准备、通过首轮面试，再把目标拆成小任务。"
            action={
              <Button
                onClick={() => {
                  setMilestone({ id: '', title: '', date: '' });
                  setError('');
                }}
              >
                创建第一个里程碑
              </Button>
            }
          />
        )}
        {[...milestones]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((m) => {
            const children = tasks.filter((t) => t.milestoneId === m.id);
            return (
              <Row key={m.id} className="flex-wrap">
                <div>
                  <h2 className="text-sm font-medium">
                    {m.title} <SmallTag>{m.date || '未设置截止日'}</SmallTag>
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {children.filter((t) => t.status === '已完成').length} / {children.length}{' '}
                    任务完成
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMilestone(m);
                      setError('');
                    }}
                  >
                    编辑里程碑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!(await setMilestones((xs) => xs.filter((x) => x.id !== m.id)))) return;
                      if (
                        !(await setTasks((xs) =>
                          xs.map((t) => (t.milestoneId === m.id ? { ...t, milestoneId: '' } : t)),
                        ))
                      )
                        return;
                      if (filter === m.title) setFilter('全部里程碑');
                    }}
                  >
                    删除里程碑
                  </Button>
                </div>
              </Row>
            );
          })}
      </Panel>
      <Field label="任务筛选">
        <Pick
          value={filter}
          onChange={setFilter}
          options={['全部里程碑', '未分组', ...milestones.map((m) => m.title)]}
        />
      </Field>
      <div className="grid gap-4 lg:grid-cols-3">
        {statuses.map((status) => (
          <Panel key={status} title={status}>
            <div className="space-y-3">
              {visibleTasks
                .filter((t) => t.status === status)
                .map((t) => (
                  <div className="space-y-3 rounded-lg border bg-background p-3" key={t.id}>
                    <h3 className="text-sm font-medium">{t.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {milestones.find((m) => m.id === t.milestoneId)?.title ?? '未分组'} ·{' '}
                      {t.date || '无截止日'}
                      {t.remind ? ' · 开启到期提醒' : ''}
                    </p>
                    <Pick
                      label={`${t.title}的任务状态`}
                      value={t.status}
                      onChange={(value) =>
                        setTasks((xs) =>
                          xs.map((x) => (x.id === t.id ? { ...x, status: value } : x)),
                        )
                      }
                      options={statuses}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDraft(t);
                          setError('');
                        }}
                      >
                        编辑任务
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTasks((xs) => xs.filter((x) => x.id !== t.id))}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              {!visibleTasks.some((t) => t.status === status) && (
                <p className="py-6 text-sm text-muted-foreground">暂无{status}任务</p>
              )}
            </div>
          </Panel>
        ))}
      </div>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑任务' : '新增任务'}
        description="可随时移动任务状态和调整截止日。"
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveTask();
          }}
        >
          {draft && (
            <>
              <Field label="任务名称">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={120}
                />
              </Field>
              <Field label="所属里程碑">
                <select
                  className="h-10 rounded-md border bg-background px-2"
                  value={draft.milestoneId}
                  onChange={(e) => setDraft({ ...draft, milestoneId: e.target.value })}
                >
                  <option value="">未分组</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="截止日期">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="任务状态">
                <Pick
                  value={draft.status}
                  onChange={(status) => setDraft({ ...draft, status })}
                  options={statuses}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.remind}
                  onChange={(e) => setDraft({ ...draft, remind: e.target.checked })}
                />
                在本页显示到期提醒
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存任务</Button>
            </>
          )}
        </form>
      </Modal>
      <Modal
        open={!!milestone}
        onClose={() => setMilestone(null)}
        title={milestone?.id ? '编辑里程碑' : '新增里程碑'}
        description="删除里程碑后，其任务保留在未分组中。"
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!milestone?.title.trim()) {
              setError('请输入里程碑名称');
              return;
            }
            if (
              milestones.some((m) => m.id !== milestone.id && m.title === milestone.title.trim()) ||
              ['全部里程碑', '未分组'].includes(milestone.title.trim())
            ) {
              setError('请使用不同且未被保留的里程碑名称');
              return;
            }
            const m = {
              ...milestone,
              title: milestone.title.trim(),
              id: milestone.id || crypto.randomUUID(),
            };
            if (
              !(await setMilestones((xs) =>
                xs.some((x) => x.id === m.id) ? xs.map((x) => (x.id === m.id ? m : x)) : [...xs, m],
              ))
            )
              return;
            setMilestone(null);
          }}
        >
          {milestone && (
            <>
              <Field label="里程碑名称">
                <Input
                  value={milestone.title}
                  onChange={(e) => setMilestone({ ...milestone, title: e.target.value })}
                  maxLength={80}
                />
              </Field>
              <Field label="目标日期">
                <Input
                  type="date"
                  value={milestone.date}
                  onChange={(e) => setMilestone({ ...milestone, date: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存里程碑</Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

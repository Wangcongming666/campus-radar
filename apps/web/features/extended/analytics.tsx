'use client';
import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { PageHeader, Panel, StatCard, DemoNotice, PageTabs } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useRadarStore } from '@/lib/store';
import { getJob, stages } from '@/lib/data';
import { applicationDate, applicationMetrics } from '@/lib/growth-domain';
import { downloadText } from '@/lib/growth-local';
const colors = [
  'var(--color-primary)',
  'var(--color-applied)',
  'var(--color-interview)',
  'var(--color-offer)',
];
const tip = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
};
export function AnalyticsPage() {
  const all = useRadarStore((s) => s.applications);
  const [range, setRange] = useState('近 30 天');
  const [includeArchived, setIncludeArchived] = useState(false);
  const today = new Date();
  const year = today.getFullYear();
  const days = range === '近 7 天' ? 7 : range === '近 30 天' ? 30 : 120;
  const first = new Date(today);
  first.setDate(first.getDate() - days + 1);
  const start = first.toLocaleDateString('sv-SE');
  const end = today.toLocaleDateString('sv-SE');
  const dateOf = (a: (typeof all)[number]) => applicationDate(a.appliedAt ?? a.date, year);
  const applications = all.filter(
    (a) =>
      (includeArchived || !a.archived) && !!dateOf(a) && dateOf(a)! >= start && dateOf(a)! <= end,
  );
  const unknown = all.filter((a) => (includeArchived || !a.archived) && !dateOf(a)).length;
  const { sent, reachedInterview, interviewing, offers } = applicationMetrics(applications);
  const data = stages.map((s) => ({
    name: s.label,
    value: applications.filter((a) => a.stage === s.id).length,
  }));
  const cities = [...new Set(applications.map((a) => getJob(a.jobId)?.city ?? '未知'))].map(
    (name) => ({
      name,
      value: applications.filter((a) => (getJob(a.jobId)?.city ?? '未知') === name).length,
    }),
  );
  const weeks = Array.from({ length: days }, (_, i) => {
    const date = new Date(first);
    date.setDate(date.getDate() + i);
    const key = date.toLocaleDateString('sv-SE');
    return {
      name: key.slice(5),
      date: key,
      新增记录: applications.filter((a) => dateOf(a) === key).length,
      面试变更: applications.reduce(
        (n, a) =>
          n +
          (a.history?.filter(
            (h) =>
              applicationDate(h.at, year) === key &&
              ['INTERVIEW_1', 'INTERVIEW_2', 'HR'].includes(h.to),
          ).length ?? 0),
        0,
      ),
    };
  });
  function exportData() {
    downloadText(
      '投递分析.csv',
      '\uFEFF日期,新增记录,面试阶段变更\r\n' +
        weeks.map((w) => `${w.date},${w.新增记录},${w.面试变更}`).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="投递分析"
        description="统计本机投递看板的当前记录与阶段变更。"
        action={
          <PageTabs
            items={['近 7 天', '近 30 天', '近 120 天']}
            value={range}
            onChange={setRange}
          />
        }
      />
      <DemoNotice>
        全部图表来自本机投递记录。日期范围按记录的投递/创建日期筛选；旧的中文月日按当前年份解释。面试变更只统计已有历史事件，缺少历史的旧记录不补造时间。
      </DemoNotice>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          包含已归档记录
        </label>
        <span className="text-xs text-muted-foreground">
          {start} — {end} · 日期未知 {unknown} 条（未计入本期）
        </span>
        <Button variant="outline" size="sm" onClick={exportData}>
          导出每日统计
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="本期记录" value={applications.length} />
        <StatCard label="进行中面试" value={interviewing} />
        <StatCard
          label="已到达面试 / 已投递"
          value={`${sent ? Math.round((reachedInterview / sent) * 100) : 0}%`}
          detail={`${reachedInterview} / ${sent} · 含历史与 Offer`}
        />
        <StatCard label="当前 Offer" value={offers} detail="尚未代表接受" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="每日投递节奏" description="新增记录与面试阶段变更次数">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeks} margin={{ left: -25, right: 10, top: 15, bottom: 0 }}>
                <CartesianGrid
                  stroke="var(--color-border)"
                  vertical={false}
                  strokeDasharray="3 5"
                />
                <XAxis dataKey="name" fontSize={11} minTickGap={30} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip contentStyle={tip} />
                <Area
                  type="stepAfter"
                  dataKey="新增记录"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.15}
                />
                <Area
                  type="stepAfter"
                  dataKey="面试变更"
                  stroke="var(--color-interview)"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {!applications.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              本期没有投递记录，调整范围或前往看板添加。
            </p>
          )}
        </Panel>
        <Panel title="阶段分布" description="只统计筛选范围内每条记录的当前阶段">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ left: 5, right: 15, top: 8, bottom: 0 }}
              >
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={50} fontSize={11} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="value" name="记录数" radius={[0, 4, 4, 0]} barSize={14}>
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={colors[i % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="投递城市分布">
          {cities.map((c, i) => (
            <div className="mb-4 text-sm" key={c.name}>
              <div className="mb-2 flex justify-between">
                <span>{c.name}</span>
                <span>
                  {c.value} 份 · {Math.round((c.value / applications.length) * 100)}%
                </span>
              </div>
              <div className="h-2 rounded bg-background">
                <div
                  className="h-2 rounded"
                  style={{
                    width: `${(c.value / applications.length) * 100}%`,
                    background: colors[i % colors.length],
                  }}
                />
              </div>
            </div>
          ))}
          {!cities.length && <p className="text-sm text-muted-foreground">暂无城市数据。</p>}
        </Panel>
        <Panel title="下一步建议" description="从本期实际状态计算的规则提示">
          <div className="space-y-4 text-sm leading-7">
            <p>
              {applications.filter((a) => a.stage === 'PENDING').length}{' '}
              个岗位仍待投递，可先核对截止日期与要求。
            </p>
            <p>{interviewing} 份记录处于面试阶段；及时安排准备与复盘。</p>
            <p>{offers} 份 Offer 可进入决策比较，确认书面条款和答复日期。</p>
            <p className="text-xs text-muted-foreground">
              这些提示根据当前状态生成，不提供行业基准或录用概率。
            </p>
          </div>
        </Panel>
      </div>
      <Panel title="可访问数据表">
        <details>
          <summary className="cursor-pointer text-sm text-primary">展开每日与阶段数据</summary>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <table className="w-full text-left text-xs">
              <caption className="mb-3 text-left">每日记录（{range}）</caption>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>新增</th>
                  <th>面试变更</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr className="border-t" key={w.date}>
                    <td className="p-2">{w.date}</td>
                    <td>{w.新增记录}</td>
                    <td>{w.面试变更}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full self-start text-left text-xs">
              <caption className="mb-3 text-left">当前阶段</caption>
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>记录数</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr className="border-t" key={d.name}>
                    <td className="p-2">{d.name}</td>
                    <td>{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>
    </div>
  );
}

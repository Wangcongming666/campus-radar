'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Panel, EmptyState, CompanyLogo } from '@/components/shared';
import { useRadarStore } from '@/lib/store';
import { getCompany } from '@/lib/data';
import { radarHeat, radarSampleDate, radarSampleHistory } from '@/lib/growth-intelligence';
import { FilterButtons } from './common';
export function RadarCompanyRanking({
  companyIds,
  selectedCompanyId,
  onSelect,
}: {
  companyIds: string[];
  selectedCompanyId?: string;
  onSelect: (id: string) => void;
}) {
  const [range, setRange] = useState('近 7 天');
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  const days = range === '近 7 天' ? 7 : 30;
  const ranking = radarHeat(radarSampleHistory, companyIds, days, radarSampleDate);
  const active = ranking.find((r) => r.companyId === selectedCompanyId) ?? ranking[0];
  const max = Math.max(1, ...ranking.map((r) => r.total));
  const high = Math.max(1, ...(active?.series.map((s) => s.count) ?? []));
  return (
    <Panel
      title="公司热度排名与趋势 · 演示样本"
      description={`统计截至 ${radarSampleDate} 的虚构历史事件样本，热度 = 选定范围内的样本事件总数。排行跟随公司搜索、类型和关注筛选。`}
      action={<FilterButtons items={['近 7 天', '近 30 天']} value={range} onChange={setRange} />}
    >
      {!ranking.length ? (
        <EmptyState
          kind="subscriptions"
          title="当前筛选下没有公司热度"
          description="关注一家公司或信号后，可在「仅已关注」中追踪样本变化。"
          action={
            <Button asChild variant="outline">
              <Link href="/jobs">发现公司与岗位</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-left text-xs">
              <caption className="sr-only">{range}公司样本热度排名</caption>
              <thead>
                <tr>
                  <th className="p-2">排名 / 公司</th>
                  <th className="p-2">样本数</th>
                  <th className="p-2">较上期变化</th>
                  <th className="p-2">关注</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const c = getCompany(r.companyId),
                    followed = favorites.includes(`company:${r.companyId}`);
                  return (
                    <tr className="border-t" key={r.companyId}>
                      <td className="p-2">
                        <button
                          className="flex items-center gap-2 text-left hover:text-primary"
                          aria-label={`查看${c.name}热度`}
                          onClick={() => onSelect(r.companyId)}
                        >
                          <span className="font-mono text-subtle">{i + 1}</span>
                          <CompanyLogo companyId={r.companyId} size="sm" />
                          <span>{c.name}</span>
                        </button>
                        <div className="mt-2 h-1 rounded bg-primary/10">
                          <div
                            className="h-1 rounded bg-primary"
                            style={{ width: `${(r.total / max) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-2 font-mono">{r.total}</td>
                      <td className="p-2 font-mono">
                        {r.difference > 0 ? '+' : ''}
                        {r.difference}
                        <span className="mt-1 block font-sans text-[10px] text-muted-foreground">
                          上期 {r.previous}
                        </span>
                      </td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${followed ? '取消关注' : '关注'}${c.name}公司`}
                          onClick={() => toggle('company', r.companyId)}
                        >
                          {followed ? '已关注' : '关注'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {active && (
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-medium">
                {getCompany(active.companyId).name} · {range}每日样本趋势
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {active.series[0].date} — {radarSampleDate} · 共 {active.total} 条虚构事件样本
              </p>
              <svg
                viewBox="0 0 480 160"
                className="mt-4 w-full"
                role="img"
                aria-label={`${getCompany(active.companyId).name}${range}每日样本趋势图，共${active.total}条样本`}
              >
                <line x1="16" y1="130" x2="465" y2="130" stroke="var(--color-border)" />
                <line x1="16" y1="20" x2="16" y2="130" stroke="var(--color-border)" />
                <polyline
                  points={active.series
                    .map(
                      (s, i) =>
                        `${16 + (i / Math.max(1, days - 1)) * 449},${130 - (s.count / high) * 105}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                />
                {active.series.map((s, i) => (
                  <circle
                    key={s.date}
                    cx={16 + (i / Math.max(1, days - 1)) * 449}
                    cy={130 - (s.count / high) * 105}
                    r="2.5"
                    fill="var(--color-primary)"
                  >
                    <title>{`${s.date}：${s.count} 条样本`}</title>
                  </circle>
                ))}
                <text x="16" y="151" fontSize="10" fill="currentColor">
                  {active.series[0].date.slice(5)}
                </text>
                <text x="430" y="151" fontSize="10" fill="currentColor">
                  10-23
                </text>
              </svg>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-primary">展开每日趋势数据</summary>
                <div className="mt-3 max-h-48 overflow-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>样本日期</th>
                        <th>事件数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.series.map((s) => (
                        <tr key={s.date} className="border-t">
                          <td className="py-2">{s.date}</td>
                          <td>{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        以上为虚构历史样本，不是全网热度或真实招聘量。上期为相邻的同等天数；无历史样本的日期按 0
        计数。关注公司与信号仅保存在当前浏览器。
      </p>
    </Panel>
  );
}

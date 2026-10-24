'use client';
import { useState } from 'react';
import { PageHeader, Panel, DemoNotice, SmallTag, StatCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companies, jobs, getCompany } from '@/lib/data';
import { quantiles, annualCash } from '@/lib/growth-domain';
import { useValidatedArray } from './growth-local-state';
import { salarySampleSchema } from '@/lib/growth-storage';
import { Field, Pick, Modal, Row } from './common';
type SalarySample = {
  id: string;
  companyId: string;
  role: string;
  city: string;
  base: number;
  months: number;
  bonus: number;
  year: string;
  level: string;
  source: string;
  note: string;
};
const initialSamples: SalarySample[] = [
  ['tencent', '前端开发', '深圳', 30, 16],
  ['bytedance', '前端开发', '北京', 34, 15],
  ['alibaba', '后端开发', '杭州', 32, 16],
  ['meituan', '前端开发', '北京', 29, 15],
  ['ant', '前端开发', '杭州', 31, 16],
  ['huawei', '后端开发', '深圳', 28, 16],
  ['xiaomi', '产品经理', '北京', 25, 16],
].map((x, i) => ({
  id: `sample-${i}`,
  companyId: String(x[0]),
  role: String(x[1]),
  city: String(x[2]),
  base: Number(x[3]),
  months: Number(x[4]),
  bonus: 0,
  year: '2027',
  level: '本科',
  source: '虚构演示样本',
  note: '单条虚构薪资，仅演示计算，不代表行情。',
}));
const blank = (): SalarySample => ({
  id: '',
  companyId: companies[0].id,
  role: '前端开发',
  city: '深圳',
  base: 0,
  months: 12,
  bonus: 0,
  year: '2027',
  level: '本科',
  source: '本机自填 · 未核验',
  note: '',
});
function BoxPlot({ values }: { values: number[] }) {
  const q = quantiles(values);
  if (!q)
    return (
      <p className="py-8 text-sm text-muted-foreground">
        无符合条件的样本，请调整筛选或添加薪资记录。
      </p>
    );
  const low = Math.max(0, q.min - (q.max - q.min || 10) * 0.2);
  const high = q.max + (q.max - q.min || 10) * 0.2;
  const pos = (n: number) => 40 + ((n - low) / (high - low)) * 520;
  return (
    <div>
      <svg
        viewBox="0 0 600 140"
        className="w-full"
        role="img"
        aria-label={`年薪箱线图：最低${q.min}，下四分位${q.q1}，中位数${q.median}，上四分位${q.q3}，最高${q.max}万元`}
      >
        <line x1={pos(q.min)} y1="55" x2={pos(q.max)} y2="55" stroke="currentColor" />
        <line x1={pos(q.min)} y1="40" x2={pos(q.min)} y2="70" stroke="currentColor" />
        <line x1={pos(q.max)} y1="40" x2={pos(q.max)} y2="70" stroke="currentColor" />
        <rect
          x={pos(q.q1)}
          y="30"
          width={Math.max(2, pos(q.q3) - pos(q.q1))}
          height="50"
          fill="var(--color-primary)"
          opacity=".3"
        />
        <line
          x1={pos(q.median)}
          y1="30"
          x2={pos(q.median)}
          y2="80"
          stroke="var(--color-primary)"
          strokeWidth="3"
        />
        {[q.min, q.q1, q.median, q.q3, q.max].map((v, i) => (
          <text
            key={i}
            x={40 + i * 130}
            y="115"
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
          >
            {['最低', 'P25', 'P50', 'P75', '最高'][i]} {v.toFixed(1)}
          </text>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">
        单位：万元/年 · 线性插值分位数 · 须线表示样本最小值与最大值；当前 {values.length} 条样本
        {values.length < 5 ? '，样本较少，仅供比较已输入数据。' : '，不代表全行业。'}
      </p>
    </div>
  );
}
export function SalaryPage() {
  const [samples, setSamples] = useValidatedArray<SalarySample>(
    'salary-samples-v2',
    salarySampleSchema,
    initialSamples,
  );
  const [role, setRole] = useState('全部方向');
  const [city, setCity] = useState('全部城市');
  const [company, setCompany] = useState('全部公司');
  const [year, setYear] = useState('全部届别');
  const [source, setSource] = useState('全部来源');
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<SalarySample | null>(null);
  const [error, setError] = useState('');
  const filtered = samples.filter(
    (s) =>
      (role === '全部方向' || s.role === role) &&
      (city === '全部城市' || s.city === city) &&
      (company === '全部公司' || s.companyId === company) &&
      (year === '全部届别' || s.year === year) &&
      (source === '全部来源' || s.source === source),
  );
  const annual = annualCash;
  const q = quantiles(filtered.map(annual));
  const comparison = samples.filter((s) => selected.includes(s.id));
  function save() {
    if (
      !draft?.role.trim() ||
      !draft.city.trim() ||
      !/^20\d{2}$/.test(draft.year) ||
      !Number.isFinite(draft.base) ||
      draft.base <= 0 ||
      draft.base > 500 ||
      !Number.isFinite(draft.months) ||
      draft.months < 1 ||
      draft.months > 36 ||
      !Number.isFinite(draft.bonus) ||
      draft.bonus < 0 ||
      draft.bonus > 10000
    ) {
      setError('请填写岗位、城市、四位届别；月薪需为 0–500K，月数 1–36，奖金 0–10000K。');
      return;
    }
    const item = {
      ...draft,
      role: draft.role.trim(),
      city: draft.city.trim(),
      id: draft.id || crypto.randomUUID(),
    };
    if (
      !setSamples((xs) =>
        xs.some((x) => x.id === item.id)
          ? xs.map((x) => (x.id === item.id ? item : x))
          : [...xs, item],
      )
    )
      return;
    setDraft(null);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="薪资行情"
        description="统一月薪、月数和奖金口径，比较你掌握的薪资样本。"
        action={
          <Button
            onClick={() => {
              setDraft(blank());
              setError('');
            }}
          >
            添加薪资爆料
          </Button>
        }
      />
      <DemoNotice>
        初始数据为 7 条虚构样本；新增爆料仅存本机，未公开发布、未核验。年薪 = 月薪 × 薪资月数 +
        保证奖金；不含不确定绩效与股票。
      </DemoNotice>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="岗位方向">
          <Pick
            value={role}
            onChange={setRole}
            options={['全部方向', ...new Set(samples.map((s) => s.role))]}
          />
        </Field>
        <Field label="城市">
          <Pick
            value={city}
            onChange={setCity}
            options={['全部城市', ...new Set(samples.map((s) => s.city))]}
          />
        </Field>
        <Field label="公司">
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="全部公司">全部公司</option>
            {companies.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="届别">
          <Pick
            value={year}
            onChange={setYear}
            options={['全部届别', ...new Set(samples.map((s) => s.year))]}
          />
        </Field>
        <Field label="来源">
          <Pick
            value={source}
            onChange={setSource}
            options={['全部来源', ...new Set(samples.map((s) => s.source))]}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="当前样本" value={filtered.length} />
        <StatCard label="年薪中位数" value={q ? `${q.median.toFixed(1)} 万` : '暂无数据'} />
        <StatCard
          label="年薪 P25–P75"
          value={q ? `${q.q1.toFixed(1)}–${q.q3.toFixed(1)} 万` : '暂无数据'}
        />
      </div>
      <Panel title="年薪分布 · 箱线与分位">
        <BoxPlot values={filtered.map(annual)} />
      </Panel>
      <Panel title="薪资样本" description="勾选 2–4 条记录进行公司/岗位对比。">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead>
              <tr>
                {['对比', '公司 / 岗位', '城市 / 届别', '月薪 × 月数', '年薪', '来源', '操作'].map(
                  (x) => (
                    <th key={x} className="p-3">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr className="border-t" key={s.id}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`对比${getCompany(s.companyId).name}${s.role}`}
                      checked={selected.includes(s.id)}
                      disabled={selected.length >= 4 && !selected.includes(s.id)}
                      onChange={(e) =>
                        setSelected((xs) =>
                          e.target.checked ? [...xs, s.id] : xs.filter((id) => id !== s.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-3">
                    {getCompany(s.companyId).name}
                    <p className="text-xs text-muted-foreground">{s.role}</p>
                  </td>
                  <td className="p-3">
                    {s.city} · {s.year}
                    <p className="text-xs text-muted-foreground">{s.level}</p>
                  </td>
                  <td className="p-3">
                    {s.base}K × {s.months}
                    <p className="text-xs">+ {s.bonus}K 保证奖金</p>
                  </td>
                  <td className="p-3 font-mono">{annual(s).toFixed(1)} 万</td>
                  <td className="p-3 text-xs">
                    {s.source}
                    <p className="max-w-44 text-muted-foreground">{s.note}</p>
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDraft(s);
                        setError('');
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSamples((xs) => xs.filter((x) => x.id !== s.id));
                        setSelected((xs) => xs.filter((x) => x !== s.id));
                      }}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">当前条件没有薪资样本。</p>
          )}
        </div>
      </Panel>
      {comparison.length > 0 && (
        <Panel title="公司与岗位对比" description="比较所选的具体记录；单条记录无法代表公司水平。">
          <div className="grid gap-3 md:grid-cols-2">
            {comparison.map((s) => (
              <div key={s.id} className="rounded-lg border p-4">
                <h3 className="text-sm font-medium">
                  {getCompany(s.companyId).name} · {s.role}
                </h3>
                <p className="mt-3 text-xl font-mono">{annual(s).toFixed(1)} 万/年</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.city} · {s.base}K × {s.months} + {s.bonus}K · {s.source}
                </p>
                <div className="mt-3 h-2 rounded bg-primary/10">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${(annual(s) / Math.max(...comparison.map(annual))) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setSelected([])}>
            清空对比
          </Button>
        </Panel>
      )}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑薪资记录' : '添加薪资爆料'}
        description="仅保存本地记录；请统一填写税前保证现金，不含不确定收益。"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {draft && (
            <>
              <Field label="公司">
                <select
                  className="h-10 rounded-md border bg-background px-2"
                  value={draft.companyId}
                  onChange={(e) => setDraft({ ...draft, companyId: e.target.value })}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="岗位方向">
                  <Input
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    list="salary-roles"
                  />
                  <datalist id="salary-roles">
                    {[...new Set(jobs.map((j) => j.role))].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </datalist>
                </Field>
                <Field label="城市">
                  <Input
                    value={draft.city}
                    onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  />
                </Field>
                <Field label="月薪（K）">
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.base}
                    onChange={(e) => setDraft({ ...draft, base: Number(e.target.value) })}
                  />
                </Field>
                <Field label="薪资月数">
                  <Input
                    type="number"
                    step="0.5"
                    value={draft.months}
                    onChange={(e) => setDraft({ ...draft, months: Number(e.target.value) })}
                  />
                </Field>
                <Field label="保证奖金（K）">
                  <Input
                    type="number"
                    value={draft.bonus}
                    onChange={(e) => setDraft({ ...draft, bonus: Number(e.target.value) })}
                  />
                </Field>
                <Field label="届别">
                  <Input
                    value={draft.year}
                    onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                  />
                </Field>
                <Field label="学历">
                  <Pick
                    value={draft.level}
                    onChange={(level) => setDraft({ ...draft, level })}
                    options={['本科', '硕士', '博士', '其他']}
                  />
                </Field>
              </div>
              <Field label="备注（不填写个人信息）">
                <Input
                  value={draft.note}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存薪资记录</Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { PageHeader, Panel, DemoNotice, SmallTag, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rankOffers, annualCash, scoreOfferPay } from '@/lib/growth-domain';
import { downloadText } from '@/lib/growth-local';
import { useValidatedArray } from './growth-local-state';
import { offerSchema, dimensionSchema } from '@/lib/growth-storage';
import { Field, Modal } from './common';
type Dimension = { id: string; name: string; weight: number };
type Offer = {
  id: string;
  company: string;
  title: string;
  city: string;
  base: number;
  months: number;
  bonus: number;
  deadline: string;
  note: string;
  scores: Record<string, number>;
};
const defaults: Dimension[] = [
  { id: 'pay', name: '保证年薪', weight: 30 },
  { id: 'growth', name: '技术成长', weight: 25 },
  { id: 'team', name: '团队匹配', weight: 20 },
  { id: 'life', name: '生活平衡', weight: 15 },
  { id: 'city', name: '城市偏好', weight: 10 },
];
const annual = annualCash;
const csv = (s: string | number) =>
  `"${String(s)
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""')}"`;
export function OfferComparePage() {
  const [offers, setOffers] = useValidatedArray<Offer>('offers-v2', offerSchema, []);
  const [dimensions, setDimensions] = useValidatedArray<Dimension>(
    'offer-dimensions-v2',
    dimensionSchema,
    defaults,
  );
  const [draft, setDraft] = useState<Offer | null>(null);
  const [error, setError] = useState('');
  const [dimensionName, setDimensionName] = useState('');
  const scored: Offer[] = scoreOfferPay(
    offers.map((o) => ({
      ...o,
      scores: {
        ...Object.fromEntries(dimensions.filter((d) => d.id !== 'pay').map((d) => [d.id, 50])),
        ...o.scores,
      },
    })),
  );
  const ranked = rankOffers(scored, dimensions);
  const weightSum = dimensions.reduce((n, d) => n + d.weight, 0);
  function add() {
    setDraft({
      id: '',
      company: '',
      title: '',
      city: '',
      base: 0,
      months: 12,
      bonus: 0,
      deadline: '',
      note: '',
      scores: Object.fromEntries(dimensions.filter((d) => d.id !== 'pay').map((d) => [d.id, 50])),
    });
    setError('');
  }
  function save() {
    if (
      !draft?.company.trim() ||
      !draft.title.trim() ||
      !draft.city.trim() ||
      !Number.isFinite(draft.base) ||
      draft.base <= 0 ||
      draft.base > 500 ||
      draft.months < 1 ||
      draft.months > 36 ||
      !Number.isFinite(draft.months) ||
      !Number.isFinite(draft.bonus) ||
      draft.bonus < 0 ||
      draft.bonus > 10000 ||
      Object.values(draft.scores).some((n) => !Number.isFinite(n) || n < 0 || n > 100)
    ) {
      setError('请填写公司、岗位、城市，月薪 0–500K、月数 1–36、奖金 0–10000K，偏好评分 0–100。');
      return;
    }
    const item = {
      ...draft,
      company: draft.company.trim(),
      title: draft.title.trim(),
      id: draft.id || crypto.randomUUID(),
    };
    if (
      !setOffers((xs) =>
        xs.some((x) => x.id === item.id)
          ? xs.map((x) => (x.id === item.id ? item : x))
          : [...xs, item],
      )
    )
      return;
    setDraft(null);
  }
  function exportOffers() {
    const rows = [
      [
        '排名',
        '公司',
        '岗位',
        '城市',
        '保证年薪(万元)',
        ...dimensions.map((d) => `${d.name}(权重${d.weight})`),
        '加权得分',
        '截止日期',
        '备注',
      ],
      ...ranked.map((o, i) => [
        i + 1,
        o.company,
        o.title,
        o.city,
        annual(o).toFixed(1),
        ...dimensions.map((d) => (o.scores[d.id] ?? 0).toFixed(1)),
        o.total?.toFixed(2) ?? '权重为零',
        o.deadline,
        o.note,
      ]),
    ];
    downloadText(
      'Offer决策对比.csv',
      '\uFEFF' + rows.map((row) => row.map(csv).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Offer 决策"
        description="把事实与偏好放在同一张表里，比较每份机会的取舍。"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!offers.length} onClick={exportOffers}>
              导出对比 CSV
            </Button>
            <Button onClick={add}>新增 Offer</Button>
          </div>
        }
      />
      <DemoNotice>
        本地决策工具，不预测就业结果。保证年薪 = 月薪 × 月数 +
        保证奖金；薪酬得分按当前最高年薪归一化，其他维度由你打分。排名是偏好的计算结果。
      </DemoNotice>
      <Panel
        title="设置决策维度与权重"
        description="得分 = Σ（维度评分 × 权重）/ 总权重。新增维度时，已有 Offer 的初始评分为 50，建议逐项调整。"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dimensions.map((d) => (
            <div className="rounded-lg border p-3 space-y-3" key={d.id}>
              <div className="flex gap-2">
                <Input
                  aria-label={`${d.name}维度名称`}
                  value={d.name}
                  maxLength={30}
                  disabled={d.id === 'pay'}
                  onChange={(e) =>
                    setDimensions((xs) =>
                      xs.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                {d.id !== 'pay' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDimensions((xs) => xs.filter((x) => x.id !== d.id))}
                  >
                    删除
                  </Button>
                )}
              </div>
              <Field label={`${d.name || '自定义'}权重（0–100）`}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={d.weight}
                  onChange={(e) => {
                    const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setDimensions((xs) =>
                      xs.map((x) => (x.id === d.id ? { ...x, weight: value } : x)),
                    );
                  }}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                归一化占比 {weightSum ? ((d.weight / weightSum) * 100).toFixed(1) : 0}%
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            aria-label="新增维度名称"
            placeholder="新增维度，如稳定性"
            value={dimensionName}
            maxLength={30}
            onChange={(e) => setDimensionName(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              const name = dimensionName.trim();
              if (!name || dimensions.some((d) => d.name === name)) {
                setError('维度名称不能为空或重复');
                return;
              }
              const id = crypto.randomUUID();
              if (!setDimensions((xs) => [...xs, { id, name, weight: 10 }])) return;
              setOffers((xs) => xs.map((o) => ({ ...o, scores: { ...o.scores, [id]: 50 } })));
              setDimensionName('');
              setError('');
            }}
          >
            添加维度
          </Button>
          <Button variant="ghost" onClick={() => setDimensions(defaults)}>
            恢复默认权重与维度
          </Button>
        </div>
        {!weightSum && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            总权重为 0，无法计算排名。请设置至少一项正权重。
          </p>
        )}
        {error && !draft && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </Panel>
      <Panel title="Offer 排名与逐项比较">
        {!offers.length ? (
          <EmptyState
            kind="offers"
            title="还没有待比较的 Offer"
            description="添加公司、保证薪酬和个人偏好评分，开始比较每份机会。"
            action={<Button onClick={add}>添加第一份 Offer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    '排名',
                    '公司 / 岗位',
                    '保证年薪',
                    ...dimensions.map((d) => d.name || '未命名维度'),
                    '加权得分',
                    '操作',
                  ].map((x, i) => (
                    <th className="p-3" key={i}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((o, i) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-3">{weightSum ? i + 1 : '—'}</td>
                    <td className="p-3">
                      <strong>{o.company}</strong>
                      <p className="text-xs text-muted-foreground">
                        {o.title} · {o.city}
                      </p>
                      <p className="mt-2 text-xs">
                        {o.deadline ? `截止 ${o.deadline}` : '未设置截止日'}
                      </p>
                      {o.note && (
                        <p className="mt-1 max-w-48 whitespace-pre-wrap text-xs text-muted-foreground">
                          {o.note}
                        </p>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      {annual(o).toFixed(1)} 万
                      <p className="text-xs text-muted-foreground">
                        {o.base}K × {o.months} + {o.bonus}K
                      </p>
                    </td>
                    {dimensions.map((d) => (
                      <td className="p-3 font-mono" key={d.id}>
                        {(o.scores[d.id] ?? 0).toFixed(1)}
                      </td>
                    ))}
                    <td className="p-3 font-mono text-primary">
                      {o.total?.toFixed(2) ?? '待设置权重'}
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft(o);
                          setError('');
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOffers((xs) => xs.filter((x) => x.id !== o.id))}
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑 Offer' : '新增 Offer'}
        description="评分 0 表示不满意，100 表示非常满意；薪酬评分由年薪自动计算。"
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
              <div className="grid grid-cols-2 gap-3">
                {(['company', 'title', 'city', 'deadline'] as const).map((key, i) => (
                  <Field key={key} label={['公司', '岗位名称', '工作城市', '决策截止日'][i]}>
                    <Input
                      type={key === 'deadline' ? 'date' : 'text'}
                      value={draft[key]}
                      maxLength={100}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    />
                  </Field>
                ))}
                {(['base', 'months', 'bonus'] as const).map((key, i) => (
                  <Field key={key} label={['月薪（K）', '薪资月数', '保证奖金（K）'][i]}>
                    <Input
                      type="number"
                      step="0.1"
                      value={draft[key]}
                      onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                    />
                  </Field>
                ))}
              </div>
              <p className="rounded-lg bg-primary/5 p-3 text-sm">
                保证年薪：{annual(draft).toFixed(1)} 万元
              </p>
              <div className="grid grid-cols-2 gap-3">
                {dimensions
                  .filter((d) => d.id !== 'pay')
                  .map((d) => (
                    <Field key={d.id} label={`${d.name || '未命名维度'}评分（0–100）`}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.scores[d.id] ?? 50}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            scores: { ...draft.scores, [d.id]: Number(e.target.value) },
                          })
                        }
                      />
                    </Field>
                  ))}
              </div>
              <Field label="决策备注">
                <Input
                  value={draft.note}
                  maxLength={300}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存 Offer</Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

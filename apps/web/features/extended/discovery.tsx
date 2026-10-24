'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Bell, Copy, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  PageHeader,
  Panel,
  SmallTag,
  DemoNotice,
  CompanyLogo,
  EmptyState,
  StatCard,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { companies, jobs, getCompany } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import {
  collectHits,
  matchesSubscription,
  type SubscriptionFilter,
  type SubscriptionHit,
} from '@/lib/discovery-domain';
import { useValidatedArray } from './growth-local-state';
import { subscriptionSchema, referralRecordSchema } from '@/lib/growth-storage';
import { Field, Pick, Modal, Row } from './common';
type Rule = SubscriptionFilter & {
  id: string;
  name: string;
  frequency: string;
  enabled: boolean;
  channels: string[];
  hits: SubscriptionHit[];
};
const blankRule = (): Rule => ({
  id: '',
  name: '',
  role: '',
  city: '',
  company: '',
  type: '',
  education: '',
  keyword: '',
  frequency: '每日汇总',
  enabled: true,
  channels: ['站内'],
  hits: [],
});
export function SubscriptionsPage() {
  const notify = useRadarStore((s) => s.notify);
  const [items, setItems] = useValidatedArray<Rule>('subscriptions-v2', subscriptionSchema, []);
  const [draft, setDraft] = useState<Rule | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [error, setError] = useState('');
  const selected = items.find((x) => x.id === view);
  const matched = draft ? jobs.filter((job) => matchesSubscription(job, draft)) : [];
  function scan(id?: string) {
    const next = items.map((rule) =>
      !id || rule.id === id
        ? {
            ...rule,
            hits: collectHits(jobs, rule, rule.hits, new Date().toISOString(), rule.enabled),
          }
        : rule,
    );
    if (!setItems(next)) return;
    next.forEach((rule, i) => {
      const count = rule.hits.length - items[i].hits.length;
      if (count > 0 && rule.channels.includes('站内'))
        notify({
          title: `${rule.name} 命中 ${count} 个岗位`,
          content: '来自本地岗位条件匹配，查看订阅命中记录。',
          category: '岗位动态',
          href: '/subscriptions',
        });
    });
  }
  function save() {
    if (!draft?.name.trim()) {
      setError('请输入订阅名称');
      return;
    }
    const rule = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      hits: collectHits(jobs, draft, draft.hits, new Date().toISOString(), draft.enabled),
    };
    if (
      !setItems((list) =>
        list.some((x) => x.id === rule.id)
          ? list.map((x) => (x.id === rule.id ? rule : x))
          : [...list, rule],
      )
    )
      return;
    const added = rule.hits.length - draft.hits.length;
    if (added > 0 && rule.channels.includes('站内'))
      notify({
        title: `${rule.name} 命中 ${added} 个岗位`,
        content: '已根据保存的条件匹配本地岗位。',
        category: '岗位动态',
        href: '/subscriptions',
      });
    setDraft(null);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="订阅管理"
        description="组合岗位条件，检查本地岗位库里的新机会。"
        action={
          <Button
            onClick={() => {
              setDraft(blankRule());
              setError('');
            }}
          >
            <Plus className="size-4" />
            新建订阅
          </Button>
        }
      />
      <DemoNotice>
        匹配当前本地演示岗位；保存和手动检查时生成命中记录。提醒频率与邮件/推送为本地偏好，未连接后台定时任务或外部渠道。
      </DemoNotice>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="正在运行" value={items.filter((x) => x.enabled).length} icon={Bell} />
        <StatCard label="历史命中" value={items.reduce((n, x) => n + x.hits.length, 0)} />
        <StatCard
          label="未读命中"
          value={items.reduce((n, x) => n + x.hits.filter((h) => !h.read).length, 0)}
        />
      </div>
      <Panel
        title="我的订阅规则"
        action={
          <Button variant="outline" size="sm" onClick={() => scan()}>
            检查全部订阅
          </Button>
        }
      >
        {!items.length && (
          <EmptyState
            kind="subscriptions"
            title="还没有订阅信号"
            description="创建条件后可立即预览匹配岗位。"
            action={<Button onClick={() => setDraft(blankRule())}>创建订阅</Button>}
          />
        )}
        {items.map((rule) => (
          <Row key={rule.id} className="flex-wrap">
            <div className="space-y-2">
              <h2 className="font-medium">
                {rule.name} <SmallTag>{rule.enabled ? '运行中' : '已暂停'}</SmallTag>
              </h2>
              <p className="text-xs text-muted-foreground">
                {[
                  rule.role,
                  rule.city,
                  rule.type,
                  rule.education,
                  rule.company && getCompany(rule.company).name,
                  rule.keyword,
                ]
                  .filter(Boolean)
                  .join(' · ') || '所有岗位'}{' '}
                · {rule.frequency} · {rule.channels.join('/') || '不提醒'}
              </p>
              <p className="text-xs">
                当前匹配 {jobs.filter((j) => matchesSubscription(j, rule)).length} 个 · 已记录{' '}
                {rule.hits.length} 个
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setView(rule.id)}>
                命中记录
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((xs) =>
                    xs.map((x) => (x.id === rule.id ? { ...x, enabled: !x.enabled } : x)),
                  )
                }
              >
                {rule.enabled ? '暂停' : '恢复'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(rule);
                  setError('');
                }}
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== rule.id))}
              >
                删除
              </Button>
            </div>
          </Row>
        ))}
      </Panel>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑订阅' : '创建岗位订阅'}
        description="所有条件按且匹配；空条件表示不限。"
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
              <Field label="订阅名称">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  maxLength={80}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                {(['role', 'city', 'type', 'education'] as const).map((key, i) => (
                  <Field key={key} label={['岗位方向', '工作城市', '招聘类型', '学历要求'][i]}>
                    <select
                      className="h-10 rounded-md border bg-background px-2"
                      value={draft[key]}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    >
                      <option value="">不限</option>
                      {[...new Set(jobs.map((x) => x[key]))].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <Field label="公司">
                <select
                  className="h-10 rounded-md border bg-background px-2"
                  value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                >
                  <option value="">全部公司</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="岗位关键词">
                <Input
                  value={draft.keyword}
                  onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
                  placeholder="搜索标题、技能、职责与要求"
                />
              </Field>
              <Field label="提醒频率">
                <Pick
                  value={draft.frequency}
                  onChange={(frequency) => setDraft({ ...draft, frequency })}
                  options={['每日汇总', '即时提醒', '每周汇总']}
                />
              </Field>
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-2 text-xs text-muted-foreground">
                  渠道偏好（邮件、推送尚未接入）
                </legend>
                {['站内', '邮件', '浏览器推送'].map((channel) => (
                  <label key={channel} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.channels.includes(channel)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          channels: e.target.checked
                            ? [...draft.channels, channel]
                            : draft.channels.filter((x) => x !== channel),
                        })
                      }
                    />
                    {channel}
                  </label>
                ))}
              </fieldset>
              <div className="rounded-lg bg-primary/5 p-3 text-sm">
                当前条件命中 {matched.length} 个本地岗位
                <div className="mt-2 flex flex-wrap gap-2">
                  {matched.map((j) => (
                    <Link key={j.id} href={`/jobs/${j.id}`} className="underline">
                      {j.title} · {getCompany(j.companyId).name}
                    </Link>
                  ))}
                </div>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit">保存订阅</Button>
            </>
          )}
        </form>
      </Modal>
      <Modal
        open={!!selected}
        onClose={() => setView(null)}
        title={`${selected?.name ?? ''} · 命中记录`}
        description="同一规则下每个岗位只记录一次；暂停期间不产生新命中。"
      >
        <div className="flex gap-2">
          <Button size="sm" onClick={() => scan(view ?? undefined)}>
            检查新命中
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setItems((list) =>
                list.map((x) =>
                  x.id === view ? { ...x, hits: x.hits.map((h) => ({ ...h, read: true })) } : x,
                ),
              )
            }
          >
            全部标记已读
          </Button>
        </div>
        {!selected?.hits.length && (
          <p className="py-6 text-sm text-muted-foreground">暂无命中，调整条件或恢复订阅后检查。</p>
        )}
        {selected?.hits.map((hit) => (
          <Row key={hit.jobId}>
            <Link href={`/jobs/${hit.jobId}`} className="text-sm underline">
              {jobs.find((j) => j.id === hit.jobId)?.title ?? '岗位已移除'}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(hit.date).toLocaleString('zh-CN')}
              </p>
            </Link>
            <SmallTag>{hit.read ? '已读' : '未读'}</SmallTag>
          </Row>
        ))}
      </Modal>
    </div>
  );
}
const referralData = companies.slice(0, 4).map((c, i) => ({
  companyId: c.id,
  code: `DEMO-${c.id.toUpperCase()}2027`,
  title: `${c.name} 2027 校园招聘`,
  role: ['研发 / 产品 / 设计', '研发 / 算法 / 产品', '技术 / 业务 / 设计', '研发 / 数据 / 运营'][i],
  person: `${c.name}校友 · 虚构`,
  deadline: ['2026-10-28', '2026-11-02', '2026-11-08', '2026-11-15'][i],
}));
type ReferralRecord = {
  id: string;
  title: string;
  companyId: string;
  contact: string;
  stage: string;
  date: string;
  note: string;
};
const newReferral = (): ReferralRecord => ({
  id: '',
  title: '',
  companyId: companies[0].id,
  contact: '',
  stage: '准备联系',
  date: new Date().toISOString().slice(0, 10),
  note: '',
});
export function ReferralPage() {
  const [q, setQ] = useState('');
  const [company, setCompany] = useState('全部公司');
  const [direction, setDirection] = useState('全部方向');
  const [selected, setSelected] = useState<(typeof referralData)[number] | null>(null);
  const [records, setRecords] = useValidatedArray<ReferralRecord>(
    'referral-records-v2',
    referralRecordSchema,
    [],
  );
  const [draft, setDraft] = useState<ReferralRecord | null>(null);
  const [error, setError] = useState('');
  const filtered = referralData.filter(
    (x) =>
      (!q || `${x.title}${x.role}`.includes(q)) &&
      (company === '全部公司' || getCompany(x.companyId).name === company) &&
      (direction === '全部方向' || x.role.includes(direction)),
  );
  function save() {
    if (!draft?.title.trim() || !draft.date) {
      setError('请填写目标岗位和记录日期');
      return;
    }
    const item = { ...draft, id: draft.id || crypto.randomUUID() };
    if (
      !setRecords((xs) =>
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
        title="内推广场"
        description="筛选内推信息，独立记录自己的联系与投递进度。"
        action={
          <Button
            onClick={() => {
              setDraft(newReferral());
              setError('');
            }}
          >
            新增内推进度
          </Button>
        }
      />
      <DemoNotice>
        所有展示的联系人与内推码均为虚构样例。进度只保存在本机，不会向联系人发送任何信息。
      </DemoNotice>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="搜索公司或方向">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索内推" />
        </Field>
        <Field label="筛选公司">
          <Pick
            value={company}
            onChange={setCompany}
            options={['全部公司', ...companies.map((x) => x.name)]}
          />
        </Field>
        <Field label="筛选方向">
          <Pick
            value={direction}
            onChange={setDirection}
            options={['全部方向', '研发', '产品', '设计', '算法', '运营']}
          />
        </Field>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {filtered.map((x) => (
          <Panel key={x.code}>
            <div className="flex items-center gap-3">
              <CompanyLogo companyId={x.companyId} />
              <div>
                <h2 className="font-semibold">{x.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {x.role} · 截止 {x.deadline}
                </p>
              </div>
            </div>
            <div className="my-4 flex items-center justify-between rounded-lg bg-background p-3">
              <code className="text-sm text-primary">{x.code}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(x.code);
                    toast.success('已复制演示内推码');
                  } catch {
                    toast.error('复制失败，请手动选择内推码');
                  }
                }}
              >
                <Copy className="size-4" />
                复制
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(x)}>
                预览内推人
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setDraft({
                    ...newReferral(),
                    companyId: x.companyId,
                    title: x.title,
                    contact: x.person,
                  });
                  setError('');
                }}
              >
                记录我的进度
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState
          kind="referrals"
          title="没有匹配的内推"
          description="调整公司或方向筛选。"
          action={
            <Button
              onClick={() => {
                setQ('');
                setCompany('全部公司');
                setDirection('全部方向');
              }}
            >
              清空筛选
            </Button>
          }
        />
      )}
      <Panel title="我的内推进度" description="阶段由你手动记录；不代表平台已发送申请。">
        {!records.length && (
          <EmptyState
            kind="referrals"
            title="还没有个人内推进度"
            description="暂无记录，选择内推卡片或新增自己的联系记录。"
            action={
              <Button
                onClick={() => {
                  setDraft(newReferral());
                  setError('');
                }}
              >
                记录第一条内推进度
              </Button>
            }
          />
        )}
        {records.map((x) => (
          <Row key={x.id} className="flex-wrap">
            <div>
              <h3 className="text-sm font-medium">
                {getCompany(x.companyId).name} · {x.title}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {x.contact || '尚未填写联系人'} · {x.date} · {x.stage}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs">{x.note}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(x);
                  setError('');
                }}
              >
                编辑进度
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRecords((xs) => xs.filter((r) => r.id !== x.id))}
              >
                删除
              </Button>
            </div>
          </Row>
        ))}
      </Panel>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.person ?? '内推人'}
        description="虚构演示档案，无真实联系方式。"
      >
        <p className="text-sm leading-7">
          岗位范围：{selected?.role}
          <br />
          身份：校园招聘校友志愿者（演示）
          <br />
          准备资料：岗位链接、简历、项目说明。请通过官方渠道核验身份，内推不保证面试或录用。
        </p>
        <Button asChild variant="outline">
          <Link href={`/company/${selected?.companyId}`}>查看公司</Link>
        </Button>
      </Modal>
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑内推进度' : '新增内推进度'}
        description="保存本地记录，不发送联系请求。"
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
              <Field label="目标岗位">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={120}
                />
              </Field>
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
              <Field label="联系人备注">
                <Input
                  value={draft.contact}
                  onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
                />
              </Field>
              <Field label="进度">
                <Pick
                  value={draft.stage}
                  onChange={(stage) => setDraft({ ...draft, stage })}
                  options={['准备联系', '已自行联系', '已自行提交', '等待反馈', '面试中', '已结束']}
                />
              </Field>
              <Field label="记录日期">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="进度备注">
                <Textarea
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </Field>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button type="submit">保存进度</Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

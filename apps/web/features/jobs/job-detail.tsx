'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import {
  ArrowLeft,
  ArrowUpRight,
  MapPin,
  GraduationCap,
  Clock,
  Bookmark,
  Share2,
  Plus,
  CheckCircle2,
  Building2,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  ArrowRight,
  BriefcaseBusiness,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  Panel,
  CompanyLogo,
  SmallTag,
  MatchRing,
  DemoNotice,
  SectionLink,
  EmptyState,
} from '@/components/shared';
import { getJob, getCompany, jobs } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { deadlineDays } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { JobCard } from './jobs-page';
import styles from './jobs.module.css';
import { useAllExperiences } from '@/lib/knowledge-local';
import { useLocalJobProfile } from '@/lib/use-local-job-profile';
import { matchJob } from '@/lib/local-matching';
import { officialCareers } from '@/lib/official-careers';
export default function JobDetail({ id }: { id: string }) {
  const job = getJob(id);
  const { favorites, toggleFavorite, addApplication } = useRadarStore();
  const [tab, setTab] = useState('岗位详情');
  const router = useRouter();
  const allExperiences = useAllExperiences();
  const profile = useLocalJobProfile();
  if (!job)
    return (
      <Panel>
        <h1 className="text-xl my-6">未找到这个岗位</h1>
        <Button asChild>
          <Link href="/jobs">返回岗位广场</Link>
        </Button>
      </Panel>
    );
  const company = getCompany(job.companyId);
  const related = allExperiences.filter((e) => e.companyId === job.companyId);
  const matching = matchJob(job, profile);
  const portal = officialCareers[job.companyId];
  const radarData = matching.dimensions.map((d) => ({
    subject: d.value === null ? `${d.label}（未知）` : d.label,
    A: d.value ?? 0,
  }));
  const highlight = (text: string) => {
    const words = [...matching.matched].sort((a, b) => b.length - a.length);
    if (!words.length) return text;
    const regex = new RegExp(
      `(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
      'gi',
    );
    return text
      .split(regex)
      .map((part, i) =>
        words.some((word) => word.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i}>{part}</mark>
        ) : (
          part
        ),
      );
  };
  return (
    <>
      <button
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary mb-5"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push('/jobs');
        }}
      >
        <ArrowLeft className="size-3.5" />
        返回岗位列表
      </button>
      <div className={styles.detailLayout}>
        <div className="min-w-0">
          <div className={styles.detailHero}>
            <div className="flex items-center gap-4">
              <Link href={`/company/${company.id}`}>
                <CompanyLogo companyId={company.id} size="lg" />
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold">{job.title}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Link
                    href={`/company/${company.id}`}
                    className="text-foreground hover:text-primary"
                  >
                    {company.name}
                  </Link>
                  <span>·</span>
                  <span>{job.department}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="分享岗位"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast.success('岗位链接已复制');
                  } catch {
                    toast.error('复制失败，请从地址栏复制链接');
                  }
                }}
              >
                <Share2 />
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 items-center">
              <strong className="text-xl text-primary font-display">{job.salary}</strong>
              <span className="info-row">
                <MapPin className="size-3.5" />
                {job.city}
              </span>
              <span className="info-row">
                <GraduationCap className="size-3.5" />
                {job.education}及以上
              </span>
              <span className="text-xs text-muted-foreground">
                {job.requirements.join(' ').match(/20\d{2}\s*届/)?.[0] || '届别未明确'} · {job.type}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap mt-5">
              {job.tags.map((tag) => (
                <SmallTag active key={tag}>
                  {tag}
                </SmallTag>
              ))}
              <SmallTag>校园招聘</SmallTag>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => addApplication(job.id)}>
                <Plus />
                加入投递看板
              </Button>
              <Button variant="outline" onClick={() => toggleFavorite('job', job.id)}>
                <Bookmark
                  className={favorites.includes(`job:${job.id}`) ? 'fill-current text-primary' : ''}
                />
                {favorites.includes(`job:${job.id}`) ? '已收藏' : '收藏岗位'}
              </Button>
              {portal && (
                <Button variant="outline" asChild>
                  <a href={portal.url} target="_blank" rel="noopener noreferrer">
                    前往官方招聘门户
                    <ExternalLink size={14} />
                  </a>
                </Button>
              )}
              <span className="ml-auto flex gap-1.5 items-center text-[10px] text-warning">
                <Clock className="size-3.5" />
                {job.deadline
                  ? deadlineDays(job.deadline)! < 0
                    ? '样本岗位已截止'
                    : `距样本截止 ${deadlineDays(job.deadline)} 天`
                  : '截止时间未明确'}
              </span>
            </div>
          </div>
          <div className="panel mt-5">
            <div className="page-tabs px-6">
              {['岗位详情', '公司简介', '相关面经'].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === tab}
                  className={cn('page-tab', t === tab && 'active')}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === '岗位详情' ? (
              <div className={styles.detailSection}>
                <h2>你将在这里做什么</h2>
                <ul>
                  {job.description.map((v) => (
                    <li key={v}>{highlight(v)}</li>
                  ))}
                </ul>
                <h2>我们期待这样的你</h2>
                <ul>
                  {job.requirements.map((v) => (
                    <li key={v}>{highlight(v)}</li>
                  ))}
                </ul>
                <h2>加分项</h2>
                <ul>
                  <li>拥有独立完成的项目、开源贡献或实习经历。</li>
                  <li>对技术与产品充满好奇，能够主动沟通并推动问题解决。</li>
                </ul>
                <div className="mt-8 rounded-xl bg-raised/60 p-4 text-xs text-muted-foreground flex gap-3 leading-7">
                  <ShieldCheck className="size-4 shrink-0 mt-1 text-status-offer" />
                  <div>
                    本岗位为产品演示数据，非实时招聘信息。实际岗位、薪资和截止时间请以企业官方招聘网站为准。点击加入看板只创建本地记录，不会向企业提交简历。
                  </div>
                </div>
                {portal && (
                  <div className="mt-5 rounded-xl border border-border p-4 text-xs leading-7 text-muted-foreground">
                    <a
                      className="text-primary"
                      href={portal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {portal.label} · {new URL(portal.url).hostname}
                    </a>
                    <p>
                      仅提供企业公开招聘门户，不代表该样本岗位真实存在或仍在招聘。请自行查找并核验实际岗位；打开门户不会提交简历或改变本机投递阶段。
                    </p>
                  </div>
                )}
                <div className="flex justify-between items-center mt-6 text-[10px] text-subtle">
                  <span>来源：本站虚构岗位样本</span>
                  <span>演示时间：2026-10-23</span>
                </div>
              </div>
            ) : tab === '公司简介' ? (
              <div className={styles.detailSection}>
                <h2>
                  {company.name} · {company.en}
                </h2>
                <p className="text-sm text-muted-foreground leading-8">{company.description}</p>
                <div className="flex gap-2 my-5">
                  {company.tags.map((t) => (
                    <SmallTag key={t}>{t}</SmallTag>
                  ))}
                </div>
                <Button variant="outline" asChild>
                  <Link href={`/company/${company.id}`}>
                    查看完整公司情报
                    <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="px-6 pb-6">
                {related.map((e) => (
                  <Link
                    href={`/experiences/${e.id}`}
                    key={e.id}
                    className="block py-5 border-b last:border-0"
                  >
                    <h3 className="text-sm hover:text-primary">{e.title}</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-7">{e.excerpt}</p>
                    <div className="mt-2 text-[10px] text-subtle">
                      {e.author} · {e.readTime}
                    </div>
                  </Link>
                ))}
                {!related.length && (
                  <EmptyState
                    kind="knowledge"
                    title="这家公司还没有对应面经"
                    description="可以发布一篇本机面经，或按自己的方向浏览题库和知识手册。"
                    action={
                      <Button asChild variant="outline">
                        <Link href="/experiences">浏览面经广场</Link>
                      </Button>
                    }
                  />
                )}
              </div>
            )}
          </div>
          <div className="mt-6">
            <DemoNotice />
          </div>
        </div>
        <aside className="grid gap-5 content-start">
          <Panel title="你与岗位的契合度" action={<Sparkles className="size-4 text-primary" />}>
            <div className="flex items-center gap-4">
              {matching.score !== null ? (
                <MatchRing value={matching.score} size={66} />
              ) : (
                <span className="text-sm text-subtle">尚无匹配分</span>
              )}
              <div>
                <strong className="text-sm">值得探索的机会</strong>
                <p className="text-[10px] text-muted-foreground mt-1">
                  本机规则匹配，不代表能力评价或录用概率
                </p>
              </div>
            </div>
            <div className="h-[210px] flex items-center justify-center">
              {matching.score === null ? (
                <p className="text-xs leading-7 text-subtle">尚无可用于绘制雷达的画像信息。</p>
              ) : (
                <RadarChart width={260} height={210} outerRadius={66} data={radarData}>
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  />
                  <Radar
                    dataKey="A"
                    stroke="var(--color-primary)"
                    fill="var(--color-primary)"
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                </RadarChart>
              )}
            </div>
            <div className="flex items-start gap-2 text-[11px] leading-6 text-muted-foreground">
              <CheckCircle2 className="size-3.5 shrink-0 mt-1 text-status-offer" />
              {matching.matched.length
                ? `简历与岗位关键词交集：${matching.matched.join('、')}。`
                : profile.resumeText
                  ? '当前简历没有覆盖已识别的岗位关键词，可对照下方要求补充真实经历。'
                  : '尚未导入简历文字。完善本机画像后可查看关键词覆盖。'}
            </div>
            <div className="mt-5 space-y-3" aria-label="本机规则匹配依据">
              {matching.dimensions.map((d) => (
                <div key={d.id} className="text-xs leading-6">
                  <p className="flex justify-between">
                    <b>{d.label}</b>
                    <span>{d.value === null ? '未知' : `${d.value}%`}</span>
                  </p>
                  <p className="text-subtle">
                    {d.reason} · 权重 {d.weight}%
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-6 text-subtle">
              总分为已知维度的加权平均，未知维度不计入分母；仅做字面关键词与偏好比较，未核实技能熟练程度。已知{' '}
              {matching.dimensions.filter((d) => d.value !== null).length}/5 个维度。
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link href="/onboarding">完善本机画像</Link>
            </Button>
            <Button variant="outline" className="w-full mt-5" size="sm" asChild>
              <Link href="/resume-check">
                查看简历提升建议
                <ArrowRight />
              </Link>
            </Button>
          </Panel>
          <Panel title="关于这家公司">
            <div className="flex gap-3 items-center">
              <CompanyLogo companyId={company.id} />
              <div>
                <h3 className="font-medium text-sm">{company.name}</h3>
                <p className="text-[10px] text-subtle">{company.en}</p>
              </div>
            </div>
            <div className="grid gap-3 my-5 text-xs text-muted-foreground">
              <span className="flex gap-2 items-center">
                <Building2 className="size-3.5" />
                {company.industry} · {company.size}
              </span>
              <span className="flex gap-2 items-center">
                <BriefcaseBusiness className="size-3.5" />
                {jobs.filter((j) => j.companyId === company.id).length} 个演示在招岗位
              </span>
            </div>
            <SectionLink href={`/company/${company.id}`}>查看公司情报</SectionLink>
          </Panel>
          <Panel title="为这场面试做准备">
            <div className="grid gap-3">
              <Link
                href={`/pack/${company.slug}`}
                className="flex gap-3 items-center text-xs py-2 hover:text-primary"
              >
                <span className="size-8 grid place-content-center rounded-lg bg-primary/10 text-primary">
                  <BriefcaseBusiness className="size-4" />
                </span>
                {company.name}面经精选包
                <ArrowUpRight className="size-3 ml-auto" />
              </Link>
              <Link
                href={`/style/${company.slug}`}
                className="flex gap-3 items-center text-xs py-2 hover:text-primary"
              >
                <span className="size-8 grid place-content-center rounded-lg bg-purple/10 text-purple">
                  <Sparkles className="size-4" />
                </span>
                了解面试风格
                <ArrowUpRight className="size-3 ml-auto" />
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

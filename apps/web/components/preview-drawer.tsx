'use client';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  MapPin,
  GraduationCap,
  Clock,
  BriefcaseBusiness,
  Building2,
  ArrowRight,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CompanyLogo, MatchRing, SmallTag, DemoNotice } from '@/components/shared';
import { jobs, experiences, questions, getCompany } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { deadlineDays } from '@/lib/domain';
import { useAllExperiences } from '@/lib/knowledge-local';
import { useLocalJobProfile } from '@/lib/use-local-job-profile';
import { matchJob } from '@/lib/local-matching';
export function PreviewDrawer() {
  const cloud = process.env.NEXT_PUBLIC_DATA_MODE === 'api';
  const localExperiences = useAllExperiences();
  const profile = useLocalJobProfile();
  const params = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const preview = params.get('preview');
  const [type, id] = preview?.split(':') ?? [];
  const job = jobs.find((j) => j.id === id),
    experience = localExperiences.find((e) => e.id === id),
    question = questions.find((q) => q.id === id);
  const { favorites, toggleFavorite, addApplication } = useRadarStore();
  const score = cloud && job ? matchJob(job, profile).score : job?.match;
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete('preview');
    router.replace(`${pathname}${next.size ? '?' + next : ''}`, { scroll: false });
  };
  const exists =
    type === 'job'
      ? job
      : type === 'experience'
        ? experience
        : type === 'question'
          ? question
          : null;
  const detailHref =
    type === 'job'
      ? `/jobs/${id}`
      : type === 'experience'
        ? `/experiences/${id}`
        : `/questions?question=${id}`;
  return (
    <Sheet
      open={!!preview}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent className="p-0 gap-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-xs font-normal text-muted-foreground">
            {type === 'job' ? '岗位速览' : type === 'experience' ? '面经速览' : '题目速览'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            预览详情与关联内容，关闭后回到原列表。
          </SheetDescription>
        </SheetHeader>
        {!exists ? (
          <div className="p-8 text-muted-foreground">内容暂时不存在，请关闭预览后重新选择。</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {type === 'job' && job && (
                <>
                  <div className="flex gap-3 items-center mb-5">
                    <CompanyLogo companyId={job.companyId} size="lg" />
                    <div>
                      <Link
                        href={`/company/${job.companyId}`}
                        className="text-sm font-semibold hover:text-primary"
                      >
                        {getCompany(job.companyId).name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">{job.department}</p>
                    </div>
                    <div className="ml-auto">
                      {score === null || score === undefined ? <span className="text-xs text-subtle">待完善画像</span> : <MatchRing value={score} size={52} />}
                    </div>
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">{job.title}</h2>
                  <p className="text-primary font-display text-lg">{job.salary}</p>
                  <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
                    <span className="flex gap-1 items-center">
                      <MapPin className="size-3.5" />
                      {job.city}
                    </span>
                    <span className="flex gap-1 items-center">
                      <GraduationCap className="size-3.5" />
                      {job.education}
                    </span>
                    <span>
                      {job.graduationYears?.length
                        ? job.graduationYears.join('、') + '届'
                        : '届别未明确'}{' '}
                      · {job.type}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {job.tags.map((tag) => (
                      <SmallTag key={tag}>{tag}</SmallTag>
                    ))}
                  </div>
                  <div className="rounded-lg bg-primary/[.05] p-3 mt-6 flex gap-2 text-xs text-primary">
                    <Sparkles className="size-4 shrink-0" />
                    <span>
                      {cloud
                        ? '目录信息由来源记录提供，请核对原始岗位链接。匹配结果仅供准备参考。'
                        : '匹配度为演示评分。技能标签与偏好分析将在真实服务接入后提供。'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold mt-7 mb-3">岗位职责</h3>
                  <ul className="grid gap-3 text-xs text-muted-foreground leading-7">
                    {job.description.map((line, i) => (
                      <li key={line} className="flex gap-2">
                        <span className="text-subtle">{i + 1}.</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                  <h3 className="text-sm font-semibold mt-7 mb-3">任职要求</h3>
                  <ul className="grid gap-3 text-xs text-muted-foreground leading-7">
                    {job.requirements.map((line, i) => (
                      <li key={line} className="flex gap-2">
                        <span className="text-subtle">{i + 1}.</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 text-xs text-warning mt-6">
                    <Clock className="size-3.5" />
                    {job.deadline
                      ? `${job.deadline} 截止 · 剩余 ${deadlineDays(job.deadline)} 天${cloud ? '' : '（演示基准）'}`
                      : '截止时间暂未公布'}
                  </div>
                </>
              )}
              {type === 'experience' && experience && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <CompanyLogo companyId={experience.companyId} />
                    <div>
                      <p className="text-sm font-semibold">
                        {getCompany(experience.companyId).name} · {experience.role}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {experience.author} · {experience.readTime}
                      </p>
                    </div>
                  </div>
                  <h2 className="text-xl leading-relaxed font-semibold">{experience.title}</h2>
                  <p className="text-xs text-muted-foreground mt-4 leading-7">
                    {experience.excerpt}
                  </p>
                  {experience.sections.slice(0, 3).map((s) => (
                    <section key={s.title} className="mt-7">
                      <h3 className="font-semibold mb-2">{s.title}</h3>
                      <p className="text-xs leading-7 text-muted-foreground">{s.content}</p>
                    </section>
                  ))}
                </>
              )}
              {type === 'question' && question && (
                <>
                  <div className="flex gap-2 mb-5">
                    <SmallTag active>{question.topic}</SmallTag>
                    <SmallTag>{question.difficulty}</SmallTag>
                  </div>
                  <h2 className="text-xl leading-relaxed font-semibold">{question.title}</h2>
                  <p className="text-xs text-muted-foreground mt-4">
                    题库提及频次 {question.frequency}%
                  </p>
                  <h3 className="font-semibold mt-8 mb-3">参考思路</h3>
                  <p className="text-sm text-muted-foreground leading-8">{question.answer}</p>
                  <h3 className="font-semibold mt-8 mb-3">相关公司</h3>
                  <div className="flex gap-3">
                    {question.companies.map((c) => (
                      <Link key={c} href={`/company/${c}`}>
                        <CompanyLogo companyId={c} size="sm" />
                      </Link>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-8">
                <DemoNotice />
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t p-5">
              {(!cloud || type !== 'question') && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="收藏预览内容"
                  onClick={() => toggleFavorite(type, id)}
                >
                  <Bookmark
                    className={
                      favorites.includes(`${type}:${id}`) ? 'fill-current text-primary' : ''
                    }
                  />
                </Button>
              )}
              <Button variant="outline" className="flex-1" asChild>
                <Link href={detailHref}>
                  完整详情
                  <ArrowUpRight />
                </Link>
              </Button>
              {type === 'job' && job && (
                <Button className="flex-1" onClick={() => addApplication(job.id)}>
                  <Plus />
                  加入投递
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

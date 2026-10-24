'use client';
import Link from 'next/link';
import { Panel, EmptyState, SmallTag } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { questions } from '@/lib/data';
import { useAllExperiences } from '@/lib/knowledge-local';
import { styleSampleInsights } from '@/lib/growth-intelligence';
export function StyleSampleInsights({ companyId }: { companyId: string }) {
  const experiences = useAllExperiences();
  const data = styleSampleInsights(companyId, questions, experiences);
  const max = Math.max(1, ...data.topics.map((t) => t.count));
  return (
    <div className="space-y-6">
      <Panel
        title="考察点云图 · 本机样本"
        description={`${data.questionCount} 道关联题库题目、${data.experienceCount} 篇该公司面经。每条题目或每篇面经对同一知识点最多计数一次，字号按关联记录数变化。`}
      >
        {data.topics.length ? (
          <div
            className="flex min-h-32 flex-wrap items-center justify-center gap-x-6 gap-y-4 rounded-xl bg-background p-5"
            aria-label="考察点字云"
          >
            {data.topics.map((t) => (
              <Link
                key={t.name}
                href={`/questions?topic=${encodeURIComponent(t.name)}`}
                className="inline-flex items-baseline gap-1 rounded-md px-2 py-1 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
                style={{ fontSize: `${14 + (t.count / max) * 18}px` }}
                aria-label={`${t.name}，${t.count} 条关联记录，进入题库`}
              >
                {t.name}
                <span className="text-xs text-muted-foreground">{t.count}</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            kind="knowledge"
            title="暂无可统计的公司考察点"
            description="可以先阅读或发布一篇该公司的本机面经。"
            action={
              <Button asChild>
                <Link href="/experiences">浏览面经</Link>
              </Button>
            }
          />
        )}
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          面经通过正文/标签提及知识点进行关联；STAR
          归为行为面试。样本可能存在表达偏差，不代表企业标准、实际出题概率或官方结论。点击词语进入题库。
        </p>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-primary">查看云图计数依据</summary>
          <ul className="mt-3 space-y-2">
            {data.topics.map((t) => (
              <li key={t.name}>
                {t.name}：{t.questionCount} 道关联题目 + {t.experienceCount} 篇提及面经 = {t.count}{' '}
                条关联记录
              </li>
            ))}
          </ul>
        </details>
      </Panel>
      <Panel
        title="高频题榜 · 本机关联样本"
        description="按提及该题知识点/题目标题的公司面经篇数排序；并列时按题目名称排序。这里的计数是关联面经数量，不是实际出题次数。"
      >
        {data.ranked.length ? (
          <ol className="divide-y divide-border">
            {data.ranked.map((q, i) => (
              <li key={q.id}>
                <Link
                  href={`/questions?question=${q.id}`}
                  className="flex items-start gap-3 rounded-lg py-4 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{q.title}</h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {q.topic} · {q.difficulty} · {q.experienceCount} 篇关联面经
                    </p>
                  </div>
                  <SmallTag>进入题库</SmallTag>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            kind="questions"
            title="暂无该公司关联题目"
            description="可先查看全量本机题库，或结合面经准备。"
            action={
              <Button asChild>
                <Link href="/questions">浏览题库</Link>
              </Button>
            }
          />
        )}
      </Panel>
    </div>
  );
}

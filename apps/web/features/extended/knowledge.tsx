'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Sparkles, ArrowRight, Layers } from 'lucide-react';
import {
  PageHeader,
  Panel,
  DemoNotice,
  SmallTag,
  CompanyLogo,
  ProgressBar,
  FavoriteButton,
  EmptyState,
  CheckItem,
  PageTabs,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { questions, getCompany, chapters } from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { assessQuestion, selectPack, type Learning } from '@/lib/knowledge-domain';
import { useKnowledgeLocal, useAllExperiences, downloadKnowledge } from '@/lib/knowledge-local';
import { StyleSampleInsights } from './growth-style-insights';
import { Pick, Field, FilterButtons, Modal, Bullet } from './common';
import { useCampus } from '@/components/campus-provider';
export type PracticeCollection = {
  id: string;
  title: string;
  questionIds: string[];
  source: string;
};
export function QuestionsPage() {
  const { mode } = useCampus();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState(params.get('topic') || '全部知识点');
  const [difficulty, setDifficulty] = useState('全部难度');
  const [tab, setTab] = useState('全部题目');
  const [selected, setSelected] = useState<string | null>(params.get('question'));
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [session, setSession] = useState<string[]>([]);
  const [collection, setCollection] = useState(params.get('collection') || '全部题单');
  const [learning, saveLearning, error] = useKnowledgeLocal<Learning>('knowledge-learning', {
    mastery: {},
    wrong: [],
    attempts: {},
  });
  const [collections, saveCollections, collectionError] = useKnowledgeLocal<PracticeCollection[]>(
    'knowledge-collections',
    [],
  );
  const [answers, saveAnswers, answerError] = useKnowledgeLocal<Record<string, string>>(
    'knowledge-answers',
    {},
  );
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  useEffect(() => {
    setSelected(params.get('question'));
    setCollection(params.get('collection') || '全部题单');
  }, [params]);
  useEffect(() => {
    setRevealed(false);
    setAnswer(selected ? answers[selected] || '' : '');
  }, [selected, answers]);
  const activeCollection = collections.find((x) => x.id === collection);
  const filtered = questions.filter(
    (q) =>
      `${q.title}${q.topic}`.toLowerCase().includes(query.toLowerCase()) &&
      (topic === '全部知识点' || q.topic === topic) &&
      (difficulty === '全部难度' || q.difficulty === difficulty) &&
      (!activeCollection || activeCollection.questionIds.includes(q.id)) &&
      (tab === '全部题目' ||
        tab === '知识树' ||
        (tab === '我的收藏' && favorites.includes(`question:${q.id}`)) ||
        (tab === '错题本' && learning.wrong.includes(q.id)) ||
        (tab === '已掌握' && learning.mastery[q.id] === '已掌握')),
  );
  const item = questions.find((q) => q.id === selected);
  const mastered = questions.filter((q) => learning.mastery[q.id] === '已掌握').length;
  const grouped = [...new Set(filtered.map((q) => q.topic))];
  function start() {
    const ids = filtered.map((q) => q.id);
    setSession(ids);
    setSelected(ids[0] || null);
  }
  function clear() {
    setQuery('');
    setTopic('全部知识点');
    setDifficulty('全部难度');
    setTab('全部题目');
    setCollection('全部题单');
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="面试题库"
        description="把零散知识连成体系，把每一次练习变成积累。"
        action={
          <Button disabled={!filtered.length} onClick={start}>
            开始筛选结果练习
          </Button>
        }
      />
      {mode === 'mock' && (
        <DemoNotice>
          题目与频次为演示样本；练习、回答、自评与错题保存在本机。自评结果不会被当作客观能力评分。
        </DemoNotice>
      )}
      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        <div className="space-y-5">
          <Panel title="知识方向">
            {['全部知识点', ...new Set(questions.map((q) => q.topic))].map((t) => (
              <button
                key={t}
                className={`block w-full rounded-md p-3 text-left text-xs ${topic === t ? 'bg-primary/10 text-primary' : ''}`}
                onClick={() => setTopic(t)}
              >
                {t} ·{' '}
                {t === '全部知识点'
                  ? questions.length
                  : questions.filter((q) => q.topic === t).length}
              </button>
            ))}
          </Panel>
          <Panel title="练习进度">
            <p className="text-3xl">
              {mastered} / {questions.length}
            </p>
            <ProgressBar value={questions.length ? (mastered / questions.length) * 100 : 0} />
            <p className="mt-3 text-xs text-subtle">
              已练习 {Object.values(learning.attempts).reduce((a, b) => a + b, 0)} 次 · 错题{' '}
              {learning.wrong.length} 道
            </p>
          </Panel>
          <Panel title="我的练习集合">
            <select
              aria-label="练习集合"
              className="w-full rounded border border-border bg-background p-2 text-sm"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              <option>全部题单</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {activeCollection && (
              <Button
                className="mt-3"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await saveCollections((v) => v.filter((c) => c.id !== collection)))
                    setCollection('全部题单');
                }}
              >
                删除此题单
              </Button>
            )}
            {!collections.length && (
              <p className="mt-3 text-xs text-subtle">公司面经包或组队题单入库后会显示在这里。</p>
            )}
          </Panel>
        </div>
        <div>
          <PageTabs
            items={['全部题目', '我的收藏', '错题本', '已掌握', '知识树']}
            value={tab}
            onChange={setTab}
          />
          <div className="my-5 flex flex-wrap gap-3">
            <Input
              aria-label="搜索题目"
              placeholder="搜索题目或知识点"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Pick
              label="题目难度"
              value={difficulty}
              onChange={setDifficulty}
              options={['全部难度', '简单', '中等', '困难']}
            />
          </div>
          {(error || collectionError || answerError) && (
            <p role="alert">{error || collectionError || answerError}</p>
          )}
          <Panel title={`${filtered.length} 道题目`}>
            {!filtered.length ? (
              <EmptyState
                kind="questions"
                title={
                  tab === '错题本'
                    ? '错题本没有匹配题目'
                    : tab === '我的收藏'
                      ? '收藏中没有匹配题目'
                      : tab === '已掌握'
                        ? '还没有匹配的已掌握题目'
                        : '没有匹配的题目'
                }
                description={
                  mode === 'api' && !questions.length
                    ? '真实题目入库后会显示在这里。'
                    : '完成一次自评，或调整筛选继续学习。'
                }
                action={<Button onClick={clear}>查看全部题目</Button>}
              />
            ) : (
              (tab === '知识树' ? grouped : ['全部题目']).map((group) => (
                <div key={group}>
                  {tab === '知识树' && <h2 className="my-4 font-semibold">{group}</h2>}
                  {filtered
                    .filter((q) => tab !== '知识树' || q.topic === group)
                    .map((q) => (
                      <div key={q.id} className="flex gap-3 border-b border-border py-5">
                        <button
                          className="flex-1 text-left"
                          onClick={() => {
                            setSession([]);
                            setSelected(q.id);
                          }}
                        >
                          <h3 className="text-sm leading-7 hover:text-primary">{q.title}</h3>
                          <p className="mt-2 text-xs text-subtle">
                            {q.topic} · {q.difficulty} · {learning.mastery[q.id] || '未学习'} · 练习{' '}
                            {learning.attempts[q.id] || 0} 次
                          </p>
                        </button>
                        <FavoriteButton
                          active={favorites.includes(`question:${q.id}`)}
                          onClick={() => toggle('question', q.id)}
                        />
                      </div>
                    ))}
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
      <Modal
        open={!!item}
        onClose={() => setSelected(null)}
        title={item?.title || '题目详情'}
        description="先独立作答，查看参考要点后自评；不会调用外部 AI。"
      >
        {item && (
          <div className="space-y-5">
            <p className="text-xs text-subtle">
              {item.topic} · {item.difficulty}
              {session.length ? ` · 本轮 ${session.indexOf(item.id) + 1}/${session.length}` : ''}
            </p>
            <Field label="我的回答">
              <Textarea
                maxLength={10000}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="先试着说明结论、原理、例子与边界。"
              />
            </Field>
            <Button
              variant="outline"
              onClick={() => saveAnswers((v) => ({ ...v, [item.id]: answer }))}
            >
              保存我的回答
            </Button>
            <Button variant="outline" onClick={() => setRevealed((v) => !v)}>
              {revealed ? '收起参考答案' : '展示参考答案'}
            </Button>
            {revealed && (
              <div className="rounded-lg bg-background p-4">
                <h3 className="mb-3 text-sm">参考要点</h3>
                <p className="text-sm leading-8">{item.answer}</p>
              </div>
            )}
            <p className="text-xs text-subtle">
              练习 {learning.attempts[item.id] || 0} 次 · {learning.mastery[item.id] || '未学习'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!revealed}
                onClick={() => saveLearning((v) => assessQuestion(v, item.id, false))}
              >
                需要复习 · 加入错题
              </Button>
              <Button
                disabled={!revealed}
                onClick={() => saveLearning((v) => assessQuestion(v, item.id, true))}
              >
                已经掌握 · 移出错题
              </Button>
              <Button variant="outline" onClick={() => toggle('question', item.id)}>
                {favorites.includes(`question:${item.id}`) ? '取消收藏' : '收藏题目'}
              </Button>
            </div>
            {session.length > 0 && (
              <Button
                disabled={session.indexOf(item.id) >= session.length - 1}
                onClick={() => setSelected(session[session.indexOf(item.id) + 1])}
              >
                下一题
              </Button>
            )}
            {session.length > 0 && session.indexOf(item.id) === session.length - 1 && (
              <p className="text-sm text-primary">已到本轮最后一题，可关闭返回题库查看学习进度。</p>
            )}
            {(error || answerError) && <p role="alert">{error || answerError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
export function StylePage({ company: slug }: { company: string }) {
  const { mode } = useCampus();
  const company = getCompany(slug);
  const [active, setActive] = useState('技术一面');
  if (mode === 'api')
    return (
      <EmptyState
        kind="knowledge"
        title="暂无真实面试风格情报"
        description="当前尚未接入可核验的面试维度与频次数据。你可以先整理自己的面试复盘。"
        action={
          <Button asChild variant="outline">
            <Link href="/experiences">浏览面经</Link>
          </Button>
        }
      />
    );
  const dimensions =
    active === '技术一面'
      ? [
          { name: '基础原理', value: 92 },
          { name: '项目深挖', value: 86 },
          { name: '编码实践', value: 78 },
          { name: '系统设计', value: 52 },
        ]
      : active === '技术二面'
        ? [
            { name: '基础原理', value: 76 },
            { name: '项目深挖', value: 94 },
            { name: '编码实践', value: 68 },
            { name: '系统设计', value: 90 },
          ]
        : [
            { name: '沟通表达', value: 90 },
            { name: '职业规划', value: 86 },
            { name: '团队协作', value: 88 },
            { name: '岗位动机', value: 92 },
          ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${company.name} · 面试风格`}
        description="了解关注点，准备有深度的回答。"
        action={
          <Button asChild variant="outline">
            <Link href={`/company/${company.id}`}>公司主页</Link>
          </Button>
        }
      />
      <DemoNotice>
        以下关注点、维度与比例均为演示样本，不代表企业实际面试标准或官方结论。
      </DemoNotice>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center gap-5">
              <CompanyLogo companyId={company.id} size="lg" />
              <div>
                <h2 className="text-xl font-semibold">{company.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  前端开发 · 2027 校园招聘 · 演示观察
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-sm leading-8 text-muted-foreground">
              从基础出发，围绕真实项目逐层追问。比起记住技术名词，更关注能否解释原理、说明取舍，并展示验证过程。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <SmallTag>原理理解</SmallTag>
              <SmallTag>工程思维</SmallTag>
              <SmallTag>表达清晰</SmallTag>
            </div>
          </Panel>
          <Panel title="不同轮次的关注点">
            <PageTabs
              items={['技术一面', '技术二面', 'HR 面试']}
              value={active}
              onChange={setActive}
            />
            <div className="mt-6 space-y-5">
              {dimensions.map((d) => (
                <div key={d.name}>
                  <div className="mb-3 flex justify-between text-xs">
                    <span>{d.name}</span>
                    <span className="font-mono text-muted-foreground">{d.value} / 100 · 演示</span>
                  </div>
                  <ProgressBar value={d.value} color="purple" />
                </div>
              ))}
            </div>
          </Panel>
          <StyleSampleInsights companyId={company.id} />
          <Panel title="把准备落实到回答里">
            <ul className="space-y-3">
              <Bullet>基础题：说清核心机制，再用代码或场景说明边界。</Bullet>
              <Bullet>项目题：围绕目标、约束、方案、证据和反思组织故事。</Bullet>
              <Bullet>追问题：允许思考，先明确假设，再解释判断过程。</Bullet>
            </ul>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="准备清单">
            {[
              '整理一个可深挖的项目',
              '用代码复现事件循环',
              '回顾性能定位与验证',
              '准备两个高质量反问',
            ].map((x) => (
              <StyleCheck key={x} id={`${slug}-${x}`} text={x} />
            ))}
          </Panel>
          <Panel title="继续准备">
            <Button className="w-full" asChild>
              <Link href={`/pack/${slug}`}>
                <Layers className="size-4" />
                公司面经包
              </Link>
            </Button>
            <Button className="mt-3 w-full" variant="outline" asChild>
              <Link href="/mock">
                <Sparkles className="size-4" />
                进入模拟练习
              </Link>
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
function StyleCheck({ id, text }: { id: string; text: string }) {
  const completed = useRadarStore((s) => s.completed.includes(id));
  const toggle = useRadarStore((s) => s.toggleCompleted);
  return (
    <CheckItem checked={completed} onChange={() => toggle(id)}>
      {text}
    </CheckItem>
  );
}
export function PackPage({ company: slug }: { company: string }) {
  const { mode } = useCampus();
  const company = getCompany(slug);
  const all = useAllExperiences();
  const [role, setRole] = useState('全部方向');
  const [difficulty, setDifficulty] = useState('全部难度');
  const [includeExperiences, setIncludeExperiences] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [tab, setTab] = useState('面经精选');
  const [collections, saveCollections, error] = useKnowledgeLocal<PracticeCollection[]>(
    'knowledge-collections',
    [],
  );
  const [status, setStatus] = useState('');
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  const pack = selectPack(company.id, role, difficulty, all, questions);
  const relevant = includeExperiences ? pack.experiences : [];
  const related = includeQuestions ? pack.questions : [];
  const collectionId = `pack-${company.id}-${role}-${difficulty}`;
  async function save() {
    setStatus('');
    const ok = await saveCollections((v) => [
      ...v.filter((c) => c.id !== collectionId),
      {
        id: collectionId,
        title: `${company.name} · ${role} · ${difficulty}`,
        questionIds: related.map((q) => q.id),
        source: '公司面经包',
      },
    ]);
    if (!ok) return;
    for (const e of relevant)
      if (!favorites.includes(`experience:${e.id}`) && (await toggle('experience', e.id)) === false)
        return;
    for (const q of related)
      if (!favorites.includes(`question:${q.id}`) && (await toggle('question', q.id)) === false)
        return;
    setStatus(`已入库：${relevant.length} 篇面经收藏、${related.length} 道题目与练习集合`);
  }
  if (!company.id)
    return (
      <EmptyState
        kind="knowledge"
        title="未找到这家公司的资料"
        description="真实企业入库后可查看对应面经包。"
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${company.name} · 面经包`}
        description={
          mode === 'api' ? '围绕目标公司整理账号中的准备资料。' : '围绕目标公司整理本机准备资料。'
        }
        action={
          <Button asChild variant="outline">
            <Link href={`/style/${slug}`}>查看面试风格</Link>
          </Button>
        }
      />
      {mode === 'mock' && (
        <DemoNotice>公司资料与面经均为样本。只展示匹配内容；未收录时会保留空状态。</DemoNotice>
      )}
      <Panel title="配置我的面经包">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="面经包岗位方向">
            <Pick
              label="面经包岗位方向"
              value={role}
              onChange={(v) => {
                setRole(v);
                setStatus('');
              }}
              options={['全部方向', '前端开发', '后端开发', '产品经理', '算法工程师']}
            />
          </Field>
          <Field label="面经包题目难度">
            <Pick
              label="面经包题目难度"
              value={difficulty}
              onChange={(v) => {
                setDifficulty(v);
                setStatus('');
              }}
              options={['全部难度', '简单', '中等', '困难']}
            />
          </Field>
        </div>
        <div className="my-5 flex flex-wrap gap-5">
          <label className="text-sm">
            <input
              type="checkbox"
              checked={includeExperiences}
              onChange={(e) => setIncludeExperiences(e.target.checked)}
            />{' '}
            包含面经
          </label>
          <label className="text-sm">
            <input
              type="checkbox"
              checked={includeQuestions}
              onChange={(e) => setIncludeQuestions(e.target.checked)}
            />{' '}
            包含题单
          </label>
        </div>
        <p className="mb-4 text-sm">
          {relevant.length} 篇面经 · {related.length} 道题目
        </p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={!relevant.length && !related.length} onClick={save}>
            一键收藏与题单入库
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadKnowledge(
                `${company.name}-面经包.md`,
                `# ${company.name} 面经包\n${role} / ${difficulty}\n\n${relevant.map((e) => `## ${e.title}\n${e.sections.map((s) => s.content).join('\n')}`).join('\n\n')}\n\n${related.map((q) => `## ${q.title}\n${q.answer}`).join('\n\n')}`,
              )
            }
          >
            导出当前资料包
          </Button>
          {collections.some((c) => c.id === collectionId) && (
            <Button asChild variant="outline">
              <Link href={`/questions?collection=${encodeURIComponent(collectionId)}`}>
                打开入库练习集合
              </Link>
            </Button>
          )}
        </div>
        {status && (
          <p role="status" className="mt-4 text-sm text-primary">
            {status}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </Panel>
      <PageTabs items={['面经精选', '高频题单', '知识补全']} value={tab} onChange={setTab} />
      <Panel title={tab}>
        {tab === '面经精选' ? (
          relevant.length ? (
            relevant.map((e) => (
              <div key={e.id} className="border-b border-border py-5">
                <Link href={`/experiences/${e.id}`} className="font-medium text-primary">
                  {e.title}
                </Link>
                <p className="mt-3 text-xs leading-7 text-subtle">{e.excerpt}</p>
              </div>
            ))
          ) : (
            <EmptyState
              kind="knowledge"
              title="当前配置没有面经"
              description="调整方向或启用包含面经；当前企业尚未收录时不会替换为其他公司内容。"
            />
          )
        ) : tab === '高频题单' ? (
          related.length ? (
            related.map((q) => (
              <Link
                key={q.id}
                href={`/questions?question=${q.id}`}
                className="block border-b border-border py-5 text-sm text-primary"
              >
                {q.title} · {q.difficulty}
              </Link>
            ))
          ) : (
            <EmptyState
              kind="questions"
              title="当前配置没有题目"
              description="调整难度、方向或启用包含题单。"
            />
          )
        ) : (
          chapters.map((c) => (
            <Link
              key={c.id}
              href={`/handbook?chapter=${c.id}`}
              className="block border-b border-border py-5 text-sm text-primary"
            >
              {c.title}
            </Link>
          ))
        )}
      </Panel>
    </div>
  );
}

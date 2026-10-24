'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  PenLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CompanyLogo,
  DemoNotice,
  EmptyState,
  FavoriteButton,
  PageHeader,
  PageTabs,
  Panel,
  ProgressBar,
  SmallTag,
} from '@/components/shared';
import {
  chapters,
  companies,
  experiences,
  getCompany,
  questions,
  type Experience,
} from '@/lib/data';
import { useRadarStore } from '@/lib/store';
import { useKnowledgeLocal, downloadKnowledge } from '@/lib/knowledge-local';
import { buildExperience, summarizeExperience, type ExperienceDraft } from '@/lib/knowledge-domain';
import { Modal, Field, Pick } from '@/features/extended/common';
import { LocalDiscussion } from './local-discussion';
import s from './knowledge.module.css';
const emptyDraft: ExperienceDraft = {
  title: '',
  content: '',
  companyId: 'tencent',
  role: '前端开发',
  round: '一面',
  tags: '',
};
function ExperienceEditor({
  initial,
  onSave,
  onClose,
}: {
  initial?: Experience;
  onSave: (value: Experience) => boolean;
  onClose: () => void;
}) {
  const [saved, saveDraft, storageError, ready] = useKnowledgeLocal<ExperienceDraft>(
    `knowledge-draft-${initial?.id ?? 'new'}`,
    initial
      ? {
          title: initial.title,
          content: initial.sections.map((x) => x.content).join('\n\n'),
          companyId: initial.companyId,
          role: initial.role,
          round: initial.round,
          tags: initial.tags.join(','),
        }
      : emptyDraft,
  );
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const name = useRadarStore((s) => s.userName);
  useEffect(() => {
    if (ready) setDraft(saved);
  }, [ready, saved]);
  function field(key: keyof ExperienceDraft, value: string) {
    setDraft((v) => ({ ...v, [key]: value }));
    setStatus('有未保存修改');
  }
  function publish() {
    try {
      const value = buildExperience(
        draft,
        initial?.author ?? name,
        initial?.id ?? `local-exp-${crypto.randomUUID()}`,
      );
      if (onSave(value)) {
        saveDraft(emptyDraft);
        onClose();
      } else {
        setError('保存失败：浏览器存储不可用或空间不足。编辑内容已保留，请释放空间后重试。');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? '编辑我的面经' : '写下你的面试复盘'}
      description="在本机发布后可从广场和详情阅读；关闭前可保存草稿。不会公开至网络。"
    >
      <div className="space-y-4">
        <Field label="面经标题">
          <Input
            value={draft.title}
            maxLength={100}
            onChange={(e) => field('title', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="面经企业">
            <select
              className={s.select}
              value={draft.companyId}
              onChange={(e) => field('companyId', e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="面经方向">
            <Pick
              label="面经方向"
              value={draft.role}
              onChange={(v) => field('role', v)}
              options={['前端开发', '后端开发', '产品经理', '算法工程师']}
            />
          </Field>
          <Field label="面经轮次">
            <Pick
              label="面经轮次"
              value={draft.round}
              onChange={(v) => field('round', v)}
              options={['笔试', '一面', '二面', '三面', 'HR面']}
            />
          </Field>
        </div>
        <Field label="知识标签（逗号分隔）">
          <Input
            value={draft.tags}
            maxLength={160}
            onChange={(e) => field('tags', e.target.value)}
          />
        </Field>
        <Field label="复盘内容">
          <Textarea
            value={draft.content}
            maxLength={20000}
            className="min-h-52"
            onChange={(e) => field('content', e.target.value)}
            placeholder="按空行拆分复盘段落，至少 10 字。"
          />
        </Field>
        <p className="text-xs text-subtle">
          {draft.content.length} / 20000 · {status || '草稿可保存至本机'}
        </p>
        {(error || storageError) && (
          <p role="alert" className="text-destructive text-sm">
            {error || storageError}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (saveDraft(draft)) setStatus('草稿已保存');
            }}
          >
            保存本地草稿
          </Button>
          <Button onClick={publish}>{initial ? '保存面经修改' : '发布到本机广场'}</Button>
        </div>
      </div>
    </Modal>
  );
}
export function ExperiencesPage() {
  const [local, save, error] = useKnowledgeLocal<Experience[]>('knowledge-experiences', []);
  const [tab, setTab] = useState('为你推荐');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('全部方向');
  const [company, setCompany] = useState('全部企业');
  const [round, setRound] = useState('全部轮次');
  const [sort, setSort] = useState('最新发布');
  const [publish, setPublish] = useState(false);
  const [limit, setLimit] = useState(6);
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  const all = [...local, ...experiences];
  const filtered = all
    .filter(
      (e) =>
        (role === '全部方向' || e.role === role) &&
        (company === '全部企业' || e.companyId === company) &&
        (round === '全部轮次' || e.round === round) &&
        (tab !== '我的收藏' || favorites.includes(`experience:${e.id}`)) &&
        (tab !== '我的发布' || local.some((x) => x.id === e.id)) &&
        `${e.title}${e.excerpt}${e.tags.join('')}${getCompany(e.companyId).name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => (sort === '最多阅读' || tab === '热门面经' ? b.views - a.views : 0));
  return (
    <>
      <PageHeader
        title="面经广场"
        description="前人的每一次复盘，都是你下一次面试的底气。"
        action={
          <Button onClick={() => setPublish(true)}>
            <PenLine size={14} />
            写一篇面经
          </Button>
        }
      />
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <SmallTag active>本周精选 · 演示内容</SmallTag>
          <Link href="/experiences/exp-1">
            <h2>
              腾讯 WXG 前端三面复盘：
              <br />
              从原理到工程实践
            </h2>
          </Link>
          <p>
            基础讲清楚，项目讲透彻。看一次完整的面试复盘，
            <br className="hidden lg:block" />
            为下一场对话做好准备。
          </p>
          <div className={s.heroMeta}>
            <span>一颗努力的栗子</span>
            <span>8 分钟阅读</span>
            <Link href="/experiences/exp-1" className="text-primary inline-flex gap-1 items-center">
              开始阅读 <ArrowRight size={12} />
            </Link>
          </div>
        </div>
        <div className={s.heroVisual}>
          <div className={s.quote}>
            “基础问题做到能举例，
            <br />
            项目描述做到有证据。”
          </div>
          <small>摘自精选面经 · 校招雷达演示样本</small>
          <div className="flex gap-2 ml-5 mt-5">
            {['React', '浏览器原理', '项目深挖'].map((t) => (
              <SmallTag key={t}>{t}</SmallTag>
            ))}
          </div>
        </div>
      </section>
      <DemoNotice>
        精选资料为虚构样本；你的面经在当前浏览器发布、编辑与阅读，不会公开到网络。
      </DemoNotice>
      <PageTabs
        items={['为你推荐', '热门面经', '我的收藏', '我的发布']}
        value={tab}
        onChange={setTab}
      />
      <div className={s.filters}>
        <Input
          aria-label="搜索面经"
          placeholder="搜索企业、关键词或知识点"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Pick
          label="岗位方向"
          value={role}
          onChange={setRole}
          options={['全部方向', ...new Set(all.map((e) => e.role))]}
        />
        <Field label="企业">
          <select
            className={s.select}
            aria-label="企业"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option>全部企业</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Pick
          label="面试轮次"
          value={round}
          onChange={setRound}
          options={['全部轮次', ...new Set(all.map((e) => e.round))]}
        />
        <Pick label="面经排序" value={sort} onChange={setSort} options={['最新发布', '最多阅读']} />
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="my-4 text-xs text-subtle">发现 {filtered.length} 篇相关面经</p>
      {filtered.length ? (
        <div className={s.grid}>
          {filtered.slice(0, limit).map((e) => (
            <article key={e.id} className={s.card}>
              <div className={s.cardTop}>
                <div className="flex justify-between gap-3">
                  <CompanyLogo companyId={e.companyId} size="sm" />
                  <SmallTag>
                    {local.some((x) => x.id === e.id) ? '我的本机面经' : '演示样本'}
                  </SmallTag>
                  <FavoriteButton
                    active={favorites.includes(`experience:${e.id}`)}
                    onClick={() => toggle('experience', e.id)}
                  />
                </div>
                <p className="mt-3 text-xs text-subtle">
                  {getCompany(e.companyId).name} · {e.role} · {e.round}
                </p>
                <Link href={`/experiences/${e.id}`}>
                  <h3>{e.title}</h3>
                  <p>{e.excerpt}</p>
                </Link>
                <div className={s.tags}>
                  {e.tags.map((t) => (
                    <button key={t} onClick={() => setSearch(t)}>
                      <SmallTag>{t}</SmallTag>
                    </button>
                  ))}
                </div>
                <div className={s.author}>
                  {e.author}
                  <span className="ml-auto">{e.date}</span>
                </div>
              </div>
              <div className={s.cardFooter}>
                <span>
                  {e.views} 阅读 · {e.readTime}
                </span>
                <Link href={`/experiences/${e.id}`}>阅读全文 →</Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          kind="knowledge"
          title={
            tab === '我的发布'
              ? '还没有发布面经'
              : tab === '我的收藏'
                ? '还没有符合筛选的收藏'
                : '还没有符合条件的面经'
          }
          description="写下你的经历，或清空筛选继续探索。"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setRole('全部方向');
                setCompany('全部企业');
                setRound('全部轮次');
                setTab('为你推荐');
              }}
            >
              清空筛选
            </Button>
          }
        />
      )}
      <div className="my-6 text-center">
        {limit < filtered.length && (
          <Button variant="outline" onClick={() => setLimit((v) => v + 6)}>
            加载更多面经
          </Button>
        )}
      </div>
      {publish && (
        <ExperienceEditor
          onClose={() => setPublish(false)}
          onSave={(value) => save((v) => [value, ...v])}
        />
      )}
    </>
  );
}
export function ExperienceDetail({ id }: { id: string }) {
  const [local, save, error, ready] = useKnowledgeLocal<Experience[]>('knowledge-experiences', []);
  const [likes, setLikes, likeError] = useKnowledgeLocal<string[]>('experience-likes', []);
  const [summaries, saveSummaries, summaryError] = useKnowledgeLocal<Record<string, string>>(
    'experience-summaries',
    {},
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const favorites = useRadarStore((s) => s.favorites);
  const toggle = useRadarStore((s) => s.toggleFavorite);
  const exp = [...local, ...experiences].find((e) => e.id === id);
  if (!ready && id.startsWith('local-exp-')) return <p role="status">正在读取本机面经…</p>;
  if (!exp)
    return (
      <EmptyState
        kind="knowledge"
        title="这篇面经还未收录或已经删除"
        description="返回面经广场继续发现内容。"
        action={
          <Button asChild>
            <Link href="/experiences">返回面经广场</Link>
          </Button>
        }
      />
    );
  const mine = local.some((x) => x.id === id);
  const related = questions.filter((q) =>
    exp.tags.some((t) => `${q.title}${q.topic}`.toLowerCase().includes(t.toLowerCase())),
  );
  return (
    <>
      <Link href="/experiences" className="inline-flex gap-2 text-xs text-muted-foreground mb-5">
        <ArrowLeft size={13} />
        返回面经广场
      </Link>
      <div className={s.articleLayout}>
        <article className={s.article}>
          <div className="flex justify-between">
            <CompanyLogo companyId={exp.companyId} />
            <SmallTag>{mine ? '我的本机面经' : '演示面经'}</SmallTag>
          </div>
          <h1>{exp.title}</h1>
          <p className="text-xs text-subtle">
            {getCompany(exp.companyId).name} · {exp.role} · {exp.round} · {exp.author} · {exp.date}
          </p>
          <div className={s.tags}>
            {exp.tags.map((t) => (
              <SmallTag key={t}>{t}</SmallTag>
            ))}
          </div>
          <div className={s.summary}>
            <h3>本地规则摘要</h3>
            <p>从正文各段提取最多两句，优先保留问题、行动与改进句。</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveSummaries((v) => ({ ...v, [id]: summarizeExperience(exp) }))}
            >
              一键提炼正文重点
            </Button>
            {summaries[id] && <p className="whitespace-pre-wrap">{summaries[id]}</p>}
          </div>
          <div className="article-content">
            {exp.sections.map((sec, i) => (
              <section id={`section-${i}`} key={i} className="scroll-mt-24">
                <h2>{sec.title}</h2>
                <p className="whitespace-pre-wrap break-words">{sec.content}</p>
              </section>
            ))}
          </div>
          <div className="my-7 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() =>
                setLikes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
              }
            >
              {likes.includes(id) ? '取消点赞' : '点赞'} · {exp.likes + Number(likes.includes(id))}
            </Button>
            <Button variant="outline" onClick={() => toggle('experience', id)}>
              {favorites.includes(`experience:${id}`) ? '已收藏' : '收藏面经'}
            </Button>
            {mine && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  编辑面经
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(true)}>
                  删除面经
                </Button>
              </>
            )}
          </div>
          {(error || likeError || summaryError) && (
            <p role="alert">{error || likeError || summaryError}</p>
          )}
          <LocalDiscussion id={`experience-${id}`} />
        </article>
        <aside className={s.articleToc}>
          <p className="mb-4 text-xs font-semibold">本篇目录</p>
          <nav className={s.toc}>
            {exp.sections.map((sec, i) => (
              <a href={`#section-${i}`} key={i}>
                {sec.title}
              </a>
            ))}
          </nav>
          <Panel title="关联题库">
            {related.length ? (
              related.map((q) => (
                <Link
                  key={q.id}
                  href={`/questions?question=${q.id}`}
                  className="block py-3 text-xs leading-6 text-primary"
                >
                  {q.title}
                </Link>
              ))
            ) : (
              <p className="text-xs leading-6 text-subtle">
                还没有与标签匹配的题目。可在题库按知识点探索。
              </p>
            )}
            <Button asChild variant="outline" className="mt-3">
              <Link href="/questions">浏览题库</Link>
            </Button>
          </Panel>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/handbook">打开知识手册</Link>
          </Button>
        </aside>
      </div>
      {editing && (
        <ExperienceEditor
          initial={exp}
          onClose={() => setEditing(false)}
          onSave={(value) => {
            const ok = save((v) => v.map((x) => (x.id === id ? value : x)));
            if (ok)
              saveSummaries((v) => {
                const next = { ...v };
                delete next[id];
                return next;
              });
            return ok;
          }}
        />
      )}
      <Modal open={deleting} onClose={() => setDeleting(false)} title="删除这篇本机面经？">
        <p className="text-sm leading-7">删除后将从本机广场移除。收藏入口也将清除。</p>
        <Button
          onClick={() => {
            if (save((v) => v.filter((x) => x.id !== id))) {
              if (favorites.includes(`experience:${id}`)) toggle('experience', id);
              setDeleting(false);
            }
          }}
        >
          确认删除面经
        </Button>
      </Modal>
      <div className="mt-6">
        <DemoNotice>
          {mine
            ? '这篇内容由你在本机编写，只有当前浏览器可见。'
            : '本文为虚构产品样本，不代表真实面试经历。'}
        </DemoNotice>
      </div>
    </>
  );
}
export function HandbookPage() {
  const [active, setActive] = useState(chapters[0].id);
  const [section, setSection] = useState(0);
  const [query, setQuery] = useState('');
  const completed = useRadarStore((s) => s.completed);
  const toggleCompleted = useRadarStore((s) => s.toggleCompleted);
  const favorites = useRadarStore((s) => s.favorites);
  const toggleFavorite = useRadarStore((s) => s.toggleFavorite);
  const legacyNotes = useRadarStore((s) => s.notes);
  const [notes, saveNotes, noteError] = useKnowledgeLocal<Record<string, string>>(
    'handbook-notes',
    legacyNotes,
  );
  const [noteDraft, setNoteDraft] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [templates, saveTemplates, templateError] = useKnowledgeLocal<Record<string, string>>(
    'handbook-templates',
    {},
  );
  const [templateDraft, setTemplateDraft] = useState('');
  useEffect(() => {
    setNoteDraft(notes[`chapter:${active}`] || '');
  }, [active, notes]);
  useEffect(() => {
    setTemplateDraft(templates[active] || '');
  }, [active, templates]);
  useEffect(() => {
    setNoteStatus('');
  }, [active]);
  const chapter = chapters.find((x) => x.id === active) || chapters[0];
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('chapter');
    if (chapters.some((x) => x.id === id)) setActive(id!);
  }, []);
  const selectedIndex = chapters.findIndex((x) => x.id === active);
  function choose(id: string) {
    setActive(id);
    setSection(0);
    window.history.replaceState({}, '', `/handbook?chapter=${id}`);
  }
  const progress = chapters.filter((c) => completed.includes(c.id)).length;
  return (
    <>
      <PageHeader
        title="知识手册"
        description="把零散知识连成体系，给每一次面试多一分底气。"
        action={
          <SmallTag active>
            {progress} / {chapters.length} 章已完成
          </SmallTag>
        }
      />
      <div className={s.handbook}>
        <aside className={s.tree}>
          <div className={s.treeHeader}>
            <h2 className="flex gap-2 items-center">
              <BookOpen size={16} className="text-primary" />
              面试成长手册
            </h2>
            <p>演示知识体系 · 6 个章节</p>
            <div className="mt-4">
              <ProgressBar value={(progress / chapters.length) * 100} />
            </div>
            <Input
              aria-label="搜索章节"
              placeholder="查找知识章节"
              className="h-8 text-[10px] mt-4"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {!chapters.some((c) =>
            `${c.title}${c.content}${c.sections.join('')}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) && <p className="p-4 text-xs text-subtle">没有匹配章节，请换一个关键词。</p>}
          {['前端开发', '计算机基础', '面试方法'].map((cat) => (
            <details open key={cat}>
              <summary>{cat}</summary>
              {chapters
                .filter(
                  (c) =>
                    c.category === cat &&
                    `${c.title}${c.content}${c.sections.join('')}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((c) => (
                  <button
                    className={s.treeItem}
                    key={c.id}
                    aria-current={c.id === active}
                    onClick={() => choose(c.id)}
                  >
                    {completed.includes(c.id) ? (
                      <CheckCircle2 size={13} className="text-status-offer" />
                    ) : (
                      <FileText size={13} />
                    )}
                    <span>{c.title}</span>
                  </button>
                ))}
            </details>
          ))}
        </aside>
        <article className={s.reader}>
          <div className="flex items-center justify-between">
            <SmallTag>{chapter.category}</SmallTag>
            <FavoriteButton
              active={favorites.includes(`chapter:${active}`)}
              onClick={() => toggleFavorite('chapter', active)}
            />
          </div>
          <h1>{chapter.title}</h1>
          <div className={s.readerMeta}>
            <span className="flex gap-1 items-center">
              <BookOpen size={11} />
              {chapter.sections.length} 个知识小节
            </span>
            <span className="flex gap-1 items-center">
              <Clock size={11} />
              预计 12 分钟
            </span>
            <span className="ml-auto">演示内容</span>
          </div>
          <nav className="flex flex-wrap gap-2 mt-6">
            {chapter.sections.map((t, i) => (
              <button
                key={t}
                onClick={() => {
                  setSection(i);
                  document
                    .getElementById('chapter-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`rounded-md px-2 py-1 text-[10px] ${i === section ? 'text-primary bg-primary/10' : 'text-subtle bg-raised'}`}
              >
                {i + 1}. {t}
              </button>
            ))}
          </nav>
          <section id="chapter-section" className="scroll-mt-24">
            <h2>{chapter.sections[section]}</h2>
            {chapter.content.split('\n\n').map((p, i) => (
              <p key={i} className="mb-4">
                {p}
              </p>
            ))}
            {section > 0 && (
              <div className={s.takeaway}>
                当前小节：{chapter.sections[section]}
                。阅读后，尝试用自己的话描述它的工作方式，并补充一个能够验证结论的具体例子。
              </div>
            )}
            <div className="my-7 rounded-xl bg-background border border-border p-5">
              <h3 className="text-xs mb-3 text-primary flex gap-2 items-center">
                <PenLine size={14} />
                练习：把知识讲给未来的自己
              </h3>
              <p>用三句话说明这个概念：它解决什么问题？它如何工作？你在项目中什么时候会用到它？</p>
            </div>
            <h2>面试里，怎样回答得更清楚？</h2>
            <p>
              先用一句话给出核心结论，再解释背后的原因。用一个简短的例子验证推导，最后补充适用条件和边界。不要急着堆砌术语，清晰的思考比复杂的表述更有力量。
            </p>
            <div className={s.takeaway}>
              <b className="text-foreground">记住这个顺序</b>
              <br />
              结论 → 原理 → 实例 → 边界。把答案组织成一条可以追问的线索。
            </div>
          </section>
          <div className="flex justify-between gap-3 mt-8 items-center">
            <Button
              size="sm"
              variant={completed.includes(active) ? 'outline' : 'default'}
              onClick={() => {
                toggleCompleted(active);
                toast.success(
                  completed.includes(active) ? '已取消完成标记' : '本章已完成，继续积累！',
                );
              }}
            >
              <Check size={14} />
              {completed.includes(active) ? '已完成本章' : '标记本章完成'}
            </Button>
            <span className="text-[10px] text-subtle">学习进度自动保存</span>
          </div>
          <div className={s.readerFooter}>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedIndex === 0}
              onClick={() => choose(chapters[selectedIndex - 1].id)}
            >
              <ArrowLeft size={13} />
              上一章
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={selectedIndex === chapters.length - 1}
              onClick={() => choose(chapters[selectedIndex + 1].id)}
            >
              下一章
              <ArrowRight size={13} />
            </Button>
          </div>
        </article>
        <aside className={s.noteSide}>
          <Panel
            title={
              <span className="flex gap-2 items-center">
                <PenLine size={14} className="text-primary" />
                我的学习笔记
              </span>
            }
          >
            <p className="text-[10px] text-subtle mb-3 leading-5">
              写下你的理解。切换章节后，笔记会跟随当前知识章节。
            </p>
            <Textarea
              aria-label="当前章节学习笔记"
              placeholder="这里是属于你的知识地图…"
              className="min-h-52 text-[11px] leading-7 resize-y"
              value={noteDraft}
              maxLength={10000}
              onChange={(e) => {
                setNoteDraft(e.target.value);
                setNoteStatus('尚未保存');
              }}
            />
            <div className="flex justify-between items-center mt-3">
              <span className="text-[9px] text-subtle">{noteStatus || '仅保存在当前浏览器'}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => {
                  if (saveNotes((v) => ({ ...v, [`chapter:${active}`]: noteDraft })))
                    setNoteStatus('笔记已保存到本地');
                }}
              >
                保存笔记
              </Button>
            </div>
          </Panel>
          {(noteError || templateError) && (
            <p role="alert" className="text-xs text-destructive">
              {noteError || templateError}
            </p>
          )}
          <div className="mt-4">
            <Panel title="我的回答模板">
              <p className="mb-3 text-xs leading-6 text-subtle">
                选择框架后填入自己的经历，保存并导出用于练习。
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTemplateDraft(
                      'Situation 背景：\n\nTask 任务与目标：\n\nAction 我的行动：\n\nResult 结果与反思：',
                    )
                  }
                >
                  STAR 模板
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTemplateDraft(
                      '项目与用户：\n\n我负责的目标：\n\n约束与备选方案：\n\n关键决策与实现：\n\n验证证据与反思：',
                    )
                  }
                >
                  项目深挖模板
                </Button>
              </div>
              <Textarea
                aria-label="我的回答模板"
                maxLength={10000}
                className="min-h-56"
                value={templateDraft}
                onChange={(e) => setTemplateDraft(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (saveTemplates((v) => ({ ...v, [active]: templateDraft })))
                      setNoteStatus('回答模板已保存');
                  }}
                >
                  保存回答模板
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadKnowledge(
                      `${chapter.title}-学习记录.md`,
                      `# ${chapter.title}\n\n${chapter.content}\n\n## 我的笔记\n${noteDraft}\n\n## 我的回答\n${templateDraft}`,
                    )
                  }
                >
                  导出章节与笔记
                </Button>
              </div>
            </Panel>
          </div>
          <div className="mt-4">
            <Panel title="把知识用起来">
              <Link className={s.chapterLink} href="/questions">
                相关面试题 <ChevronRight size={13} />
              </Link>
              <Link className={s.chapterLink} href="/experiences">
                看看学长学姐的复盘 <ChevronRight size={13} />
              </Link>
              <Link className={s.chapterLink} href="/analytics">
                查看我的成长进度 <ChevronRight size={13} />
              </Link>
            </Panel>
          </div>
        </aside>
      </div>
      <div className="mt-6">
        <DemoNotice>
          手册为精简演示内容，部分小节共享章节说明；笔记与完成状态保存于本机。
        </DemoNotice>
      </div>
    </>
  );
}

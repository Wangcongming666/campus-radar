'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  FileText,
  Layers,
  LoaderCircle,
  MapPin,
  Radar,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompanyLogo, DemoNotice, MatchRing, ProgressBar, SmallTag } from '@/components/shared';
import { companies, jobs, experiences, chapters } from '@/lib/data';
import { subscribeCatalog, getCatalogRevision, loadCatalog } from '@/lib/catalog';
import { useRadarStore } from '@/lib/store';
import s from './public.module.css';
import { useCampus } from '@/components/campus-provider';
import { ApiAuthPage } from '@/features/auth/api-auth-page';
import { ApiAccountPage } from '@/features/account/api-account-page';
import { Suspense } from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
  useInterviewLocal,
  saveInterviewFile,
  deleteInterviewFile,
} from '@/lib/interview-repository';
import { extractResumeText } from '@/lib/resume-extract';
import { isResumeLibrary, type ResumeVersion } from '@/lib/resume-files';
import {
  parseProfileText,
  parseSavedProfile,
  validateOnboarding,
  buildPreparationTasks,
  preserveReturnTo,
  onboardingReturnTo,
  SAMPLE_RESUME_TEXT,
  PROFILE_ROLES,
  PROFILE_CITIES,
  PROFILE_DEGREES,
  PROFILE_YEARS,
} from '@/lib/local-matching';
import { persistOnboardingEntries } from '@/lib/onboarding-workspace';
import { plannerTaskSchema } from '@/lib/growth-storage';
import { LOCAL_STATE_EVENT } from '@/lib/local-workspace';

export function Brand() {
  return (
    <Link href="/" className={s.brand}>
      <Radar size={30} />
      <span>
        校招雷达<small>CAMPUS RADAR</small>
      </span>
    </Link>
  );
}
export function LandingPage() {
  const { mode, adapter } = useCampus();
  const cloud = mode === 'api';
  useSyncExternalStore(subscribeCatalog, getCatalogRevision, () => 0);
  const [catalogError, setCatalogError] = useState('');
  useEffect(() => {
    if (!cloud) return;
    const controller = new AbortController();
    void loadCatalog(adapter, controller.signal).catch(error => {
      if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : '目录暂不可用');
    });
    return () => controller.abort();
  }, [cloud, adapter]);
  const previewRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: previewRef, offset: ['start end', 'end start'] });
  const previewY = useTransform(scrollYProgress, [0, 1], [-18, 18]);
  const reducedMotion = useReducedMotion();
  return (
    <div className={s.landing}>
      <header className={s.nav}>
        <Brand />
        <nav className={s.navLinks} aria-label="主导航">
          <a href="#product">产品功能</a>
          <a href="#stories">成长故事</a>
          <a href="#faq">常见问题</a>
          <Link href="/login">登录</Link>
          <Button asChild size="sm">
            <Link href="/jobs">
              体验校招雷达 <ArrowUpRight size={14} />
            </Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <span className={s.pill}>
              <i />
              2027 届秋招，现在就出发
            </span>
            <h1>
              好机会，不靠运气。
              <br />
              让每一份努力
              <br />
              都有回响。
            </h1>
            <p>
              从发现心仪岗位，到拿下理想 Offer。
              <br />
              把散落的信息、忙乱的投递和面试准备，收进一张清晰的校招地图。
            </p>
            <div className={s.actions}>
              <Button size="lg" asChild>
                <Link href="/jobs">
                  开启我的校招 <ArrowRight size={16} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pipeline">{cloud ? '打开我的工作台' : '探索演示工作台'}</Link>
              </Button>
            </div>
            <span className={s.footnote}>{cloud ? '官方公开来源 · 注册后保存你的求职进度' : '无需注册即可体验 · 所有招聘内容均为演示数据'}</span>
            {catalogError && <p role="alert" className="text-xs text-destructive">{catalogError}</p>}
          </div>
          <div className={s.radarWrap} aria-label="岗位雷达演示">
            <div className={s.radar}>
              <div className={s.center}>
                <Radar size={40} />
              </div>
            </div>
            {jobs.slice(0, 3).map((j, i) => (
              <Link
                href={`/jobs?preview=job:${j.id}`}
                key={j.id}
                className={`${s.orbit} ${[s.orbitOne, s.orbitTwo, s.orbitThree][i]}`}
              >
                <CompanyLogo companyId={j.companyId} size="sm" />
                <div>
                  <span>
                    {companies.find((c) => c.id === j.companyId)?.name} · {j.role}
                  </span>
                  <small>{j.city} / {cloud ? j.type : '2027 届秋招'}</small>
                </div>
                <span className={s.match}>
                  {cloud ? '官方' : j.match}
                  <small>{cloud ? '来源' : '% 匹配'}</small>
                </span>
              </Link>
            ))}
            <div className={s.radarCaption}>
              <span className={s.signal}>
                <i />
                <i />
                <i />
              </span>
              机会持续发现中 <span className="text-primary">{cloud ? `${jobs.length} 个已收录岗位` : '12 个演示岗位'}</span>
            </div>
          </div>
        </section>
        <div className={s.stats}>
          {(cloud ? [
            [String(jobs.length), '已收录岗位'],
            [String(companies.length), '公司档案'],
            [String(experiences.length), '公开面试复盘'],
            ['1', '你的校招工作台'],
          ] : [
            ['12', '精选演示岗位'],
            ['8', '热门企业档案'],
            ['6', '面试复盘样本'],
            ['1', '你的校招工作台'],
          ]).map(([n, t]) => (
            <div key={t}>
              <strong>{n}</strong>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <section className={s.section} id="product">
          <div className={s.sectionHeader}>
            <h2>
              校招很复杂，
              <br />
              你的下一步可以很清晰。
            </h2>
            <p>
              少一点在标签页之间来回切换。
              <br />
              在一个地方，完成发现、行动、准备和复盘。
            </p>
          </div>
          <div className={s.product}>
            <article className={s.feature}>
              <div className={s.featureIcon}>
                <Target size={20} />
              </div>
              <h3>从海量信息，到心仪机会。</h3>
              <p>按方向、城市、招聘类型寻找岗位，让截止日期和技能要求一目了然。</p>
              <div className="mt-7 space-y-3">
                {jobs.slice(0, 2).map((j) => (
                  <Link
                    className="flex gap-3 items-center rounded-xl border border-border p-3 bg-background"
                    href={`/jobs?preview=job:${j.id}`}
                    key={j.id}
                  >
                    <CompanyLogo companyId={j.companyId} size="sm" />
                    <div className="flex-1">
                      <b className="text-xs font-medium">{j.title}</b>
                      <p className="!text-[10px]">
                        {j.city} · {j.salary}
                      </p>
                    </div>
                    {!cloud && <MatchRing value={j.match} size={36} />}
                  </Link>
                ))}
              </div>
            </article>
            <article className={s.feature}>
              <div className={s.featureIcon}>
                <Layers size={20} />
              </div>
              <h3>每一次投递，都有下文。</h3>
              <p>从待投递到 Offer，一张看板管理进展。记录每次沟通，把精力留给真正重要的准备。</p>
              <p className="!text-[10px]">功能示意</p><div className={s.board}>
                {[
                  ['待投递', '网易', '客户端开发'],
                  ['面试中', '腾讯', '前端开发'],
                  ['Offer', '蚂蚁集团', '前端实习'],
                ].map(([stage, name, role], i) => (
                  <div className={s.boardCol} key={stage}>
                    <div className={s.boardLabel}>
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${i === 2 ? 'bg-status-offer' : i === 1 ? 'bg-purple' : 'bg-subtle'}`}
                      />
                      {stage} <span className="float-right">1</span>
                    </div>
                    <div className={s.boardJob}>
                      {name}
                      <small>{role}</small>
                      <small>{i === 2 ? '等待确认' : '更新于今天'}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className={s.feature}>
              <div className={s.featureIcon}>
                <BookOpen size={20} />
              </div>
              <h3>准备有章法，面试有底气。</h3>
              <p>面经、题库与知识手册相互连接。把看过的知识，变成下一次能讲清楚的答案。</p>
              <Link href="/handbook" className={s.bookPreview}>
                <div className={s.bookCover}>
                  <BookOpen size={24} />
                  前端面试
                  <br />
                  成长手册
                </div>
                <div className={s.bookLines}>
                  <b className="text-xs font-medium">一点一点，建立你的知识体系</b>
                  <span />
                  <span style={{ width: '75%' }} />
                  <span style={{ width: '90%' }} />
                  <SmallTag>{cloud ? chapters.length : 6} 个知识章节 · 可记录学习笔记</SmallTag>
                </div>
              </Link>
            </article>
            <article className={s.feature}>
              <div className={s.featureIcon}>
                <Sparkles size={20} />
              </div>
              <h3>看清自己，也看见可能。</h3>
              <p>通过演示画像了解岗位匹配维度，用学习进度和投递记录找到值得投入的下一步。</p>
              <div className="mt-8 space-y-5">
                {[
                  ['技术技能', 88],
                  ['项目经历', 76],
                  ['面试准备', 62],
                ].map(([t, n]) => (
                  <div key={t}>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
                      <span>{t}</span>
                      <span>{n}%</span>
                    </div>
                    <ProgressBar value={Number(n)} />
                  </div>
                ))}
                <p className="!text-[9px]">示意数据，不构成真实能力评估。</p>
              </div>
            </article>
          </div>
        </section>
        <section className={s.section} id="stories">
          <div className={s.sectionHeader}>
            <h2>
              下一站，
              <br />
              是更靠近理想的自己。
            </h2>
            <p>
              以下是用于展示产品场景的虚构成长故事，
              <br />
              不是用户证言，也不代表真实录用结果。
            </p>
          </div>
          <div className={s.offers}>
            {[
              [
                '林',
                '前端开发 · 腾讯',
                '终于不用再翻十几个表格找面试时间。每个阶段该做什么，打开看板就知道。',
              ],
              [
                '陈',
                '后端开发 · 阿里巴巴',
                '把项目复盘和高频知识放在一起准备，原本零散的知识终于连成了一条线。',
              ],
              [
                '许',
                '产品经理 · 小米',
                '焦虑的时候看一眼走过的路，才发现自己已经做了这么多。下一步也更有方向。',
              ],
            ].map(([name, role, text]) => (
              <div className={s.offer} key={name}>
                <div className="flex justify-between items-center">
                  <span className="text-status-offer text-[10px] flex gap-1 items-center">
                    <CheckCheck size={13} />
                    Offer 故事
                  </span>
                  <SmallTag>虚构演示</SmallTag>
                </div>
                <p>“{text}”</p>
                <div className={s.person}>
                  <span className={s.avatar}>{name}</span>
                  <div>
                    {name}同学<small>{role}</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className={s.section} ref={previewRef} aria-labelledby="preview-title">
          <div className={s.sectionHeader}>
            <h2 id="preview-title">
              打开工作台，
              <br />
              看见校招的全貌。
            </h2>
            <p>
              独立的页面，连贯的体验。
              <br />
              这是当前演示应用的实际截图。
            </p>
          </div>
          <div className={s.workspacePreview}>
            <div className={s.previewToolbar}>
              <span />
              <span />
              <span />
              <p>Campus Radar · 校招工作台</p>
              <Link href="/jobs">
                打开工作台 <ArrowUpRight size={12} />
              </Link>
            </div>
            <motion.div style={{ y: reducedMotion ? 0 : previewY }}>
              <Image
                src="/product-preview.png"
                width={1512}
                height={960}
                alt="校招雷达实际演示工作台：岗位筛选、匹配度、投递进度和待办日程"
                sizes="(max-width: 767px) 100vw, 1160px"
                className="w-full h-auto"
              />
            </motion.div>
          </div>
        </section>
        <section className={`${s.section} ${s.faq}`} id="faq">
          <div>
            <h2>
              出发前，
              <br />
              你可能想知道。
            </h2>
            <p className="text-xs text-muted-foreground mt-4">关于这次产品体验的几个答案。</p>
          </div>
          <div>
            {(cloud ? [
              ['这里的岗位是真实的吗？', '当前展示已收录的官方公开岗位元数据及原始链接，来源未提供的薪资、学历和截止日期显示未知。未启用全网实时抓取，申请前请核对官方页面。'],
              ['需要注册或支付费用吗？', '注册账号后可保存求职记录。当前本机服务不收费，登录使用受保护会话。'],
              ['我的操作会保存吗？', '投递、收藏、日程、简历与学习记录通过 API 保存到服务器数据库。设置页支持账号备份、恢复和清空私有数据。'],
              ['可以上传真实简历吗？', '支持 PDF、TXT、MD。原件保存到服务器私有目录，下载验证账号归属；文本提取在浏览器进行，当前不发送至外部模型。'],
            ] : [
              [
                '这里的岗位是真实的吗？',
                '目前是完整交互的产品演示。岗位、薪资、面经、匹配分与 Offer 故事均为样本，不代表企业当前招聘信息。正式投递请以企业官网为准。',
              ],
              [
                '需要注册或支付费用吗？',
                '不需要。点击体验即可探索全部演示功能，模拟登录只用于体验流程，不会创建真实账号。',
              ],
              [
                '我的操作会保存吗？',
                '收藏、投递进展、学习笔记和演示资料会保存在当前浏览器。清除浏览器数据后可能丢失，你可以在设置中导出或重置。',
              ],
              [
                '可以上传真实简历吗？',
                '支持在当前浏览器解析 PDF、TXT、MD 简历，原文件存于本机 IndexedDB，不会发送至服务器或外部模型。扫描件需手动补充文字；可在简历版本库删除文件，清除浏览器数据也会删除本机记录。',
              ],
            ]).map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={s.finalCta}>
          <h2>你的理想 Offer，值得认真靠近。</h2>
          <p>把下一步变得清晰，从今天开始。</p>
          <Button size="lg" asChild>
            <Link href="/jobs">
              开始探索机会 <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className={s.footer}>
        <Brand />
        <span>
          © 2026 Campus Radar
          <br />
          {cloud ? '官方岗位目录 · 账号求职工作台' : '产品交互演示 · 本地数据体验'}
        </span>
      </footer>
    </div>
  );
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { mode } = useCampus();
  return mode === 'api' ? (
    <ApiAuthPage register={register} brand={<Brand />} />
  ) : (
    <DemoAuthPage register={register} />
  );
}
function DemoAuthPage({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const setProfile = useRadarStore((s) => s.setProfile);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState('/pipeline');
  useEffect(
    () =>
      setDestination(
        onboardingReturnTo(new URLSearchParams(window.location.search).get('returnTo')),
      ),
    [],
  );
  function enter(demo = false) {
    if (!demo) {
      if (register && name.trim().length < 2) {
        setError('请输入至少 2 个字的演示昵称');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('请输入格式正确的演示邮箱');
        return;
      }
      if (code.trim().length < 4 || code.length > 100) {
        setError('请输入 4 至 100 位演示口令，例如 demo2027');
        return;
      }
      if (register && !agreed) {
        setError('请先确认演示数据说明');
        return;
      }
    }
    setError('');
    setBusy(true);
    if (register || name.trim()) setProfile(name.trim() || '林同学');
    toast.success(demo ? '已进入演示账号' : register ? '演示资料已创建' : '演示登录成功');
    const target = onboardingReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
    router.push(register ? preserveReturnTo('/onboarding', target) : target);
  }
  return (
    <main className={s.auth}>
      <aside className={s.authStory}>
        <Brand />
        <div>
          <h2>
            每一个认真准备的你，
            <br />
            都值得被看见。
          </h2>
          <p>用一张清晰的地图，连接今天的努力和明天的可能。</p>
          <div className={s.authGraphic}>
            <Radar size={85} strokeWidth={1} />
          </div>
        </div>
        <DemoNotice>产品演示模式 · 无真实账号服务</DemoNotice>
      </aside>
      <div className={s.authMain}>
        <div className={s.authForm}>
          <Link
            href="/"
            className="inline-flex gap-1 items-center text-xs text-muted-foreground mb-9"
          >
            <ChevronLeft size={13} />
            返回首页
          </Link>
          <SmallTag active>DEMO · 演示体验</SmallTag>
          <h1 className="mt-4">{register ? '开启你的校招旅程' : '欢迎回来，同学'}</h1>
          <p>
            {register ? '先建立一份演示资料，让探索更有方向。' : '下一份心仪机会，正在等你发现。'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
          >
            {register && (
              <label className={s.authLabel}>
                演示昵称
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：林同学"
                  autoComplete="off"
                  maxLength={20}
                />
              </label>
            )}
            <label className={s.authLabel}>
              演示邮箱
              <Input
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                autoComplete="off"
              />
            </label>
            <label className={s.authLabel}>
              演示口令（不保存）
              <Input
                type="text"
                maxLength={100}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="例如 demo2027，请勿使用真实密码"
                autoComplete="off"
              />
            </label>
            {register && (
              <label className="flex items-start gap-2 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="accent-primary mt-1"
                />
                我已知晓这是本地产品演示，请勿填写真实敏感信息。
              </label>
            )}
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : register ? (
                '创建演示资料'
              ) : (
                '进入工作台'
              )}
              <ArrowRight size={15} />
            </Button>
          </form>
          <div className={s.authDivider}>或直接探索</div>
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => enter(true)}>
            <Zap size={15} />
            一键进入演示账号
          </Button>
          <p className={s.authFine}>
            <ShieldCheck size={12} className="inline mr-1" />
            口令不会存储或传输。你的收藏与进展仅保存于当前浏览器。
          </p>
          <div className="text-xs text-muted-foreground text-center mt-7">
            {register ? '已有演示资料？' : '第一次来到这里？'}{' '}
            <Link
              className="text-primary"
              href={preserveReturnTo(register ? '/login' : '/register', destination)}
            >
              {register ? '返回登录' : '创建演示资料'}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
export function OnboardingPage() {
  const { mode } = useCampus();
  return mode === 'api' ? (
    <Suspense fallback={<p className="p-8 text-muted-foreground">正在打开个人资料…</p>}>
      <ApiAccountPage onboarding />
    </Suspense>
  ) : (
    <DemoOnboardingPage />
  );
}
type OnboardingDraft = {
  step: number;
  name: string;
  school: string;
  degree: string;
  year: string;
  roles: string[];
  cities: string[];
  resumeText: string;
  resumeId: string;
  fileName: string;
  sampleResume: boolean;
  finished: boolean;
};
function isOnboardingDraft(value: unknown): value is OnboardingDraft | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.step === 'number' &&
    Number.isInteger(v.step) &&
    v.step >= 0 &&
    v.step <= 3 &&
    ['name', 'school', 'degree', 'year', 'resumeText', 'resumeId', 'fileName'].every(
      (key) => typeof v[key] === 'string',
    ) &&
    Array.isArray(v.roles) &&
    v.roles.every((x) => typeof x === 'string') &&
    Array.isArray(v.cities) &&
    v.cities.every((x) => typeof x === 'string') &&
    typeof v.sampleResume === 'boolean' &&
    typeof v.finished === 'boolean'
  );
}
function DemoOnboardingPage() {
  const router = useRouter();
  const savedName = useRadarStore((state) => state.userName);
  const savedProfile = useRadarStore((state) => state.notes['onboarding-profile']);
  const profile = parseSavedProfile(savedProfile);
  const base: OnboardingDraft = {
    step: 0,
    name: savedName,
    school: profile.school || '',
    degree: profile.degree || '本科',
    year: profile.year || '2027',
    roles: profile.roles?.length ? profile.roles : ['前端开发'],
    cities: profile.cities?.length ? profile.cities : ['深圳', '杭州'],
    resumeText: profile.resumeText || '',
    resumeId: '',
    fileName: '',
    sampleResume: false,
    finished: false,
  };
  const repository = useInterviewLocal<OnboardingDraft | null>(
    'onboarding-draft-v2',
    null,
    isOnboardingDraft,
  );
  const library = useInterviewLocal<ResumeVersion[]>('resume-library-v2', [], isResumeLibrary);
  const [draft, setDraft] = useState(base);
  const loaded = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [destination, setDestination] = useState('/pipeline');
  const [extractionNote, setExtractionNote] = useState('');
  useEffect(() => {
    setDestination(onboardingReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
  }, []);
  useEffect(() => {
    if (repository.ready && !loaded.current) {
      loaded.current = true;
      setDraft(repository.value ?? base);
    }
  }, [repository.ready, repository.value, savedName, savedProfile]);
  const parsed = parseProfileText(draft.resumeText);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  async function patch(change: Partial<OnboardingDraft>) {
    const next = { ...draft, ...change, finished: false };
    setDraft(next);
    if (await repository.save(next)) {
      setStatus('草稿已自动保存到本机');
      setError('');
    } else {
      setError('草稿保存失败，当前输入仍保留，请释放浏览器存储后重试。');
    }
  }
  function toggle(value: string, key: 'roles' | 'cities') {
    patch({
      [key]: draft[key].includes(value)
        ? draft[key].filter((x) => x !== value)
        : [...draft[key], value],
    });
  }
  function next() {
    try {
      if (draft.step === 0) validateOnboarding({ ...draft, roles: ['前端开发'], cities: ['深圳'] });
      if (draft.step === 2) validateOnboarding(draft);
      patch({ step: Math.min(3, draft.step + 1) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function parseFile(file: File, sample = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    setExtractionNote('');
    const id = `resume-onboarding-${crypto.randomUUID()}`;
    try {
      const extracted = await extractResumeText(file);
      await saveInterviewFile(id, file, file.name);
      const item: ResumeVersion = {
        id,
        name: sample ? '前端开发示例简历' : file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        mime: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'text/plain'),
        size: file.size,
        text: extracted.text,
        role: draft.roles[0] || '通用',
        createdAt: new Date().toISOString(),
        version: Math.max(0, ...library.value.map((r) => r.version)) + 1,
        default: true,
        applicationIds: [],
        extractionNote: extracted.note,
      };
      if (!library.save((items) => [item, ...items.map((r) => ({ ...r, default: false }))])) {
        await deleteInterviewFile(id);
        throw new Error('简历版本保存失败，请检查本机存储空间。');
      }
      const detected = parseProfileText(extracted.text);
      patch({
        resumeId: id,
        resumeText: extracted.text,
        fileName: file.name,
        sampleResume: sample,
        ...(detected.degree ? { degree: detected.degree } : {}),
        ...(PROFILE_YEARS.includes(detected.year) ? { year: detected.year } : {}),
      });
      setExtractionNote(
        extracted.note || '已实际读取文件文字；技能与经历数量由本地规则识别，请自行核对。',
      );
      if (!extracted.text.trim())
        setError('未提取到文字，可能是扫描件。原文件已保存，可在下方手动补充文字后继续。');
      else setStatus('简历原文件、提取文字与默认版本已保存到本机');
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件解析失败，请换用 TXT 或手动输入文字。');
    } finally {
      setBusy(false);
    }
  }
  async function saveResumeText() {
    const item = library.value.find((r) => r.id === draft.resumeId);
    if (!item) {
      setError('请先导入文件或解析示例，再保存校正文字。');
      return;
    }
    if (
      await library.save((items) =>
        items.map((r) => (r.id === draft.resumeId ? { ...r, text: draft.resumeText } : r)),
      )
    )
      setStatus('校正文字已同步至简历版本库');
    else setError('校正文字保存失败，请重试。');
  }
  function finish() {
    try {
      const valid = validateOnboarding(draft);
      const current = useRadarStore.getState();
      const rawTasks = localStorage.getItem('radar-extended-planner-tasks-v2');
      const previous = rawTasks ? plannerTaskSchema.array().parse(JSON.parse(rawTasks)) : [];
      const tasks = buildPreparationTasks(valid, previous, today);
      const rawLibrary = localStorage.getItem('radar-extended-resume-library-v2');
      const savedLibrary: unknown = rawLibrary ? JSON.parse(rawLibrary) : [];
      if (!isResumeLibrary(savedLibrary))
        throw new Error('简历版本记录格式损坏，请在版本库检查后重试。');
      const updatedLibrary = savedLibrary.map((item) =>
        item.id === draft.resumeId
          ? { ...item, text: draft.resumeText, role: draft.roles[0] || '通用' }
          : item,
      );
      const profileText = JSON.stringify({
        ...valid,
        resumeText: valid.resumeText.slice(0, 100000),
      });
      const notes = { ...current.notes, 'onboarding-profile': profileText };
      const partial = useRadarStore.persist.getOptions().partialize?.(current) ?? current;
      persistOnboardingEntries(localStorage, {
        'campus-radar-demo-v1': JSON.stringify({
          state: { ...partial, userName: valid.name, profileComplete: true, notes },
          version: 0,
        }),
        'radar-extended-planner-tasks-v2': JSON.stringify(tasks),
        'radar-extended-onboarding-draft-v2': JSON.stringify({ ...draft, finished: true }),
        ...(draft.resumeId
          ? { 'radar-extended-resume-library-v2': JSON.stringify(updatedLibrary) }
          : {}),
      });
      useRadarStore.setState({ userName: valid.name, profileComplete: true, notes });
      window.dispatchEvent(
        new CustomEvent(LOCAL_STATE_EVENT, { detail: { key: 'planner-tasks-v2' } }),
      );
      window.dispatchEvent(
        new CustomEvent(LOCAL_STATE_EVENT, { detail: { key: 'onboarding-draft-v2' } }),
      );
      if (draft.resumeId)
        window.dispatchEvent(
          new CustomEvent(LOCAL_STATE_EVENT, { detail: { key: 'resume-library-v2' } }),
        );
      toast.success(`本机画像与 ${tasks.length - previous.length} 项新准备任务已保存`);
      router.push(destination);
    } catch (e) {
      setError(
        e instanceof Error && /昵称|学校|学历|毕业|方向|城市|简历/.test(e.message)
          ? e.message
          : '保存未完成，请检查本机存储空间或修复规划记录后重试；当前输入已保留。',
      );
    }
  }
  const previewTasks = (() => {
    try {
      return buildPreparationTasks(draft, [], today);
    } catch {
      return [];
    }
  })();
  return (
    <main className={s.onboarding}>
      <div className="flex justify-between items-center">
        <Brand />
        <Link className="text-xs text-muted-foreground" href={destination}>
          稍后完善
        </Link>
      </div>
      <div className={s.stepper}>
        {['认识你', '简历画像', '求职偏好', '校招计划'].map((title, i) => (
          <div className={`${s.step} ${i <= draft.step ? s.stepActive : ''}`} key={title}>
            <b>{i < draft.step ? <Check size={15} /> : i + 1}</b>
            {title}
          </div>
        ))}
      </div>
      <section className={s.onboardPanel}>
        {!repository.ready ? (
          <p role="status">正在读取本机引导草稿…</p>
        ) : draft.step === 0 ? (
          <>
            <SmallTag active>从你开始</SmallTag>
            <h1 className="mt-4">先认识一下，未来的职场人。</h1>
            <p>资料仅用于本机偏好与规则匹配，你可以随时在设置中修改。</p>
            <div className={s.fields}>
              <label className={s.authLabel}>
                如何称呼你
                <Input
                  value={draft.name}
                  maxLength={20}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="昵称，2至20字"
                />
              </label>
              <label className={s.authLabel}>
                学校（选填）
                <Input
                  value={draft.school}
                  maxLength={40}
                  onChange={(e) => patch({ school: e.target.value })}
                />
              </label>
              <label className={s.authLabel}>
                学历
                <select
                  className="h-10 rounded-md bg-background border border-input px-3"
                  value={draft.degree}
                  onChange={(e) => patch({ degree: e.target.value })}
                >
                  {PROFILE_DEGREES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className={s.authLabel}>
                毕业年份
                <select
                  className="h-10 rounded-md bg-background border border-input px-3"
                  value={draft.year}
                  onChange={(e) => patch({ year: e.target.value })}
                >
                  {PROFILE_YEARS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : draft.step === 1 ? (
          <>
            <SmallTag active>发现你的闪光点</SmallTag>
            <h1 className="mt-4">把经历，变成看得见的优势。</h1>
            <p>
              在浏览器中读取 PDF、TXT、MD，最多 10
              MB。原件与文字仅保存在本机；不会上传或调用外部模型。扫描件可手动补充文字。
            </p>
            <div className={s.parseArea}>
              {busy ? (
                <ScanLine size={35} className={s.scan} />
              ) : draft.resumeText ? (
                <CheckCheck size={35} />
              ) : (
                <FileText size={35} />
              )}
              <h3 className="break-all">
                {busy ? '正在提取文件文字…' : draft.fileName || '导入简历或使用示例'}
              </h3>
              <p>
                {draft.resumeText
                  ? `本地识别 ${parsed.skills.length} 项技能、${parsed.projects} 个项目标记、${parsed.internships} 段实习标记`
                  : '示例包含实际可读取的简历文本，支持与自己的文件使用同一套解析流程。'}
              </p>
              <label className="my-4 block text-xs text-muted-foreground">
                选择本机简历文件
                <Input
                  aria-label="选择本机简历文件"
                  className="mt-2"
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void parseFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <Button
                disabled={busy || !library.ready}
                variant="outline"
                onClick={() =>
                  void parseFile(
                    new File([SAMPLE_RESUME_TEXT], '前端开发_2027届_示例.txt', {
                      type: 'text/plain',
                    }),
                    true,
                  )
                }
              >
                {busy ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                解析示例简历
              </Button>
              {parsed.skills.length > 0 && (
                <div className={s.parseSkills}>
                  {parsed.skills.map((skill) => (
                    <SmallTag active key={skill}>
                      {skill}
                    </SmallTag>
                  ))}
                </div>
              )}
            </div>
            {extractionNote && <p className="mt-3 text-xs text-subtle">{extractionNote}</p>}
            <label className="mt-5 grid gap-2 text-xs text-muted-foreground">
              简历提取文字（可校正）
              <Textarea
                aria-label="简历提取文字（可校正）"
                disabled={busy}
                rows={7}
                maxLength={500000}
                value={draft.resumeText}
                onChange={(e) => patch({ resumeText: e.target.value })}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={!draft.resumeId}
                onClick={saveResumeText}
              >
                保存校正文字到版本库
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/resumes">管理本机简历版本</Link>
              </Button>
            </div>
          </>
        ) : draft.step === 2 ? (
          <>
            <SmallTag active>找到你的坐标</SmallTag>
            <h1 className="mt-4">你想在哪个方向，发光？</h1>
            <p>方向与城市会影响岗位规则匹配，并生成对应的准备任务。</p>
            <h3 className="text-xs text-muted-foreground">意向方向</h3>
            <div className={s.optionGrid}>
              {PROFILE_ROLES.map((value) => (
                <button
                  key={value}
                  aria-pressed={draft.roles.includes(value)}
                  className={s.option}
                  onClick={() => toggle(value, 'roles')}
                >
                  <Target size={16} />
                  {value}
                  {draft.roles.includes(value) && <Check className="ml-auto" size={14} />}
                </button>
              ))}
            </div>
            <h3 className="mt-7 text-xs text-muted-foreground">意向城市</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {PROFILE_CITIES.map((value) => (
                <Button
                  key={value}
                  variant={draft.cities.includes(value) ? 'default' : 'outline'}
                  aria-pressed={draft.cities.includes(value)}
                  size="sm"
                  onClick={() => toggle(value, 'cities')}
                >
                  <MapPin size={12} />
                  {value}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <SmallTag active>准备就绪</SmallTag>
            <h1 className="mt-4">{draft.name}，你的下一步清晰了。</h1>
            <p>
              向着 {draft.cities.join('、')} 的 {draft.roles.join('、')} 机会出发。
            </p>
            <div className={s.timeline}>
              {previewTasks.map((task) => (
                <div key={task.id}>
                  <span className="text-primary text-[10px]">{task.date}</span>
                  <h3 className="mt-1">{task.title}</h3>
                  <small>保存后加入「成长规划」，可修改日期、完成状态和提醒。</small>
                </div>
              ))}
            </div>
            <DemoNotice>
              任务根据本机偏好与简历状态生成，重复完成引导会保留已有同名任务。招聘实际安排请自行核验。
            </DemoNotice>
          </>
        )}
        {(error || repository.error || library.error) && (
          <p role="alert" className="field-error mt-5">
            {error || repository.error || library.error}
          </p>
        )}
        {status && (
          <p role="status" className="mt-4 text-xs text-subtle">
            {status}
          </p>
        )}
        <div className={s.onboardFooter}>
          <Button
            variant="ghost"
            disabled={draft.step === 0 || busy || !repository.ready}
            onClick={() => patch({ step: draft.step - 1 })}
          >
            <ChevronLeft size={14} />
            上一步
          </Button>
          {draft.step === 3 ? (
            <Button disabled={busy} onClick={finish}>
              保存计划并进入工作台
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button disabled={busy || !repository.ready} onClick={next}>
              {draft.step === 1 && !draft.resumeText ? '跳过，下一步' : '下一步'}
              <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </section>
      <p className="mt-5 text-center text-[10px] text-subtle">
        <ShieldCheck size={12} className="inline mr-1" />
        每一步自动保存在当前浏览器；清除浏览器数据会删除本机文件与记录。
      </p>
    </main>
  );
}

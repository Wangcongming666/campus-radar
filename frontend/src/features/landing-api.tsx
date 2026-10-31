import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { isManagementRole } from "../lib/access";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useScroll,
} from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Compass,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquareQuote,
  Radar,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAccount } from "../app/api-shell";
import { Capabilities } from "./landing/Capabilities";
import { Hero } from "./landing/Hero";
import { CompanyCloud, Recruitment } from "./landing/Recruitment";
import { Showcase } from "./landing/Showcase";
import { useLandingData, type LandingData } from "./landing/data";
import { Counter, Reveal } from "./landing/motion";
import "./landing-redesign.css";
const MotionLink = motion.create(Link);
function Navbar() {
  const { user } = useAccount();
  const [menu, setMenu] = useState(false),
    [products, setProducts] = useState(false);
  return (
    <header className="cr-nav">
      <div className="cr-container cr-nav-inner">
        <Link className="cr-brand" to="/">
          <span>
            <Radar />
          </span>
          校招雷达<b>.</b>
        </Link>
        <nav aria-label="首页导航">
          <div
            className="cr-nav-dropdown"
            onMouseEnter={() => setProducts(true)}
            onMouseLeave={() => setProducts(false)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                setProducts(false);
            }}
          >
            <button
              aria-expanded={products}
              aria-controls="cr-product-menu"
              onClick={() => setProducts((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setProducts(false);
              }}
            >
              产品能力
              <ChevronDown />
            </button>
            <AnimatePresence>
              {products && (
                <motion.div
                  id="cr-product-menu"
                  className="cr-nav-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                >
                  {[
                    {
                      title: "发现机会",
                      text: "找到值得认真准备的岗位",
                      path: "/jobs",
                      icon: BriefcaseBusiness,
                    },
                    {
                      title: "管理投递",
                      text: "每一次期待，都清晰可见",
                      path: "/pipeline",
                      icon: LayoutDashboard,
                    },
                    {
                      title: "准备清单",
                      text: "把目标变成今天的小事",
                      path: "/planner",
                      icon: ListChecks,
                    },
                    {
                      title: "面经题库",
                      text: "积累属于自己的答案",
                      path: "/questions",
                      icon: BookOpen,
                    },
                  ].map((item) => (
                    <Link key={item.path} to={item.path}>
                      <item.icon />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.text}</small>
                      </span>
                      <ArrowUpRight />
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <a href="#opportunities">探索机会</a>
          <a href="#workflow">求职工作台</a>
          <a href="#story">关于准备</a>
        </nav>
        <div className="cr-nav-actions">
          <Link to={user ? "/me" : "/login"} className="cr-login">
            {user?.displayName ?? "登录"}
          </Link>
          <Link className="cr-button cr-button-primary" to="/pipeline">
            进入工作台 <ArrowUpRight />
          </Link>
          <button
            className="cr-mobile-toggle"
            aria-label={menu ? "关闭导航" : "打开导航"}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.nav
            className="cr-mobile-menu"
            aria-label="移动首页导航"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {[
              ["产品能力", "#features"],
              ["探索机会", "#opportunities"],
              ["求职工作台", "#workflow"],
              ["关于准备", "#story"],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>
                {label}
                <ArrowRight />
              </a>
            ))}
            <Link to={user ? "/me" : "/login"}>
              {user ? "我的账号" : "登录 / 注册"}
              <ArrowUpRight />
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
function Stats({ data }: { data: LandingData }) {
  const rows = data.stats
    ? ([
        [
          data.stats.companies,
          "收录企业",
          "连接不同行业与发展方向",
          BriefcaseBusiness,
        ],
        [data.stats.openJobs, "在招岗位", "公开发布的实时招聘机会", Compass],
        [
          data.stats.experiences,
          "公开面经",
          "从他人的经历中获得启发",
          MessageSquareQuote,
        ],
        [data.stats.questions, "面试题目", "让每次练习都有新的收获", BookOpen],
      ] as const)
    : null;
  return (
    <section className="cr-stats-section">
      <div className="cr-container">
        <Reveal>
          <div className="cr-stats-heading">
            <span>
              <Radar /> 每一个数字，都是新的可能。
            </span>
            <span>
              公开内容 ·{" "}
              {data.stats && data.lastSynced
                ? `最近同步 ${new Date(data.lastSynced).toLocaleTimeString("zh-CN", { hour12: false })}`
                : data.statsError
                  ? "连接不可用"
                  : "正在连接"}
            </span>
          </div>
          <div className="cr-stats">
            {rows ? (
              rows.map(([value, label, description, Icon]) => (
                <div className="cr-stat" key={label}>
                  <Icon />
                  <strong>
                    <Counter value={value} />
                  </strong>
                  <h3>{label}</h3>
                  <p>{description}</p>
                </div>
              ))
            ) : (
              <div className="cr-stats-status" role="status">
                {data.statsError
                  ? "公开统计暂时不可用，请稍后重试。"
                  : "正在加载公开统计…"}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
function PreparationStory() {
  return (
    <section className="cr-section cr-testimonials" id="story">
      <div className="cr-container">
        <Reveal className="cr-testimonial-heading">
          <h2>认真准备的你，值得更好的下一站。</h2>
          <p>让投递有进展，让准备有节奏，让积累被看见。</p>
        </Reveal>
        <Reveal className="cr-story-strip">
          <span>
            <Sparkles />
            远方，总值得想象。
          </span>
          <span>日常，也正在发光。</span>
          <span>
            出发，不必等到完美。
            <ArrowUpRight />
          </span>
        </Reveal>
      </div>
    </section>
  );
}
function Footer() {
  const { user } = useAccount();
  return (
    <>
      <section className="cr-cta">
        <div className="cr-cta-ring cr-cta-ring-1" />
        <div className="cr-cta-ring cr-cta-ring-2" />
        <div className="cr-cta-ring cr-cta-ring-3" />
        <Reveal>
          <span>YOUR NEXT CHAPTER</span>
          <h2>下一步，从今天开始。</h2>
          <p>给努力一个方向，让每一种可能慢慢发生。</p>
          <MotionLink
            whileHover={{ scale: 1.05, y: -3 }}
            whileTap={{ scale: 0.97 }}
            className="cr-cta-button"
            to={user ? "/pipeline" : "/register"}
          >
            {user ? "回到我的工作台" : "免费创建账号"}
            <ArrowRight />
          </MotionLink>
          <small>
            <ShieldCheck />
            账号保存进度 · 为你的下一步准备
          </small>
        </Reveal>
      </section>
      <footer className="cr-footer">
        <div className="cr-container">
          <div className="cr-footer-main">
            <div>
              <Link className="cr-brand" to="/">
                <span>
                  <Radar />
                </span>
                校招雷达<b>.</b>
              </Link>
              <p>
                让每一次投递，都有方向。
                <br />
                让每一次准备，都有所积累。
              </p>
            </div>
            <div>
              <strong>发现机会</strong>
              <Link to="/jobs">岗位广场</Link>
              <Link to="/radar">公司情报</Link>
              <Link to="/experiences">面试经验</Link>
            </div>
            <div>
              <strong>认真准备</strong>
              <Link to="/pipeline">投递看板</Link>
              <Link to="/planner">准备清单</Link>
              <Link to="/questions">面经题库</Link>
            </div>
            <div>
              <strong>我的工作台</strong>
              <Link to="/resumes">简历管理</Link>
              <Link to="/calendar">面试日历</Link>
              <Link to="/handbook">知识宝典</Link>
            </div>
          </div>
          <div className="cr-footer-bottom">
            <span>校招雷达 Campus Radar</span>
            <span>每个小小进步，都值得被看见。</span>
            <a href="#top">回到顶部 ↑</a>
          </div>
        </div>
      </footer>
    </>
  );
}
export function ApiLandingPage() {
  const data = useLandingData();
  const { scrollYProgress } = useScroll();
  if (isManagementRole(data.user?.role))
    return <Navigate to="/admin" replace />;
  return (
    <MotionConfig reducedMotion="user">
      <div className="cr-page">
        <motion.div
          className="cr-scroll-progress"
          style={{ scaleX: scrollYProgress }}
          aria-hidden="true"
        />
        <Navbar />
        <main>
          <Hero data={data} />
          <Stats data={data} />
          <Capabilities data={data} />
          <Recruitment data={data} />
          <CompanyCloud data={data} />
          <Showcase data={data} />
          <PreparationStory />
          <Footer />
        </main>
      </div>
    </MotionConfig>
  );
}

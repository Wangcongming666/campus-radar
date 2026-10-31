import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  MapPin,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { jobHref, type LandingData } from "./data";
import { Reveal } from "./motion";
export function Hero({ data }: { data: LandingData }) {
  const [query, setQuery] = useState(""),
    [focused, setFocused] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q && [...q].length < 2) {
      setError("搜索关键词至少为两个字符。");
      return;
    }
    navigate(q ? `/jobs?${new URLSearchParams({ q })}` : "/jobs");
  }
  return (
    <section className="cr-hero" id="top">
      <div className="cr-hero-wash" />
      <div className="cr-container cr-hero-grid">
        <Reveal className="cr-hero-copy">
          <div className="cr-kicker">
            <span /> 让准备，更有方向 <ArrowRight size={14} />
          </div>
          <h1>
            让每一次投递，
            <br />
            都有<span>方向。</span>
          </h1>
          <p className="cr-hero-description">
            从发现机会到拿下心仪 Offer。
            <br />
            把岗位、投递、面试与成长，放进一个清晰的工作台。
          </p>
          <motion.div
            className={`cr-search-area ${focused ? "is-focused" : ""}`}
            animate={{ y: focused ? -5 : 0 }}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
            }}
          >
            <form className="cr-search" onSubmit={search}>
              <Search />
              <input
                aria-label="搜索岗位、公司或技能关键词"
                placeholder="搜索岗位、公司或技能关键词"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setError("");
                }}
                maxLength={100}
                aria-expanded={focused}
                aria-controls="home-hot-search"
              />
              <button type="submit">
                搜索 <ArrowRight />
              </button>
            </form>
            <AnimatePresence>
              {focused && (
                <motion.div
                  className="cr-search-popover"
                  id="home-hot-search"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                >
                  <span>热门方向</span>
                  {["前端", "算法", "产品", "后端", "设计"].map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() =>
                        navigate(`/jobs?${new URLSearchParams({ q: word })}`)
                      }
                    >
                      {word}
                      <ArrowUpRight />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          {error && (
            <p className="cr-error" role="alert">
              {error}
            </p>
          )}
          <div className="cr-hero-links">
            <Link to="/jobs">
              探索岗位 <ArrowUpRight />
            </Link>
            <Link to="/pipeline">
              体验求职工作台 <ArrowUpRight />
            </Link>
          </div>
          <div className="cr-trust">
            <ShieldCheck /> 账号保存进度 <i /> 私有简历与学习笔记
          </div>
        </Reveal>
        <HeroDeck data={data} />
      </div>
      <div className="cr-container cr-hero-bottom">
        <span>从现在开始，走近理想的自己。</span>
        <span>
          SCROLL TO EXPLORE <span>↓</span>
        </span>
      </div>
    </section>
  );
}
function HeroDeck({ data }: { data: LandingData }) {
  const [active, setActive] = useState(0),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const reduced = useReducedMotion();
  const jobs = data.previews;
  useEffect(() => {
    if (!visible || paused || hover || reduced || jobs.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive((i) => (i + 1) % jobs.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [visible, paused, hover, reduced, jobs.length]);
  const current = jobs.length ? active % jobs.length : 0;
  return (
    <Reveal className="cr-hero-visual" delay={0.12}>
      <div
        ref={ref}
        className="cr-deck"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setHover(false);
        }}
      >
        <div className="cr-deck-orbit" aria-hidden="true">
          <Radar />
        </div>
        <div className="cr-deck-caption">
          <span>
            <span className="cr-live-dot" /> {"正在招聘 · 机会雷达"}
          </span>
          <span>{"公开岗位"}</span>
        </div>
        <div className="cr-deck-stage">
          {!jobs.length && (
            <div className="cr-real-empty">
              <BriefcaseBusiness />
              <h3>
                {data.jobsState === "loading"
                  ? "正在读取岗位…"
                  : data.jobsState === "error"
                    ? "岗位暂时无法加载"
                    : "暂无在招岗位"}
              </h3>
              <p>这里会展示后端发布的招聘机会。</p>
              <Link to="/jobs">
                前往岗位广场 <ArrowRight />
              </Link>
            </div>
          )}
          {jobs.map((job, i) => {
            const position = (i - current + jobs.length) % jobs.length;
            const shown = position < 3;
            return (
              <motion.article
                key={job.id}
                className={`cr-deck-card cr-deck-card-${i % 3}`}
                style={{
                  zIndex: 5 - position,
                  pointerEvents: position === 0 ? "auto" : "none",
                }}
                initial={false}
                animate={{
                  y: shown ? position * 42 : -55,
                  x: shown ? position * -11 : 35,
                  scale: shown ? 1 - position * 0.055 : 0.95,
                  rotateZ: shown ? position * -2 : 5,
                  opacity: shown ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 145, damping: 24 }}
                aria-hidden={position !== 0}
              >
                <div className="cr-deck-company">
                  <span className="cr-logo-box">
                    <BriefcaseBusiness />
                  </span>
                  <div>
                    <strong>{job.company}</strong>
                    <small>{"校园招聘机会"}</small>
                  </div>
                  <ArrowUpRight />
                </div>
                <h2>{job.title}</h2>
                <p>
                  <MapPin />
                  {job.city} <span>·</span> {job.salary}
                </p>
                <div className="cr-job-tags">
                  {job.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="cr-deck-card-footer">
                  <span>
                    <Sparkles /> 为下一次出发做准备
                  </span>
                  <Link to={jobHref(job)} tabIndex={position === 0 ? 0 : -1}>
                    {"查看岗位"}
                    <ArrowRight />
                  </Link>
                </div>
              </motion.article>
            );
          })}
        </div>
        <div className="cr-deck-controls" hidden={!jobs.length}>
          <span>
            <b>{String(current + 1).padStart(2, "0")}</b> /{" "}
            {String(jobs.length).padStart(2, "0")}
          </span>
          <div>
            {jobs.map((_, i) => (
              <button
                key={i}
                className={current === i ? "active" : ""}
                onClick={() => setActive(i)}
                aria-label={`展示第 ${i + 1} 个岗位`}
              />
            ))}
          </div>
          <button
            aria-label={paused ? "自动播放首屏岗位" : "暂停首屏岗位"}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <CirclePlay /> : <CirclePause />}
          </button>
          <button
            aria-label="上一个首屏岗位"
            onClick={() =>
              setActive((i) => (i - 1 + jobs.length) % jobs.length)
            }
          >
            <ChevronLeft />
          </button>
          <button
            aria-label="下一个首屏岗位"
            onClick={() => setActive((i) => (i + 1) % jobs.length)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </Reveal>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
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
  MousePointer2,
} from "lucide-react";
import { jobHref, type JobPreview, type LandingData } from "./data";
import { Reveal } from "./motion";
function RecruitmentCard({
  job,
  index,
  dragged,
}: {
  job: JobPreview;
  index: number;
  dragged: React.RefObject<boolean>;
}) {
  const rotateX = useMotionValue(0),
    rotateY = useMotionValue(0);
  const reduced = useReducedMotion();
  return (
    <motion.article
      className={`cr-recruit-card cr-recruit-${index % 4}`}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType === "touch") return;
        const rect = e.currentTarget.getBoundingClientRect();
        rotateY.set(((e.clientX - rect.left) / rect.width - 0.5) * 7);
        rotateX.set(-((e.clientY - rect.top) / rect.height - 0.5) * 7);
      }}
      onPointerLeave={() => {
        animate(rotateX, 0);
        animate(rotateY, 0);
      }}
    >
      <div className="cr-recruit-top">
        <span className="cr-recruit-logo">
          <BriefcaseBusiness />
        </span>
        <span>
          {"正在招聘"}
          <i />
        </span>
      </div>
      <div className="cr-building-art" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="cr-recruit-company">{job.company}</span>
      <h3>{job.title}</h3>
      <p>{job.salary}</p>
      <div className="cr-job-tags">
        {job.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="cr-recruit-bottom">
        <span>{job.city}</span>
        <Link
          draggable={false}
          to={jobHref(job)}
          onClick={(e) => {
            if (dragged.current) e.preventDefault();
          }}
        >
          {"查看岗位"}
          <ArrowUpRight />
        </Link>
      </div>
    </motion.article>
  );
}
export function Recruitment({ data }: { data: LandingData }) {
  const viewport = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null),
    dragged = useRef(false);
  const x = useMotionValue(0);
  const [bounds, setBounds] = useState(0),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false);
  const visible = useInView(viewport);
  const reduced = useReducedMotion();
  const count = data.previews.length;
  const [step, setStep] = useState(355);
  useEffect(() => {
    const measure = () => {
      if (!viewport.current || !track.current) return;
      const first = track.current.firstElementChild as HTMLElement | null;
      const size = (first?.getBoundingClientRect().width ?? 335) + 20;
      setStep(size);
      setBounds(
        Math.max(0, track.current.scrollWidth - viewport.current.clientWidth),
      );
      x.set(0);
      setIndex(0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [count, x]);
  function go(next: number) {
    const max = Math.ceil(bounds / step);
    const target = Math.max(0, Math.min(max, next));
    setIndex(target);
    animate(x, -Math.min(bounds, target * step), {
      type: "spring",
      stiffness: 110,
      damping: 25,
    });
  }
  useEffect(() => {
    if (!visible || reduced || paused || hover || !bounds) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((previous) => {
        const next = previous >= Math.ceil(bounds / step) ? 0 : previous + 1;
        animate(x, -Math.min(bounds, next * step), {
          type: "spring",
          stiffness: 80,
          damping: 22,
        });
        return next;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [visible, reduced, paused, hover, bounds, step, x]);
  return (
    <section className="cr-section cr-recruitment" id="opportunities">
      <div className="cr-container">
        <Reveal className="cr-section-head">
          <div>
            <span className="cr-eyebrow">下一站，遇见更多可能</span>
            <h2>{"在招好机会，快人一步发现。"}</h2>
            <p>{"从最新发布的在招岗位里，发现属于你的下一站。"}</p>
          </div>
          <div className="cr-slider-arrows">
            <button
              aria-label="上一组招聘岗位"
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              <ChevronLeft />
            </button>
            <button
              aria-label="下一组招聘岗位"
              onClick={() => go(index + 1)}
              disabled={index >= Math.ceil(bounds / step)}
            >
              <ChevronRight />
            </button>
          </div>
        </Reveal>
        <div
          className="cr-carousel-viewport"
          ref={viewport}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setHover(false);
          }}
        >
          <motion.div
            className="cr-carousel-track"
            ref={track}
            style={{ x }}
            drag="x"
            dragConstraints={{ left: -bounds, right: 0 }}
            dragElastic={0.06}
            dragMomentum={false}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={() => {
              const next = Math.round(Math.abs(x.get()) / step);
              go(next);
              window.setTimeout(() => {
                dragged.current = false;
              }, 80);
            }}
          >
            {data.previews.map((job, i) => (
              <RecruitmentCard
                key={job.id}
                job={job}
                index={i}
                dragged={dragged}
              />
            ))}
          </motion.div>
        </div>
        <div className="cr-carousel-footer">
          <span>
            <MousePointer2 />
            {data.jobsState === "loading"
              ? "正在读取公开岗位…"
              : data.jobsState === "error"
                ? "岗位服务暂不可用"
                : data.previews.length
                  ? "按住卡片左右拖动，发现更多机会"
                  : "暂无在招岗位"}
          </span>
          <div className="cr-carousel-pagination">
            {Array.from({ length: Math.ceil(bounds / step) + 1 }, (_, i) => (
              <button
                key={i}
                className={i === index ? "active" : ""}
                aria-label={`招聘轮播第 ${i + 1} 页`}
                onClick={() => go(i)}
              />
            ))}
            <button
              className="cr-autoplay"
              aria-label={paused ? "开启招聘轮播自动播放" : "暂停招聘轮播"}
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? <CirclePlay /> : <CirclePause />}
            </button>
          </div>
          <Link to="/jobs">
            全部岗位 <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
export function CompanyCloud({ data }: { data: LandingData }) {
  return (
    <section className="cr-company-cloud">
      <div className="cr-container">
        <Reveal>
          <div className="cr-cloud-heading">
            <div>
              <span className="cr-eyebrow">连接不同的可能</span>
              <h2>走近你向往的企业。</h2>
            </div>
            <span>已收录企业</span>
          </div>
          {data.companies.length ? (
            <div className="cr-logo-cloud">
              {data.companies.map((company, i) => (
                <motion.div key={company.id} whileHover={{ y: -6 }}>
                  <Link
                    to={`/company/${company.id}`}
                    className={`cr-cloud-logo cr-cloud-logo-${i % 4}`}
                  >
                    <BriefcaseBusiness />
                    <strong>{company.name}</strong>
                    <ArrowUpRight />
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="cr-real-empty">
              <p>
                {data.companiesError
                  ? "企业资料暂时不可用，请稍后重试。"
                  : "暂无收录企业。"}
              </p>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

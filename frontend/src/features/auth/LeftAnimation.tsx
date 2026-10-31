import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Orbit, Radio, Radar } from "lucide-react";
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
};
export function LeftAnimation({
  mode = "login",
  engaged,
  submitting,
  progress = 0,
  complete = false,
}: {
  mode?: "login" | "register";
  engaged: boolean;
  submitting: boolean;
  progress?: number;
  complete?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    state = useRef({ mode, engaged, progress, complete }),
    invalidate = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    state.current = { mode, engaged, progress, complete };
    invalidate.current?.();
  }, [mode, engaged, progress, complete]);
  useEffect(() => {
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const desktop = matchMedia("(min-width:900px)");
    let width = 0,
      height = 0,
      dpr = 1,
      frame = 0,
      last = 0,
      elapsed = 0,
      blend = state.current.mode === "register" ? 1 : 0,
      intensity = 0;
    const particles: Particle[] = Array.from({ length: 86 }, (_, i) => {
      const angle = i * 2.399963,
        radius = Math.sqrt((i + 0.5) / 86);
      return {
        x: 0.52 + Math.cos(angle) * radius * 0.43,
        y: 0.4 + Math.sin(angle) * radius * 0.3,
        vx: Math.sin(i * 1.93) * 0.000035,
        vy: Math.cos(i * 2.71) * 0.000029,
        size: i % 9 === 0 ? 2.3 : 1.1,
        seed: i * 0.7,
      };
    });
    function orbitPoint(
      angle: number,
      group: number,
      radius: number,
      cx: number,
      cy: number,
    ) {
      const rotation = (group - 1) * 0.85,
        rx = Math.cos(angle) * radius * (0.75 + group * 0.16),
        ry = Math.sin(angle) * radius * 0.33;
      return {
        x: cx + rx * Math.cos(rotation) - ry * Math.sin(rotation),
        y: cy + rx * Math.sin(rotation) + ry * Math.cos(rotation),
      };
    }
    function draw(time: number) {
      if (!canvas || !ctx || !width || !height) return;
      const dt = Math.min(32, Math.max(0, last ? time - last : 16));
      last = time;
      const current = state.current;
      const target = current.mode === "register" ? 1 : 0;
      blend = reduced
        ? target
        : blend + (target - blend) * Math.min(1, dt / 130);
      // Finish the crossfade instead of submitting almost-transparent layers forever.
      if (Math.abs(target - blend) < 0.001) blend = target;
      intensity = current.engaged
        ? 1
        : reduced
          ? 0
          : Math.max(0, intensity - dt / 500);
      if (!reduced) elapsed += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, Math.ceil(width), Math.ceil(height));
      ctx.beginPath();
      const cx = width * 0.52,
        cy = height * 0.39,
        radius = Math.min(width * 0.34, height * 0.28),
        energy = Math.max(current.progress, current.complete ? 1 : 0);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.6);
      glow.addColorStop(
        0,
        `rgba(${Math.round(15 + blend * 65)}, ${Math.round(202 - blend * 50)}, 230, ${0.085 + intensity * 0.19 + blend * 0.045})`,
      );
      glow.addColorStop(
        0.5,
        `rgba(25,115,190,${0.04 + intensity * 0.065 + blend * 0.04})`,
      );
      glow.addColorStop(1, "rgba(5,90,140,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      // Do not send zero-alpha gradients to the browser's canvas compositor.
      if (1 - blend >= 0.001) {
        ctx.save();
        ctx.globalAlpha = 1 - blend;
        ctx.translate(cx, cy);
        for (let ring = 1; ring <= 4; ring++) {
          ctx.beginPath();
          ctx.arc(0, 0, (radius * ring) / 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(116,217,235,${0.1 + intensity * 0.1})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        ctx.setLineDash([2, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.14, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(125,211,252,.18)";
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.rotate(elapsed * 0.00013);
        // Bounded strokes retain the scan trail without a transparent filled wedge.
        for (let trail = 0; trail < 24; trail++) {
          const fraction = trail / 23,
            angle = -0.48 * (1 - fraction);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          ctx.strokeStyle = `rgba(34,211,238,${0.008 + fraction * fraction * (0.04 + intensity * 0.035)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius, 0);
        ctx.strokeStyle = `rgba(103,232,249,${0.3 + intensity * 0.3})`;
        ctx.stroke();
        ctx.restore();
      }
      if (blend >= 0.001) {
        ctx.save();
        ctx.globalAlpha = blend;
        for (let group = 0; group < 3; group++) {
          ctx.beginPath();
          for (let step = 0; step <= 150; step++) {
            const point = orbitPoint(
              (step / 150) * Math.PI * 2,
              group,
              radius,
              cx,
              cy,
            );
            if (step === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          }
          ctx.strokeStyle = [
            `rgba(125,211,252,${0.22 + energy * 0.16})`,
            `rgba(165,180,252,${0.19 + energy * 0.16})`,
            `rgba(103,232,249,${0.2 + energy * 0.16})`,
          ][group];
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        for (let pulse = 0; pulse < 3; pulse++) {
          const phase = (elapsed * 0.00012 + pulse / 3) % 1;
          ctx.beginPath();
          ctx.arc(cx, cy, 22 + phase * radius * 0.55, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(143,211,255,${(1 - phase) * 0.11})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        const core = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          42 + energy * 12,
        );
        core.addColorStop(0, "rgba(213,246,255,.9)");
        core.addColorStop(0.13, "rgba(125,211,252,.65)");
        core.addColorStop(0.48, "rgba(99,140,241,.17)");
        core.addColorStop(1, "rgba(99,140,241,0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const points = particles.map((p, i) => {
        if (!reduced) {
          p.x += p.vx * dt * (1 + intensity * 3.5) * (1 - blend * 0.8);
          p.y += p.vy * dt * (1 + intensity * 3.5) * (1 - blend * 0.8);
          if (p.x < 0.06 || p.x > 0.97) p.vx *= -1;
          if (p.y < 0.07 || p.y > 0.76) p.vy *= -1;
        }
        const targetPoint = orbitPoint(
          (i / particles.length) * Math.PI * 6 +
            elapsed * 0.00017 * (i % 2 ? 1 : -1) +
            (i % 3) * 0.5,
          i % 3,
          radius,
          cx,
          cy,
        );
        return {
          x: p.x * width * (1 - blend) + targetPoint.x * blend,
          y: p.y * height * (1 - blend) + targetPoint.y * blend,
          size: p.size,
          seed: p.seed,
        };
      });
      const limit = Math.min(width * 0.17, 140);
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (blend < 0.99)
          for (let j = i + 1; j < points.length; j++) {
            const next = points[j],
              distance = Math.hypot(point.x - next.x, point.y - next.y);
            if (distance > limit) continue;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(next.x, next.y);
            ctx.strokeStyle = `rgba(91,212,238,${(1 - distance / limit) * (0.12 + intensity * 0.36) * (1 - blend)})`;
            ctx.lineWidth = 0.55 + intensity * 0.65;
            ctx.stroke();
          }
        ctx.beginPath();
        ctx.arc(
          point.x,
          point.y,
          point.size + intensity * 0.4 + blend * 0.2,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(${Math.round(154 + blend * 35)},234,249,${0.45 + Math.sin(elapsed * 0.001 + point.seed) * 0.13 + intensity * 0.22})`;
        ctx.fill();
        if (point.size > 2) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6 + intensity * 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(145,223,249,${0.15 + intensity * 0.15})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + blend * 2, 0, Math.PI * 2);
      ctx.fillStyle = "#b9f0ff";
      ctx.fill();
    }
    function tick(time: number) {
      frame = 0;
      if (document.hidden || !desktop.matches) return;
      draw(time);
      if (!reduced) frame = requestAnimationFrame(tick);
    }
    function restart() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (!document.hidden && desktop.matches)
        frame = requestAnimationFrame(tick);
    }
    function resize() {
      const box = canvas!.getBoundingClientRect();
      width = box.width;
      height = box.height;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      restart();
    }
    invalidate.current = restart;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", restart);
    desktop.addEventListener("change", resize);
    resize();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      desktop.removeEventListener("change", resize);
      invalidate.current = null;
    };
  }, [reduced]);
  const registering = mode === "register";
  const headline = registering ? (
    complete ? (
      <>
        新的旅程，
        <br />
        即将为你开启。
      </>
    ) : (
      <>
        让未来，
        <br />
        从这一刻生长。
      </>
    )
  ) : engaged ? (
    <>
      正在连接，
      <br />
      你的专属雷达<span>...</span>
    </>
  ) : (
    <>
      让每一次投递，
      <br />
      都有方向。
    </>
  );
  return (
    <section
      className={`login-visual ${engaged ? "is-engaged" : ""} ${registering ? "is-registering" : ""}`}
      data-radar-state={engaged ? "connected" : "idle"}
      data-visual-mode={mode}
      aria-label={registering ? "星轨汇聚动态视觉" : "求职雷达动态视觉"}
    >
      <div className="login-visual-grid" />
      <div className="auth-visual-register-wash" />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="login-visual-top">
        <span>{registering ? <Orbit /> : <Radio />} CAMPUS RADAR NETWORK</span>
        <span>
          <i />
          {submitting
            ? "VERIFYING"
            : complete
              ? "READY"
              : engaged
                ? "CONNECTED"
                : "STANDBY"}
        </span>
      </div>
      <div className="auth-orbit-label auth-orbit-label-a" aria-hidden="true">
        <span />
        {registering ? "每个目标，都值得认真出发" : "发现你的下一种可能"}
      </div>
      <div className="auth-orbit-label auth-orbit-label-b" aria-hidden="true">
        <span />
        {registering ? "从今天，积累自己的轨迹" : "让机会，有迹可循"}
      </div>
      <div className="login-visual-copy">
        <Link to="/" className="login-brand login-brand-light">
          <Radar />
          校招雷达<span>.</span>
        </Link>
        <div className="login-headline-space">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={
                registering
                  ? complete
                    ? "complete"
                    : "register"
                  : engaged
                    ? "connecting"
                    : "default"
              }
              initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
              transition={{ duration: 0.18 }}
              className={engaged && !registering ? "is-connected" : ""}
            >
              {headline}
            </motion.h2>
          </AnimatePresence>
        </div>
        <p>
          {registering
            ? "从一个属于自己的账号，开始每一步有方向的准备。"
            : "连接值得奔赴的机会，记录属于你的求职轨迹。"}
        </p>
        <div className="login-visual-bottom">
          {registering ? (
            <>
              <span>
                {complete
                  ? "现在就能开始你的求职旅程"
                  : "给未来，留一个出发的入口。"}
              </span>
              <div className="auth-orbit-progress" aria-label="注册填写进度">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={progress > i / 4 || complete ? "lit" : ""}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <span>让每一次准备，都有所积累。</span>
              <ArrowUpRight />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

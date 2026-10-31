import { useEffect, useRef, type ReactNode } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
export const reveal = {
  initial: { opacity: 0, y: 25 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.55 },
};
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      {...reveal}
      initial={reduced ? false : reveal.initial}
      transition={{ duration: reduced ? 0 : 0.55, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
export function Spotlight({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const x = useMotionValue(-400),
    y = useMotionValue(-400);
  const background = useMotionTemplate`radial-gradient(360px circle at ${x}px ${y}px, rgba(37,99,235,.13), transparent 75%)`;
  return (
    <motion.article
      className={`cr-feature ${className}`}
      whileHover={{ y: -5 }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - rect.left);
        y.set(e.clientY - rect.top);
      }}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
    >
      <motion.div
        className="cr-spotlight"
        style={{ background }}
        aria-hidden="true"
      />
      {children}
    </motion.article>
  );
}
export function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current || !visible) return;
    const node = ref.current;
    const control = animate(0, value, {
      duration: reduced ? 0 : 1.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => {
        node.textContent = Math.round(n).toLocaleString("zh-CN");
      },
    });
    return () => control.stop();
  }, [value, visible, reduced]);
  return <span ref={ref}>0</span>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
/** Render the final value to assistive technology, while the visual count animates once. */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!inView || reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (n) => setDisplay(Math.round(n)),
    });
    return () => controls.stop();
  }, [value, inView, reduced]);
  return (
    <>
      <span ref={ref} aria-hidden>
        {display}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}

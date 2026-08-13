"use client";

import { useEffect, useRef } from "react";

/**
 * The reference film's signature move: a slow, continuous push into the
 * product shot as the hero scrolls away. Driven by scroll position rather than
 * a timed animation, so the motion is always under the visitor's control.
 *
 * Only `transform` is touched and it is written inside a rAF, so the work
 * stays on the compositor and at most once per frame regardless of how many
 * scroll events fire.
 */
export default function ParallaxShot({
  children,
  className,
  /** Extra scale at the end of the travel — deliberately small. */
  intensity = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      // Progress across the first viewport of scrolling, clamped so the push
      // finishes as the hero leaves and never keeps growing down the page.
      const progress = Math.min(Math.max(window.scrollY / window.innerHeight, 0), 1);
      const scale = 1 + progress * intensity;
      const lift = progress * -22;
      el.style.transform = `translate3d(0, ${lift}px, 0) scale(${scale})`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [intensity]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

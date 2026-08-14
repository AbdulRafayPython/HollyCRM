"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

/**
 * PLACEHOLDER FIGURES — verify or remove before launch.
 *
 * "5M+ messages", "200+ agencies" and "35% higher conversion" are marketing
 * claims of the same class as the placeholder testimonials: nothing in this
 * repo substantiates them. "100% SQL pricing accuracy" is the one that is
 * defensible, because it describes the architecture rather than a result —
 * the model never authors a rate.
 */
const STATS = [
  { to: 5, prefix: "", suffix: "M+", label: "Pilgrim messages handled" },
  { to: 100, prefix: "", suffix: "%", label: "SQL pricing accuracy" },
  { to: 35, prefix: "", suffix: "%", label: "Higher booking conversion" },
  { to: 200, prefix: "", suffix: "+", label: "Agencies across the Gulf" },
];

/** Decelerating curve — fast off the mark, long settle, same feel as the reveals. */
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts from zero to the figure once the bar is on screen. A number that
 * arrives already final reads as a static graphic; one that lands draws the
 * eye to it, which is the entire job of this row.
 */
function Counter({ to, prefix, suffix }: { to: number; prefix: string; suffix: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const settle = () => setValue(to);

    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      settle();
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const duration = 1400;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setValue(to * easeOutExpo(progress));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [to]);

  // Rounded on the way up so the digits never flicker through decimals.
  const shown = value >= to ? to : Math.round(value);

  return (
    <div
      ref={ref}
      className="mkt-display text-2xl font-extrabold tabular-nums text-graphite sm:text-3xl"
    >
      {prefix}
      {shown}
      {suffix}
    </div>
  );
}

/**
 * One card, four figures, hairline dividers — the reference treats this as a
 * single object bridging the hero and the feature grid, not four loose tiles.
 */
export default function MetricsBar() {
  return (
    <section className="relative z-10 -mt-4 pb-8 sm:pb-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="zoom">
          <div className="grid grid-cols-2 gap-y-8 rounded-2xl bg-plate px-6 py-8 shadow-lift ring-1 ring-rule sm:px-10 lg:grid-cols-4 lg:gap-y-0">
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className={`text-center ${i > 0 ? "lg:border-l lg:border-rule" : ""} ${
                  i % 2 === 1 ? "border-l border-rule lg:border-l" : ""
                }`}
              >
                <Counter to={stat.to} prefix={stat.prefix} suffix={stat.suffix} />
                <div className="mt-1 px-2 font-plex text-xs font-medium text-haze">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

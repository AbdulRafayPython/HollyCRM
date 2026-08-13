"use client";

import { useEffect, useRef } from "react";

export type RevealVariant = "up" | "left" | "right" | "zoom";

/**
 * Scroll-triggered entrance.
 *
 * The element ships hidden (see the `[data-reveal]` rules in globals.css) and
 * an IntersectionObserver adds `.is-revealed` once it crosses into view. It
 * fires once and then disconnects — a section that re-animates every time you
 * scroll past reads as a bug, not as polish.
 *
 * `delay` is what produces the staggered cascade inside a group: pass the same
 * step multiplied by the item index.
 */
export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  className,
  id,
}: {
  children: React.ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Anything without an observer (or already past the fold on load) should
    // just be visible rather than stuck at opacity 0.
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-revealed");
        observer.disconnect();
      },
      // Held back slightly from the viewport edge so the motion starts while
      // the element is comfortably on screen, not clipped by the fold.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      data-reveal={variant}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </div>
  );
}

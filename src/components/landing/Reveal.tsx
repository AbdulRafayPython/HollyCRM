"use client";

import { useEffect, useRef } from "react";

export type RevealVariant = "up" | "left" | "right" | "zoom";

/**
 * Scroll-triggered entrance.
 *
 * The element ships with transition styling and an IntersectionObserver adds
 * `.is-revealed`. On initial page load, elements already within the viewport
 * (such as hero headlines and hero product mockups) reveal immediately.
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

    // If IntersectionObserver is unsupported, reveal immediately
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-revealed");
      return;
    }

    // Elements already above or inside viewport on mount reveal immediately
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-revealed");
        observer.disconnect();
      },
      { rootMargin: "0px 0px 80px 0px", threshold: 0.01 }
    );

    observer.observe(el);

    // Guaranteed fallback: ensures no element stays permanently hidden
    const timer = setTimeout(() => {
      if (el) el.classList.add("is-revealed");
    }, 600);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
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

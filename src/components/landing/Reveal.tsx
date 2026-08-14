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

    let first = 0;
    let second = 0;

    // Flipping the class in the same frame the element first paints gives the
    // browser no start value to interpolate from, so the transition is skipped
    // and the element snaps in. Two rAFs guarantee the pre-reveal state paints
    // once, which is what makes the entrance actually travel.
    const reveal = () => {
      first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => el.classList.add("is-revealed"));
      });
    };

    // No observer support: hand the content over rather than hide it.
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    // An observer fires on its first callback for anything already intersecting,
    // so hero content still enters on load — no separate in-viewport branch is
    // needed, and going through `reveal()` keeps that entrance animated.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        reveal();
        observer.disconnect();
      },
      // Negative bottom inset: the element has to clear the fold by 80px before
      // it enters, so the motion happens where the visitor is looking.
      { rootMargin: "0px 0px -80px 0px", threshold: 0 }
    );

    observer.observe(el);

    // No time-based fallback here on purpose. A blanket timer reveals every
    // element on the page a moment after load — including everything below the
    // fold — and by the time the visitor scrolls there is no motion left to see.
    // Scripting-off is covered by the <noscript> rule in app/layout.tsx.
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
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

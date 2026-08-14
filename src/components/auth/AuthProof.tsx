"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The branding panel on the auth screen: three product scenarios that cycle.
 *
 * The renders already sit on the same graphite ground as the panel (sampled
 * corners land within a level or two of `ink`), so they are deliberately NOT
 * framed in a card — they float directly on the panel and the seam disappears.
 * A radial mask handles the last couple of levels of difference so the square
 * edge can never show.
 *
 * Motion vocabulary is borrowed from the landing hero so the two surfaces feel
 * like one product: a staggered entrance, an idle levitate with the scenes
 * crossfading over it, and a slow scale on the outgoing frame so the swap
 * reads as a camera move rather than a slideshow.
 */

const SCENES = [
  {
    src: "/landing/auth-scene-analytics.webp",
    label: "Insights",
    copy: "Know what closed, and why.",
    alt: "Floating dashboard panels showing a bar chart, a trend line and a donut chart",
  },
  {
    src: "/landing/auth-scene-workflow.webp",
    label: "Automations",
    copy: "Wire your own agents on a canvas.",
    alt: "A floating canvas of connected workflow nodes",
  },
  {
    src: "/landing/auth-scene-pipeline.webp",
    label: "Pipeline",
    copy: "Stages that move themselves.",
    alt: "A floating pipeline board with three columns of cards, one mid-move",
  },
];

const DWELL = 5200;

export default function AuthProof() {
  const [active, setActive] = useState(0);
  const [still, setStill] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    // Someone who asked for less motion gets the first scene and nothing else
    // moving — no carousel, no float. The dots still work as real controls.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => {
      if (paused.current) return;
      setActive((i) => (i + 1) % SCENES.length);
    }, DWELL);
    return () => window.clearInterval(id);
  }, [still]);

  return (
    <div
      className="flex flex-col gap-5"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      {/* The stage. The renders carry their own alpha now, so the box takes the
          full column width and is bound by HEIGHT instead — the art scales up
          to fill the width and the height clamp is what keeps the panel inside
          the fold from 720px up. No mask and no frame: with the backgrounds
          cut out there is no edge left to hide. */}
      <div
        className={`animate-proof-in relative h-[clamp(12rem,46vh,26rem)] w-full ${
          still ? "" : "animate-levitate"
        }`}
        style={
          {
            ["--proof-delay" as string]: "180ms",
            ["--float-dur" as string]: "7s",
          } as React.CSSProperties
        }
      >
        {SCENES.map((scene, i) => (
          <div
            key={scene.src}
            aria-hidden={i !== active}
            className={`absolute inset-0 transition-[opacity,transform] duration-[900ms] ease-swift ${
              i === active ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"
            }`}
          >
            <Image
              src={scene.src}
              alt={i === active ? scene.alt : ""}
              fill
              priority={i === 0}
              sizes="(min-width: 1024px) 33rem, 100vw"
              className="object-contain"
            />
          </div>
        ))}
      </div>

      {/* Caption + controls. The caption is what makes the three renders read
          as three scenarios rather than three abstract pictures. */}
      <div
        className="animate-proof-in flex items-end justify-between gap-6"
        style={{ ["--proof-delay" as string]: "320ms" } as React.CSSProperties}
      >
        {/* Fixed height and clipped, not min-height: these children are
            absolutely positioned so they stretch to this box, and any caption
            that ran taller than it pushed the whole panel into overflow. */}
        <div className="relative h-[2.9rem] flex-1 overflow-hidden">
          {SCENES.map((scene, i) => (
            <div
              key={scene.src}
              aria-hidden={i !== active}
              className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-swift ${
                i === active
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1.5 opacity-0"
              }`}
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-brass">
                {scene.label}
              </p>
              <p className="mt-1 text-sm leading-snug text-surface/70">{scene.copy}</p>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 pb-1">
          {SCENES.map((scene, i) => (
            <button
              key={scene.src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${scene.label}`}
              aria-current={i === active}
              className={`h-1.5 rounded-full transition-all duration-500 ease-swift focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${
                i === active ? "w-7 bg-brass" : "w-1.5 bg-white/25 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

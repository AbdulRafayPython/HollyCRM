import React from "react";

/**
 * `tone` picks the lockup for the ground it sits on: `"light"` on paper,
 * `"dark"` on the graphite footer card.
 *
 * `"app"` is kept as an alias of `"light"` rather than removed, so the
 * workstation's existing call sites keep working. It used to be a violet
 * gradient box; now the whole product runs on one palette and there is nothing
 * left for it to say.
 */
type Tone = "app" | "light" | "dark";

interface HolyCrmLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  tone?: Tone;
}

const BOX: Record<Tone, string> = {
  app: "bg-graphite shadow-chip",
  light: "bg-graphite shadow-chip",
  dark: "bg-paper/10 ring-1 ring-white/15",
};

const WORD: Record<Tone, string> = {
  app: "text-graphite",
  light: "text-graphite",
  dark: "text-paper",
};

const MARK: Record<Tone, string> = {
  app: "text-dome",
  light: "text-dome",
  dark: "text-brass",
};

const BADGE: Record<Tone, string> = {
  app: "bg-dome-tint text-dome ring-dome-line",
  light: "bg-dome-tint text-dome ring-dome-line",
  dark: "bg-white/10 text-paper/80 ring-white/15",
};

export default function HolyCrmLogo({
  size = 36,
  className = "",
  showText = true,
  tone = "app",
}: HolyCrmLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        className={`relative flex items-center justify-center rounded-xl p-2 text-white transition-transform hover:scale-105 ${BOX[tone]}`}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden
        >
          {/* Stylized H mark: left stem, right stem, crossbar. */}
          <path
            d="M8 6V26M8 16H24M24 6V26"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* WhatsApp pulse dot. Brass in the dark lockup, where #25D366 on
              graphite is the one colour that would fight the palette. */}
          <circle cx="24" cy="8" r="2.5" fill={tone === "dark" ? "#E8B93D" : "#25D366"} />
        </svg>
      </div>

      {showText && (
        <span className="flex items-center gap-1.5">
          <span className={`text-xl font-extrabold tracking-tight ${WORD[tone]}`}>
            Holy<span className={MARK[tone]}>CRM</span>
          </span>
          {/* Hidden on narrow screens: beside the nav links and buttons this
              badge is what tips the header into wrapping. */}
          <span
            className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset lg:inline-flex ${BADGE[tone]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            WhatsApp Native
          </span>
        </span>
      )}
    </div>
  );
}

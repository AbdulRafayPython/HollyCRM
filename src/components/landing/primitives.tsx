import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";

/**
 * Shared marketing primitives.
 *
 * The landing page runs on its own palette (paper / graphite / dome / brass)
 * and its own typefaces, kept separate from the app's functional tokens
 * because it is selling the product rather than operating it. Keeping the
 * repeated pieces here is what stops each section from inventing its own
 * eyebrow, heading and button.
 *
 * `Screenshot` and `cropStyle` used to live here — helpers for scaling the
 * decorative margin off generated product renders. Both are gone: the product
 * UI is rendered as real markup now, so there is no margin to crop.
 */

/** Small uppercase label above a section heading. */
export function Eyebrow({
  icon,
  children,
  tone = "dome",
}: {
  icon?: IconName;
  children: React.ReactNode;
  tone?: "dome" | "brass";
}) {
  // Brass is a fill, never a word on the paper ground — #E8B93D on #F7F8F5 is
  // 1.7:1. The brass eyebrow uses `brass-deep` (5.0:1) for the text itself.
  const tones = {
    dome: "text-dome",
    brass: "text-brass-deep",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 font-plex text-[0.7rem] font-semibold uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

/**
 * Section heading.
 *
 * Set in Archivo caps via `.mkt-display`, which carries the responsive width
 * axis. `highlight` renders on its own line in dome green — the one
 * typographic move the page repeats.
 */
export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  eyebrowTone,
  title,
  highlight,
  description,
  align = "center",
}: {
  eyebrow?: string;
  eyebrowIcon?: IconName;
  eyebrowTone?: "dome" | "brass";
  title: React.ReactNode;
  highlight?: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      {eyebrow ? (
        <Eyebrow icon={eyebrowIcon} tone={eyebrowTone}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2
        className={`mkt-display text-graphite text-[2rem] font-extrabold sm:text-[2.6rem] lg:text-[3rem] ${
          eyebrow ? "mt-3" : ""
        }`}
      >
        {title}
        {highlight ? (
          <>
            <br />
            <span className="text-dome">{highlight}</span>
          </>
        ) : null}
      </h2>
      {description ? (
        // The heading may run full width; the paragraph under it must not —
        // long measure is the fastest way to make a section unreadable.
        <p
          className={`mt-4 font-plex text-base leading-relaxed text-stone ${
            centered ? "mx-auto max-w-2xl" : ""
          }`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Primary call to action.
 *
 * Brass fill with graphite text — the reference showreel's yellow pill, in a
 * register that suits pilgrimage rather than a budgeting app. The lift on
 * hover is 1px; anything more and a button this saturated starts to bounce.
 */
export function Cta({
  href,
  children,
  icon,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  icon?: IconName;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  const variants = {
    primary:
      "bg-brass text-graphite shadow-chip hover:-translate-y-px hover:brightness-[1.06]",
    secondary:
      "bg-plate text-graphite ring-1 ring-rule shadow-chip hover:-translate-y-px hover:bg-chalk",
    quiet: "text-graphite ring-1 ring-rule hover:bg-chalk",
  };
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-plex text-sm font-semibold transition-all duration-200 ease-swift active:translate-y-0 ${variants[variant]} ${className}`}
    >
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </Link>
  );
}

/** Checked bullet. */
export function CheckItem({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-dome-tint text-dome">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      <span className="font-plex text-sm leading-relaxed text-stone">
        <strong className="font-semibold text-graphite">{title}</strong> {children}
      </span>
    </li>
  );
}

/** Inline code chip — `search_hotels()` and friends appear all over the copy. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-dome-tint px-1.5 py-0.5 font-plexmono text-[0.85em] font-medium text-dome">
      {children}
    </code>
  );
}

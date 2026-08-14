import Image from "next/image";
import Icon, { type IconName } from "@/components/ui/Icon";

/**
 * Shared marketing primitives.
 *
 * The landing page is the one surface in this codebase that is not the
 * workstation: it uses the default Tailwind palette (violet accent, slate ink)
 * rather than the app's functional tokens, because it is selling the product
 * rather than operating it. Keeping the repeated pieces here is what stops the
 * eleven sections from each inventing their own eyebrow, heading and frame.
 */

/** Small pill above a section heading. */
export function Eyebrow({
  icon,
  children,
  tone = "violet",
}: {
  icon?: IconName;
  children: React.ReactNode;
  tone?: "violet" | "emerald";
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-700 ring-violet-200/70",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

/**
 * Section heading. `highlight` renders on its own line in violet — the
 * two-tone headline is the one typographic move the whole page repeats.
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
  eyebrowTone?: "violet" | "emerald";
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
        className={`text-3xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-4xl ${
          eyebrow ? "mt-5" : ""
        }`}
      >
        {title}
        {highlight ? (
          <>
            <br />
            <span className="text-violet-600">{highlight}</span>
          </>
        ) : null}
      </h2>
      {description ? (
        // The heading may run the full width; the paragraph under it should
        // not — long measure is the fastest way to make a section unreadable.
        <p
          className={`mt-4 text-base leading-relaxed text-slate-600 ${
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
 * Every asset in /landing-assets is a 16:9 render with a wide decorative
 * margin around the actual product UI. Shown whole, the interface ends up a
 * postage stamp floating in lilac. Scaling inside an `overflow-hidden` frame
 * crops that margin away while keeping the frame's 16:9 box, and `focus`
 * shifts the crop when the UI is not centred in the render.
 *
 * Zoom is per asset because the margins are not consistent: the workflow
 * canvas already bleeds to the edge, the group chat sits low under a title.
 */
export function cropStyle(zoom: number, focus = "50% 50%"): React.CSSProperties | undefined {
  return zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: focus };
}

/**
 * Product screenshot.
 *
 * Framed with a hairline ring and a shadow rather than an outer card — a
 * second frame around a picture that already has one reads as clutter.
 */
export function Screenshot({
  src,
  alt,
  priority = false,
  sizes = "(min-width: 1024px) 60vw, 100vw",
  zoom = 1,
  focus,
  trim,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  zoom?: number;
  focus?: string;
  /**
   * Band trim, for renders that carry their own title above the UI.
   *
   * `zoom` scales in from every edge at once, which cannot remove a title
   * without also eating into the sides — on the group chat that clipped the
   * conversation and left the callout labels as half-cut stubs. This keeps the
   * full width and shortens the frame instead, so only the unwanted band goes.
   *
   * `aspect` is the frame's ratio; `position` is the CSS object-position that
   * decides how the leftover height is split between top and bottom.
   */
  trim?: { aspect: string; position: string };
}) {
  return (
    <div className="relative isolate">
      {/* Violet bloom under the glass — gives the flat JPEG some depth.
          `isolate` above is what keeps this negative layer from sliding behind
          the section background entirely; the inset stays inside the page
          gutter at every breakpoint so it never widens the document. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-violet-300/40 via-fuchsia-200/20 to-emerald-200/30 blur-2xl sm:-inset-6"
      />

      {trim ? (
        <div
          className="relative overflow-hidden rounded-2xl shadow-2xl shadow-violet-950/10 ring-1 ring-slate-900/10"
          style={{ aspectRatio: trim.aspect }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            unoptimized
            sizes={sizes}
            style={{ objectPosition: trim.position }}
            className="object-cover"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl shadow-2xl shadow-violet-950/10 ring-1 ring-slate-900/10">
          <Image
            src={src}
            alt={alt}
            width={1376}
            height={768}
            priority={priority}
            unoptimized
            sizes={sizes}
            style={cropStyle(zoom, focus)}
            className="h-auto w-full"
          />
        </div>
      )}
    </div>
  );
}

/** Checked bullet used in every alternating showcase. */
export function CheckItem({
  title,
  children,
  tone = "violet",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "violet" | "emerald";
}) {
  const tones = {
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
      >
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm leading-relaxed text-slate-600">
        <strong className="font-semibold text-slate-900">{title}</strong> {children}
      </span>
    </li>
  );
}

/** Inline code chip — `search_hotels()` and friends appear all over the copy. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-violet-700">
      {children}
    </code>
  );
}

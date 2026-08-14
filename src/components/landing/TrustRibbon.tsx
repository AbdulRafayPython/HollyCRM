/**
 * The trust ribbon — the reference showreel's tilted yellow band, in brass.
 *
 * Two things make the tilt work rather than leave triangular gaps at the
 * corners: the band is wider than the viewport and pulled left by half the
 * overhang, and the whole thing sits inside `.ribbon-clip`, which contains the
 * overflow locally. Without that local clip the rotated corners would widen the
 * document and defeat the root's `overflow-x: clip`.
 *
 * The track holds the list twice so the -50% loop lands exactly on the seam.
 */

const ITEMS = [
  "Green API",
  "WhatsApp Business",
  "Supabase Postgres",
  "DeepSeek",
  "Row-level security",
  "PDPL compliant",
  "GDPR ready",
];

function Run({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden}
      className="flex shrink-0 items-center gap-10 pr-10 sm:gap-14 sm:pr-14"
    >
      {ITEMS.map((item) => (
        <li key={item} className="flex items-center gap-10 sm:gap-14">
          <span className="mkt-display whitespace-nowrap text-sm font-bold text-graphite sm:text-base">
            {item}
          </span>
          {/* Separator belongs to the item, so spacing stays even across the
              loop seam instead of doubling up where the runs meet. */}
          <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-graphite/45" />
        </li>
      ))}
    </ul>
  );
}

export default function TrustRibbon() {
  return (
    <section aria-label="Integrations and compliance" className="ribbon-clip py-10 sm:py-14">
      <div className="-ml-[6%] w-[112%] -rotate-[2.5deg] bg-brass py-3.5 shadow-chip sm:py-4">
        <div className="marquee-host">
          <div
            className="marquee-track animate-marquee"
            style={{ ["--marquee-dur" as string]: "46s" }}
          >
            <Run />
            {/* The duplicate is presentational only — a screen reader should
                hear this list once. */}
            <Run ariaHidden />
          </div>
        </div>
      </div>
    </section>
  );
}

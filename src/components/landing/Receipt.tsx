import Icon from "@/components/ui/Icon";

/**
 * The receipt — this page's signature.
 *
 * The product's whole claim is that prices come from rows in a database rather
 * than from a language model. "Zero hallucinations" is a claim a visitor has to
 * take on faith; this shows it. A quoted rate in a WhatsApp bubble, a hairline
 * that draws down from it on scroll, and the row it came from underneath.
 *
 * The draw is CSS — `.trace-path` in globals.css keys off `.is-revealed` on an
 * ancestor, so this must be rendered inside a <Reveal> to animate. Without one
 * it simply renders complete, which is also what happens under reduced motion.
 *
 * Deliberately not an image. Every string here is real markup: correct at any
 * zoom, selectable, translatable, and readable by a screen reader.
 */

type Row = {
  id: string;
  hotel: string;
  rate: number;
  haram: number;
  matched?: boolean;
  /** Why a row lost, shown only on the rows that did. */
  reason?: string;
};

const ROWS: Row[] = [
  { id: "4471", hotel: "Pullman Zamzam Makkah", rate: 1200, haram: 150, matched: true },
  { id: "4472", hotel: "Swissôtel Al Maqam", rate: 1450, haram: 220, reason: "over budget" },
  { id: "4488", hotel: "Makkah Towers", rate: 980, haram: 410, reason: "4-star" },
];

/**
 * `full`    — the hero. Everything, roomiest padding.
 * `compact` — the sticky feature panel. Everything, tighter padding.
 * `brief`   — the auth panel. Drops the losing rows down to one and cuts the
 *             closing line. Not only a squeeze: a login screen wants proof at a
 *             glance, and the full argument belongs on the marketing page. It
 *             also has to survive a short laptop window, where the full receipt
 *             overflowed the panel and was silently cropped at both ends.
 */
export type ReceiptVariant = "full" | "compact" | "brief";

export default function Receipt({ variant = "full" }: { variant?: ReceiptVariant }) {
  const brief = variant === "brief";
  const rows = brief ? ROWS.slice(0, 2) : ROWS;

  return (
    <div
      className={`rounded-2xl border border-rule bg-plate shadow-lift ${
        variant === "full" ? "p-4 sm:p-6" : brief ? "p-3.5" : "p-4 sm:p-5"
      }`}
    >
      {/* ---- the conversation ------------------------------------------- */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 pb-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dome-tint text-dome">
            <Icon name="chat" className="h-3.5 w-3.5" />
          </span>
          <span className="font-plex text-xs font-semibold text-graphite">
            Al-Mansoor Family
          </span>
          <span className="font-plex text-xs text-haze">· 8 pax · WhatsApp group</span>
        </div>

        {/* Inbound: the customer, in their own words. */}
        <div className="max-w-[86%] self-start rounded-2xl rounded-tl-sm bg-chalk px-3.5 py-2.5">
          <p className="font-plex text-sm leading-snug text-graphite">
            5-star in Makkah under 1,300 a night, walking distance to the Haram — 8 of
            us, 10–15 Sept
          </p>
          <span className="mt-1 block font-plex text-[0.68rem] text-haze">14:22</span>
        </div>

        {/* Outbound: the grounded reply. The price is the anchor the trace
            leaves from, so it carries the dot and the dotted rule. */}
        <div className="max-w-[92%] self-end rounded-2xl rounded-br-sm bg-dome-tint px-3.5 py-2.5 ring-1 ring-dome-line">
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-plate px-2 py-0.5 font-plex text-[0.62rem] font-semibold uppercase tracking-wider text-dome ring-1 ring-dome-line">
            HolyCRM
          </span>
          <p className="font-plex text-sm leading-snug text-graphite">
            Pullman Zamzam Makkah — 4 quad rooms at{" "}
            <span className="relative inline-flex items-baseline whitespace-nowrap font-plexmono font-medium text-dome [text-decoration:underline] [text-decoration-style:dotted] [text-underline-offset:3px]">
              1,200&nbsp;SAR
            </span>{" "}
            a night, 150&nbsp;m from the Haram.
          </p>
          <span className="mt-1 block font-plex text-[0.68rem] text-haze">
            14:22 · sent automatically
          </span>
        </div>
      </div>

      {/* ---- the trace ---------------------------------------------------
          A single path: the stem, then the arrowhead. Because dashing runs
          across subpaths, the head draws last, which is what makes it read as
          the line arriving rather than two shapes fading in. */}
      <div className="flex justify-end pr-6 sm:pr-10" aria-hidden>
        <svg width="24" height="46" viewBox="0 0 24 46" fill="none">
          <circle cx="12" cy="3" r="2.5" fill="#0F7A5A" />
          <path
            className="trace-path"
            d="M12 6 V36 M7.5 31.5 L12 37 L16.5 31.5"
            stroke="#0F7A5A"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--trace-len" as string]: "50" }}
          />
        </svg>
      </div>

      {/* ---- the rows ----------------------------------------------------
          Set in mono, because it is a query result and should look like one.
          The losing rows stay visible with their reason: showing only the
          match would prove nothing, and the point is that the shortlist was
          real and something was chosen from it. */}
      <div className="overflow-hidden rounded-xl border border-rule bg-paper">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-rule bg-chalk px-3 py-2">
          <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-dome" />
          <span className="font-plexmono text-[0.7rem] text-stone">
            hotels · city=&apos;Makkah&apos; · stars=5 · rate&nbsp;≤&nbsp;1300 ·
            haram_m&nbsp;≤&nbsp;200
          </span>
        </div>

        <table className="w-full border-collapse font-plexmono text-[0.72rem] tabular-nums">
          <caption className="sr-only">
            Hotel inventory rows considered for this quote
          </caption>
          <thead>
            <tr className="text-haze">
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                id
              </th>
              <th scope="col" className="px-3 py-1.5 text-left font-normal">
                hotel
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                rate
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                haram_m
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={
                  row.matched
                    ? "bg-dome-tint text-graphite"
                    : "text-haze transition-colors hover:bg-chalk"
                }
              >
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    {row.matched ? (
                      <Icon name="check" className="h-3 w-3 text-dome" />
                    ) : (
                      <span className="inline-block h-3 w-3" />
                    )}
                    {row.id}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {row.hotel}
                  {row.reason ? (
                    <span className="ml-1.5 text-[0.66rem] text-haze">({row.reason})</span>
                  ) : null}
                </td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    row.matched ? "font-medium text-dome" : ""
                  }`}
                >
                  {row.rate.toLocaleString("en-US")}
                </td>
                <td className="px-3 py-1.5 text-right">{row.haram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {brief ? null : (
        <p className="mt-3 font-plex text-xs leading-relaxed text-stone">
          <strong className="font-semibold text-graphite">Every quote shows its receipt.</strong>{" "}
          The agent picks from rows that exist. It cannot invent a rate, because it
          never writes one.
        </p>
      )}
    </div>
  );
}

import Icon from "@/components/ui/Icon";
import Receipt from "./Receipt";

/**
 * The five feature visuals, as real markup.
 *
 * These replace nine generated screenshots. Everything here is selectable
 * text on the correct brand at any zoom, which is the entire reason for
 * building them rather than prompting for them — the generated set arrived
 * with hallucinated strings ("Lhotisv txt for sales saltrls") and the
 * pre-rename spelling of the product name baked into the pixels.
 *
 * Each panel is sized to sit inside the sticky scroll's right column and
 * degrades to a single column on small screens.
 */

/** Initial-only avatar. Deterministic tint so the same person keeps a colour. */
function Avatar({ initials, tint = 0 }: { initials: string; tint?: number }) {
  const tints = [
    "bg-dome-tint text-dome",
    "bg-brass-tint text-brass-deep",
    "bg-chalk text-stone",
  ];
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-plex text-[0.62rem] font-semibold ${
        tints[tint % tints.length]
      }`}
    >
      {initials}
    </span>
  );
}

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-plate shadow-lift">
      {children}
    </div>
  );
}

/** Small window chrome bar, so a panel reads as a piece of software. */
function Chrome({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-rule bg-chalk px-3 py-2">
      <span className="flex gap-1.5" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-rule" />
        <span className="h-2 w-2 rounded-full bg-rule" />
        <span className="h-2 w-2 rounded-full bg-rule" />
      </span>
      <span className="ml-1 font-plex text-[0.7rem] font-semibold text-graphite">{title}</span>
      {meta ? <span className="font-plex text-[0.68rem] text-haze">· {meta}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 1 ---- */

const THREADS = [
  { name: "Al-Mansoor Family", snippet: "8 of us, 10–15 Sept", unread: 2, active: true },
  { name: "Ramadan Group · Lahore", snippet: "Can you hold 12 rooms?", unread: 5 },
  { name: "Farouk Bin Saleh", snippet: "Passport uploaded ✓", unread: 0 },
  { name: "Zahra Travel (agent)", snippet: "Rates for Shawwal?", unread: 1 },
];

export function InboxPanel() {
  return (
    <PanelFrame>
      <Chrome title="Shared inbox" meta="3 agents online" />
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ul className="divide-y divide-rule border-b border-rule sm:border-b-0 sm:border-r">
          {THREADS.map((t, i) => (
            <li
              key={t.name}
              className={`flex items-center gap-2.5 px-3 py-2.5 ${
                t.active ? "bg-dome-tint" : ""
              }`}
            >
              <Avatar initials={t.name.slice(0, 2).toUpperCase()} tint={i} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-plex text-[0.74rem] font-semibold text-graphite">
                  {t.name}
                </span>
                <span className="block truncate font-plex text-[0.68rem] text-haze">
                  {t.snippet}
                </span>
              </span>
              {t.unread ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-dome px-1 font-plexmono text-[0.6rem] text-white">
                  {t.unread}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 p-3">
          <div className="max-w-[88%] self-start rounded-xl rounded-tl-sm bg-chalk px-3 py-2">
            <p className="font-plex text-[0.74rem] leading-snug text-graphite">
              Assalamu alaikum — is the Pullman still available for our dates?
            </p>
          </div>
          <div className="max-w-[88%] self-end rounded-xl rounded-br-sm bg-dome-tint px-3 py-2 ring-1 ring-dome-line">
            <p className="font-plex text-[0.74rem] leading-snug text-graphite">
              Wa alaikum assalam — yes, 4 quad rooms held until Thursday.
            </p>
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-full border border-rule px-3 py-1.5">
            <span className="font-plex text-[0.7rem] text-haze">Reply as Yusuf</span>
            <Icon name="send" className="ml-auto h-3.5 w-3.5 text-dome" />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ 2 ---- */

export function QuotingPanel() {
  return <Receipt variant="compact" />;
}

/* ------------------------------------------------------------------ 3 ---- */

export function GroupPanel() {
  return (
    <PanelFrame>
      <Chrome title="Al-Mansoor Family Umrah" meta="8 members" />
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-start gap-2">
          <Avatar initials="AM" tint={0} />
          <div className="rounded-xl rounded-tl-sm bg-chalk px-3 py-2">
            <span className="block font-plex text-[0.64rem] font-semibold text-dome">
              Anisah Mansoor
            </span>
            <p className="font-plex text-[0.74rem] leading-snug text-graphite">
              Uncle wants closer to the Haram, under 1,300
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Avatar initials="KM" tint={1} />
          <div className="rounded-xl rounded-tl-sm bg-chalk px-3 py-2">
            <p className="font-plex text-[0.74rem] leading-snug text-graphite">
              <span className="font-semibold text-dome">@HolyCRM</span> 3 quad rooms near
              the Haram for 8
            </p>
          </div>
        </div>

        {/* The throttle is the point of this panel: a bot in a family group
            that answers every message is a bot that gets the number banned. */}
        <div className="flex items-center gap-2 self-end rounded-full bg-brass-tint px-2.5 py-1 ring-1 ring-brass/40">
          <Icon name="clock" className="h-3 w-3 text-brass-deep" />
          <span className="font-plexmono text-[0.62rem] text-brass-deep">
            cooldown 60s · 8/10 today
          </span>
        </div>

        <div className="max-w-[90%] self-end rounded-xl rounded-br-sm bg-dome-tint px-3 py-2 ring-1 ring-dome-line">
          <span className="mb-0.5 block font-plex text-[0.62rem] font-semibold uppercase tracking-wider text-dome">
            HolyCRM · replies only when mentioned
          </span>
          <p className="font-plex text-[0.74rem] leading-snug text-graphite">
            Pullman Zamzam — 3 quad rooms, 1,200 SAR/night, 150 m out.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-rule pt-2.5">
          <span className="rounded bg-chalk px-1.5 py-0.5 font-plexmono text-[0.62rem] text-stone">
            lead: Al-Mansoor
          </span>
          <span className="rounded bg-chalk px-1.5 py-0.5 font-plexmono text-[0.62rem] text-stone">
            owner: Yusuf
          </span>
          <span className="ml-auto font-plex text-[0.66rem] text-haze">
            4 decision makers tracked
          </span>
        </div>
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ 4 ---- */

const NODES = [
  { x: 8, y: 12, label: "Inbound WhatsApp", kind: "trigger" },
  { x: 8, y: 58, label: "Intent classifier", kind: "logic" },
  { x: 54, y: 12, label: "search_hotels()", kind: "data" },
  { x: 54, y: 58, label: "Human escalation", kind: "alert" },
];

export function CanvasPanel() {
  const kinds: Record<string, string> = {
    trigger: "border-dome bg-dome-tint text-dome",
    logic: "border-rule bg-chalk text-graphite",
    data: "border-dome bg-plate text-graphite",
    alert: "border-brass bg-brass-tint text-brass-deep",
  };
  return (
    <PanelFrame>
      <Chrome title="Workflow canvas" meta="draft · autosaved" />
      <div className="relative h-[248px] bg-paper p-3">
        {/* Connectors. `dash-flow` animates stroke-dashoffset, so the line
            reads as data travelling along it with no layout work per frame.

            `preserveAspectRatio="none"` is what lets the 100×100 viewBox track
            the panel's real proportions, but it scales x and y by different
            factors — which would render vertical strokes twice the weight of
            horizontal ones and stretch the dash pattern differently per axis.
            `vector-effect: non-scaling-stroke` takes the stroke out of that
            transform, so weight and dashes stay uniform.

            Coordinates start where the nodes end (they span 8–46% and 54–92%)
            rather than under them, so the whole connector is visible instead
            of most of it hiding behind a card. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {[
            { d: "M46 20 L54 20", stroke: "#0F7A5A" },
            { d: "M27 26 L27 57", stroke: "#0F7A5A" },
            { d: "M46 66 L54 66", stroke: "#C9A227" },
          ].map((line) => (
            <path
              key={line.d}
              d={line.d}
              className="animate-dash-flow"
              stroke={line.stroke}
              strokeWidth="1.5"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
          ))}
        </svg>

        {NODES.map((n) => (
          <div
            key={n.label}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            className={`absolute w-[38%] rounded-lg border px-2 py-1.5 shadow-chip ${
              kinds[n.kind]
            }`}
          >
            <span className="block font-plex text-[0.66rem] font-semibold leading-tight">
              {n.label}
            </span>
          </div>
        ))}

        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-plate px-2.5 py-1 ring-1 ring-rule">
          <span className="h-1.5 w-1.5 rounded-full bg-dome" />
          <span className="font-plex text-[0.64rem] text-stone">drag to connect</span>
        </div>
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ 5 ---- */

const COLUMNS = [
  {
    name: "New lead",
    tone: "text-stone",
    cards: [{ who: "Zahra Travel", meta: "12 pax · Shawwal" }],
  },
  {
    name: "Quoted",
    tone: "text-dome",
    cards: [
      { who: "Al-Mansoor Family", meta: "8 pax · 1,200 SAR", moving: true },
      { who: "Bin Saleh", meta: "2 pax · 890 SAR" },
    ],
  },
  {
    name: "Closed-won",
    tone: "text-brass-deep",
    cards: [{ who: "Ramadan Group", meta: "24 pax · 41,000 SAR" }],
  },
];

export function PipelinePanel() {
  return (
    <PanelFrame>
      <Chrome title="Pipeline" meta="moved by the conversation, not by hand" />
      <div className="grid grid-cols-3 gap-2 bg-paper p-3">
        {COLUMNS.map((col) => (
          <div key={col.name} className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <span
                className={`font-plex text-[0.66rem] font-semibold uppercase tracking-wide ${col.tone}`}
              >
                {col.name}
              </span>
              <span className="font-plexmono text-[0.62rem] text-haze">
                {col.cards.length}
              </span>
            </div>
            {col.cards.map((c) => (
              <div
                key={c.who}
                className={`rounded-lg border bg-plate px-2 py-1.5 shadow-chip ${
                  c.moving ? "border-dome ring-1 ring-dome-line" : "border-rule"
                }`}
              >
                <span className="block truncate font-plex text-[0.68rem] font-semibold text-graphite">
                  {c.who}
                </span>
                <span className="block truncate font-plexmono text-[0.62rem] text-haze">
                  {c.meta}
                </span>
                {c.moving ? (
                  <span className="mt-1 inline-flex items-center gap-1 font-plex text-[0.6rem] font-semibold text-dome">
                    <Icon name="bolt" className="h-2.5 w-2.5" />
                    auto-advanced
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

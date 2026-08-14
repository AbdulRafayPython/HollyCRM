import Icon, { type IconName } from "@/components/ui/Icon";
import { Cta, Eyebrow } from "./primitives";
import Reveal from "./Reveal";

/**
 * The hand-over: the page stops talking and shows the whole desk.
 *
 * The reference showreel does this with a full-width screenshot that scales
 * from 0.92 to 1 on entry. Same gesture, except the "screenshot" is markup —
 * so the strings are right, it stays sharp on any display, and it will not
 * drift out of date the way a rendered image does.
 */

const RAIL: IconName[] = ["inbox", "kanban", "hub", "chart", "settings"];

const THREADS = [
  { name: "Al-Mansoor Family", meta: "8 pax · quoted", unread: 2, active: true },
  { name: "Ramadan Group", meta: "24 pax · deposit due", unread: 5 },
  { name: "Zahra Travel", meta: "12 pax · new", unread: 1 },
  { name: "Farouk Bin Saleh", meta: "2 pax · closed-won", unread: 0 },
  { name: "Nur Holidays", meta: "6 pax · quoted", unread: 0 },
];

const STAGES = [
  { name: "New", count: 8, tone: "bg-chalk text-stone" },
  { name: "Quoted", count: 14, tone: "bg-dome-tint text-dome" },
  { name: "Deposit", count: 6, tone: "bg-brass-tint text-brass-deep" },
  { name: "Closed-won", count: 21, tone: "bg-dome text-white" },
];

export default function ProductZoom({ isConfigured = true }: { isConfigured?: boolean }) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    <section className="girih-ground relative isolate overflow-hidden py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow tone="brass">Try it for free</Eyebrow>
            <h2 className="mkt-display mt-3 text-[2.2rem] font-extrabold text-graphite sm:text-[3rem] lg:text-[3.4rem]">
              Your desk, on the day
              <br />
              <span className="text-dome">it gets busy</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-plex text-base leading-relaxed text-stone">
              Every conversation, every stage and every rate on one screen — during
              Ramadan, when four hundred families are asking at once.
            </p>
            <div className="mt-7 flex justify-center">
              <Cta href={targetRoute} icon="chat">
                Launch workstation
              </Cta>
            </div>
          </Reveal>
        </div>

        <Reveal variant="zoom" delay={120}>
          <div className="mt-14 overflow-hidden rounded-2xl border border-rule bg-plate shadow-lift-lg">
            {/* Browser chrome. The address bar carries the real domain — the
                generated renders used to spell it "hollycrm.orrv". */}
            <div className="flex items-center gap-3 border-b border-rule bg-chalk px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-rule" />
                <span className="h-2.5 w-2.5 rounded-full bg-rule" />
                <span className="h-2.5 w-2.5 rounded-full bg-rule" />
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-md bg-plate px-3 py-1 ring-1 ring-rule">
                <Icon name="lock" className="h-3 w-3 text-haze" />
                <span className="font-plexmono text-[0.66rem] text-stone">holycrm.com</span>
              </span>
            </div>

            <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]">
              {/* Nav rail */}
              <div className="flex flex-col items-center gap-3 border-r border-rule bg-paper px-2.5 py-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-dome text-white">
                  <Icon name="whatsapp" className="h-4 w-4" />
                </span>
                {RAIL.map((icon, i) => (
                  <span
                    key={icon}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      i === 0 ? "bg-dome-tint text-dome" : "text-haze"
                    }`}
                  >
                    <Icon name={icon} className="h-4 w-4" />
                  </span>
                ))}
              </div>

              {/* Conversation list */}
              <ul className="divide-y divide-rule border-r border-rule">
                {THREADS.map((t) => (
                  <li
                    key={t.name}
                    className={`px-3 py-2.5 ${t.active ? "bg-dome-tint" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="block min-w-0 flex-1">
                        <span className="block truncate font-plex text-[0.72rem] font-semibold text-graphite">
                          {t.name}
                        </span>
                        <span className="block truncate font-plexmono text-[0.63rem] text-haze">
                          {t.meta}
                        </span>
                      </span>
                      {t.unread ? (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-dome px-1 font-plexmono text-[0.58rem] text-white">
                          {t.unread}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Thread — hidden on the narrowest layout so the rail and list
                  stay legible rather than all three squeezing. */}
              <div className="hidden flex-col gap-2 border-r border-rule p-3 sm:flex">
                <div className="flex items-center gap-2 border-b border-rule pb-2">
                  <span className="font-plex text-[0.72rem] font-semibold text-graphite">
                    Al-Mansoor Family
                  </span>
                  <span className="font-plex text-[0.66rem] text-haze">· 8 members</span>
                </div>
                <div className="max-w-[88%] self-start rounded-xl rounded-tl-sm bg-chalk px-3 py-2">
                  <p className="font-plex text-[0.72rem] leading-snug text-graphite">
                    Can we still get the same rate for 10–15 Sept?
                  </p>
                </div>
                <div className="max-w-[88%] self-end rounded-xl rounded-br-sm bg-dome-tint px-3 py-2 ring-1 ring-dome-line">
                  <p className="font-plex text-[0.72rem] leading-snug text-graphite">
                    Yes — 4 quad rooms held at{" "}
                    <span className="font-plexmono font-medium text-dome">1,200 SAR</span>.
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-2 rounded-full border border-rule px-3 py-1.5">
                  <span className="font-plex text-[0.68rem] text-haze">Reply as Yusuf</span>
                  <Icon name="send" className="ml-auto h-3.5 w-3.5 text-dome" />
                </div>
              </div>

              {/* Pipeline summary */}
              <div className="hidden flex-col gap-2 p-3 sm:flex">
                <span className="font-plex text-[0.66rem] font-semibold uppercase tracking-wider text-haze">
                  This season
                </span>
                {STAGES.map((s) => (
                  <div
                    key={s.name}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${s.tone}`}
                  >
                    <span className="font-plex text-[0.7rem] font-semibold">{s.name}</span>
                    <span className="font-plexmono text-[0.7rem] tabular-nums">{s.count}</span>
                  </div>
                ))}
                <div className="mt-1 rounded-lg border border-rule p-2.5">
                  <span className="block font-plexmono text-[0.62rem] text-haze">
                    booked value
                  </span>
                  <span className="block font-plexmono text-[0.95rem] font-medium tabular-nums text-graphite">
                    412,800 SAR
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

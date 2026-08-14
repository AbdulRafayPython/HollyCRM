import Icon, { type IconName } from "@/components/ui/Icon";
import { Cta, Eyebrow } from "./primitives";
import Reveal from "./Reveal";
import Receipt from "./Receipt";

const TRUST = ["Direct & group chats", "SQL-grounded pricing", "PDPL & GDPR encrypted"];

/**
 * Floating fragment of the product, orbiting the receipt.
 *
 * Each chip gets its own duration and delay so the group never beats in sync —
 * that de-synchronisation is the whole difference between "floating" and
 * "pulsing". Hidden below lg: at tablet width they would land on top of the
 * receipt, and a collage that overlaps its own subject is just noise.
 */
function FloatChip({
  icon,
  label,
  value,
  className,
  duration,
  delay,
  tone = "plain",
}: {
  icon: IconName;
  label: string;
  value?: string;
  className: string;
  duration: string;
  delay: string;
  tone?: "plain" | "dome" | "brass";
}) {
  const tones = {
    plain: "bg-plate text-graphite ring-rule",
    dome: "bg-dome-tint text-dome ring-dome-line",
    brass: "bg-brass-tint text-brass-deep ring-brass/40",
  };
  return (
    <div
      aria-hidden
      style={
        {
          ["--float-dur" as string]: duration,
          ["--float-delay" as string]: delay,
        } as React.CSSProperties
      }
      className={`pointer-events-none absolute hidden animate-levitate lg:block ${className}`}
    >
      <div
        className={`flex items-center gap-2 rounded-xl px-3 py-2 shadow-chip ring-1 ${tones[tone]}`}
      >
        <Icon name={icon} className="h-4 w-4 shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-plex text-[0.68rem] font-semibold whitespace-nowrap">
            {label}
          </span>
          {value ? (
            <span className="font-plexmono text-[0.64rem] text-haze whitespace-nowrap">
              {value}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function LandingHero({ isConfigured = true }: { isConfigured?: boolean }) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    // `isolate` keeps the girih ground inside this section's stacking context.
    // The pattern replaces the violet blur blobs that used to sit here.
    <section className="girih-ground relative isolate overflow-hidden pb-20 pt-14 sm:pt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal delay={40}>
            <Eyebrow>WhatsApp-native CRM for Umrah &amp; Hajj</Eyebrow>
          </Reveal>

          <Reveal delay={120}>
            <h1 className="mkt-display mt-4 text-[2.6rem] font-extrabold text-graphite sm:text-[3.6rem] lg:text-[4.4rem]">
              Quote the room
              <br />
              <span className="text-dome">you actually have</span>
            </h1>
          </Reveal>

          <Reveal delay={220}>
            <p className="mx-auto mt-6 max-w-xl font-plex text-base leading-relaxed text-stone sm:text-lg">
              HolyCRM runs your Makkah and Madinah bookings inside the WhatsApp
              threads you already sell in — group negotiations, stage tracking, and
              rates read straight from your own inventory.
            </p>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href={targetRoute} icon="chat">
                Launch workstation
              </Cta>
              <Cta href="#pricing" variant="secondary">
                See pricing
              </Cta>
            </div>
          </Reveal>

          <Reveal delay={420}>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {TRUST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 font-plex text-xs font-medium text-stone"
                >
                  <Icon name="check" className="h-4 w-4 text-dome" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* The collage. The receipt is the subject; everything else orbits it. */}
        <div className="relative mx-auto mt-14 max-w-lg">
          <FloatChip
            icon="kanban"
            label="Stage advanced"
            value="New → Quoted"
            tone="dome"
            className="-left-52 top-6 xl:-left-64"
            duration="6.4s"
            delay="0s"
          />
          <FloatChip
            icon="users"
            label="8 in this group"
            value="4 decision makers"
            className="-left-44 top-44 xl:-left-56"
            duration="5.2s"
            delay="0.7s"
          />
          <FloatChip
            icon="shield"
            label="Cooldown active"
            value="60s · 8/10 today"
            tone="brass"
            className="-left-40 bottom-10 xl:-left-48"
            duration="7.1s"
            delay="1.4s"
          />
          <FloatChip
            icon="database"
            label="search_hotels()"
            value="128 rows · 41 ms"
            className="-right-48 top-2 xl:-right-60"
            duration="5.8s"
            delay="0.3s"
          />
          <FloatChip
            icon="bot"
            label="Intent classified"
            value="hotel_query"
            tone="dome"
            className="-right-44 top-40 xl:-right-56"
            duration="6.8s"
            delay="1.1s"
          />
          <FloatChip
            icon="lock"
            label="Passport vault"
            value="PDPL encrypted"
            className="-right-40 bottom-16 xl:-right-52"
            duration="5.6s"
            delay="1.9s"
          />

          <Reveal variant="zoom" delay={260}>
            <Receipt />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

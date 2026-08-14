import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import { cropStyle } from "./primitives";
import Reveal from "./Reveal";
import ParallaxShot from "./ParallaxShot";

const TRUST = ["Direct & group chats", "SQL-grounded pricing", "PDPL & GDPR encrypted"];

export default function LandingHero({ isConfigured = true }: { isConfigured?: boolean }) {
  const targetRoute = isConfigured ? "/home" : "/setup";

  // `isolate` keeps the -z-10 washes inside this section's stacking context;
  // without it they would paint behind the page's white background.
  return (
    <section className="relative isolate overflow-hidden pb-16 pt-12 sm:pb-24 sm:pt-16">
      {/* Lilac wash behind the fold. The header sits on top of this. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[46rem] bg-gradient-to-b from-violet-100 via-violet-50/70 to-white"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 -z-10 h-[32rem] w-[32rem] rounded-full bg-fuchsia-300/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-24 -z-10 h-[26rem] w-[26rem] rounded-full bg-violet-400/20 blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Slightly wider copy column so "Scale WhatsApp Deals." holds one line. */}
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
          {/* Copy column. Each block carries its own delay so the hero lands
              as a sequence — badge, headline, promise, actions — rather than
              everything arriving at once. */}
          <div className="max-w-xl">
            <Reveal delay={40}>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-violet-200/70 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
                Purpose-built for Umrah &amp; Hajj hospitality agencies
              </span>
            </Reveal>

            <Reveal delay={140}>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-[2.9rem] xl:text-[3.15rem]">
                Scale WhatsApp Deals.
                <br />
                <span className="text-violet-600">Zero Hallucinations.</span>
              </h1>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-6 text-base leading-relaxed text-slate-600 sm:text-lg">
                HollyCRM is the WhatsApp-native CRM for Umrah &amp; Hajj agencies. Run
                multi-party family negotiations, auto-advance pipeline stages, and quote
                real Makkah &amp; Madinah inventory straight from your database.
              </p>
            </Reveal>

            <Reveal delay={340}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={targetRoute}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-violet-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-2xl hover:shadow-violet-700/40 active:translate-y-0 active:scale-[0.98]"
                >
                  <Icon name="chat" className="h-4 w-4" />
                  Launch Workstation
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md active:translate-y-0"
                >
                  View Pricing
                </a>
              </div>
            </Reveal>

            <Reveal delay={440}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                {TRUST.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
                  >
                    <Icon name="check" className="h-4 w-4 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* Product shot. Bleeds past the grid on large screens so the
              workstation reads as a window into the app, not a boxed thumbnail. */}
          <div className="relative isolate lg:-mr-24 xl:-mr-32">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-violet-400/30 via-fuchsia-300/20 to-emerald-300/20 blur-3xl"
            />
            <Reveal variant="zoom" delay={220}>
              <ParallaxShot className="overflow-hidden rounded-2xl shadow-2xl shadow-violet-950/15 ring-1 ring-slate-900/10">
                <Image
                  src="/landing-assets/hero_mockup.jpg"
                  alt="HollyCRM shared WhatsApp inbox alongside the Kanban sales pipeline"
                  width={1376}
                  height={768}
                  priority
                  unoptimized
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  style={cropStyle(1.5)}
                  className="h-auto w-full"
                />
              </ParallaxShot>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Cta, SectionHeading } from "./primitives";
import Reveal from "./Reveal";
import {
  CanvasPanel,
  GroupPanel,
  InboxPanel,
  PipelinePanel,
  QuotingPanel,
} from "./FeaturePanels";

/**
 * The sticky feature scroll — the best idea in the reference showreel, and the
 * section that replaces six near-identical alternating rows (GreenApi,
 * AiAgent, GroupChat, WorkflowCanvas, PipelineVault, QuotingFlow). Six of the
 * same shape in a row was the old page's biggest structural weakness.
 *
 * The rail pins and the panels scroll past it. Active state is driven by an
 * observer with a tall negative inset, so exactly one block — the one crossing
 * the middle of the viewport — is ever intersecting.
 *
 * A sticky child cannot pin inside an ancestor with `overflow` set to anything
 * but visible, so nothing in this subtree may clip.
 */

type Feature = {
  id: string;
  icon: IconName;
  short: string;
  title: string;
  copy: string;
  cta: string;
  /** Ambient wash behind the card, one per feature. */
  wash: string;
  panel: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "inbox",
    icon: "inbox",
    short: "Inbox",
    title: "One inbox, every thread",
    copy: "Direct chats and family groups land in the same shared inbox, with the whole team seeing who replied and when. No more forwarding screenshots between agents to work out what was promised.",
    cta: "See the inbox",
    wash: "from-dome-tint/60",
    panel: <InboxPanel />,
  },
  {
    id: "quoting",
    icon: "receipt",
    short: "Quoting",
    title: "Quotes that cite their source",
    copy: "The agent reads your live inventory and answers with a rate that exists. Every quote carries the row it came from — the hotel, the rate, the distance to the Haram — so nobody has to trust a number on faith.",
    cta: "How grounding works",
    wash: "from-dome-tint/70",
    panel: <QuotingPanel />,
  },
  {
    id: "groups",
    icon: "users",
    short: "Groups",
    title: "Groups that don't derail",
    copy: "Family bookings are decided by four people talking at once. The bot answers only when mentioned, holds a cooldown between replies, and keeps a daily cap — so an eight-person group never turns your number into spam.",
    cta: "See group handling",
    wash: "from-brass-tint/70",
    panel: <GroupPanel />,
  },
  {
    id: "workflow",
    icon: "hub",
    short: "Agents",
    title: "Agents you wire yourself",
    copy: "Drag triggers, classifiers and queries onto a canvas and connect them. When a request needs a person, route it to one. No prompt engineering, and no waiting on us to ship your logic.",
    cta: "Open the canvas",
    wash: "from-chalk",
    panel: <CanvasPanel />,
  },
  {
    id: "pipeline",
    icon: "kanban",
    short: "Pipeline",
    title: "The pipeline moves itself",
    copy: "Stages advance from what actually happened in the conversation — a quote sent, a deposit confirmed, a passport uploaded. The board is a record of the season rather than a chore at the end of the day.",
    cta: "See the pipeline",
    wash: "from-brass-tint/50",
    panel: <PipelinePanel />,
  },
];

export default function StickyFeatures({ isConfigured = true }: { isConfigured?: boolean }) {
  const [active, setActive] = useState(0);
  const blocks = useRef<(HTMLDivElement | null)[]>([]);
  const targetRoute = isConfigured ? "/home" : "/setup";

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = blocks.current.indexOf(entry.target as HTMLDivElement);
          if (index >= 0) setActive(index);
        }
      },
      // A narrow band across the middle of the viewport: only the block
      // crossing the centre line reports as intersecting, so the rail tracks
      // reading position rather than whatever entered the fold last.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    for (const el of blocks.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="What it does"
            title="Everything the season needs"
            highlight="in one place"
            description="Five things an Umrah desk does every day, each one built to survive a group chat with eight people in it."
          />
        </Reveal>

        <div className="mt-14 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12">
          {/* The rail. Hidden below lg, where there is no room beside the card
              and a pinned column would just eat the gutter. */}
          <div className="hidden lg:block">
            <nav aria-label="Features" className="sticky top-[38vh]">
              <ul className="flex flex-col gap-3">
                {FEATURES.map((f, i) => (
                  <li key={f.id}>
                    <a
                      href={`#${f.id}`}
                      aria-current={active === i ? "true" : undefined}
                      className={`group flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-all duration-300 ease-swift ${
                        active === i
                          ? "bg-graphite text-paper ring-graphite"
                          : "bg-plate text-haze ring-rule hover:text-stone"
                      }`}
                    >
                      <Icon name={f.icon} className="h-4 w-4" />
                      <span className="sr-only">{f.short}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="flex flex-col gap-8 sm:gap-12">
            {FEATURES.map((f, i) => (
              <div
                key={f.id}
                id={f.id}
                ref={(el) => {
                  blocks.current[i] = el;
                }}
                className="scroll-mt-28"
              >
                <Reveal>
                  <div
                    className={`rounded-3xl border border-rule bg-gradient-to-br ${f.wash} to-plate p-5 shadow-lift sm:p-8`}
                  >
                    <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-9">
                      <div>
                        <span className="font-plexmono text-[0.7rem] text-haze">
                          {String(i + 1).padStart(2, "0")} / {String(FEATURES.length).padStart(2, "0")}
                        </span>
                        <h3 className="mkt-display mt-2 text-[1.75rem] font-extrabold text-graphite sm:text-[2.1rem]">
                          {f.title}
                        </h3>
                        <p className="mt-3.5 font-plex text-[0.95rem] leading-relaxed text-stone">
                          {f.copy}
                        </p>
                        <Cta href={targetRoute} variant="quiet" className="mt-6">
                          {f.cta}
                        </Cta>
                      </div>
                      <div>{f.panel}</div>
                    </div>
                  </div>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

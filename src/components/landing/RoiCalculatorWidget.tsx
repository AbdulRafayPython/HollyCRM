"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

/* Assumptions behind the numbers, stated so the figure can be argued with:
   a manually handled inquiry costs ~6 agent-minutes, automation removes ~70%
   of that, 8% of inquiries close, and grounded instant quotes lift that close
   rate by ~35%. Margin per booking is held at a conservative 3,200 SAR. */
const MINUTES_PER_LEAD = 6;
const AUTOMATED_SHARE = 0.7;
const CLOSE_RATE = 0.08;
const CONVERSION_LIFT = 0.35;
const MARGIN_PER_BOOKING = 3200;

export default function RoiCalculatorWidget() {
  const [monthlyLeads, setMonthlyLeads] = useState(3000);
  const [agents, setAgents] = useState(6);

  const hoursSavedPerMonth = Math.round(
    (monthlyLeads * MINUTES_PER_LEAD * AUTOMATED_SHARE) / 60
  );
  const hoursPerAgentPerWeek = Math.round(hoursSavedPerMonth / agents / 4.33);
  const extraBookings = Math.round(monthlyLeads * CLOSE_RATE * CONVERSION_LIFT);
  const revenueUplift = (extraBookings * MARGIN_PER_BOOKING).toLocaleString("en-US");

  const results = [
    {
      value: `${hoursSavedPerMonth.toLocaleString("en-US")} hrs`,
      label: "Agent hours saved / month",
      detail: `≈ ${hoursPerAgentPerWeek} hrs per agent, per week`,
      tone: "text-violet-600",
    },
    {
      value: `+${extraBookings.toLocaleString("en-US")}`,
      label: "Extra bookings / month",
      detail: "From faster, grounded first replies",
      tone: "text-emerald-600",
    },
    {
      value: `${revenueUplift} SAR`,
      label: "Revenue uplift / month",
      detail: `At ${MARGIN_PER_BOOKING.toLocaleString("en-US")} SAR margin per booking`,
      tone: "text-slate-900",
    },
  ];

  return (
    <section id="roi" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="ROI calculator"
            eyebrowIcon="trophy"
            title="What this is worth"
            highlight="to your agency."
            description="Set your inquiry volume and team size to see the time and revenue a grounded WhatsApp workflow returns."
          />
        </Reveal>

        <Reveal
          variant="zoom"
          delay={120}
          className="mt-12 overflow-hidden rounded-3xl bg-white shadow-xl shadow-violet-950/5 ring-1 ring-slate-900/5"
        >
          <div className="grid lg:grid-cols-[1fr_1.1fr]">
            {/* Inputs */}
            <div className="space-y-8 p-6 sm:p-8">
              <div>
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="roi-leads"
                    className="text-sm font-bold text-slate-900"
                  >
                    Monthly WhatsApp inquiries
                  </label>
                  <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-sm font-extrabold tabular-nums text-violet-700">
                    {monthlyLeads.toLocaleString("en-US")}
                  </span>
                </div>
                <input
                  id="roi-leads"
                  type="range"
                  min={200}
                  max={10000}
                  step={100}
                  value={monthlyLeads}
                  onChange={(e) => setMonthlyLeads(Number(e.target.value))}
                  className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-600"
                />
                <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
                  <span>200 — boutique broker</span>
                  <span>10,000 — Ramadan peak</span>
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="roi-agents"
                    className="text-sm font-bold text-slate-900"
                  >
                    Sales agents on the line
                  </label>
                  <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-sm font-extrabold tabular-nums text-violet-700">
                    {agents}
                  </span>
                </div>
                <input
                  id="roi-agents"
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={agents}
                  onChange={(e) => setAgents(Number(e.target.value))}
                  className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-600"
                />
                <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
                  <span>1 agent</span>
                  <span>40 agents</span>
                </div>
              </div>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Modelled on 6 agent-minutes per manual inquiry, 70% of that automated,
                and a 35% lift on an 8% close rate.
              </p>
            </div>

            {/* Outputs */}
            <div className="space-y-4 border-t border-slate-900/5 bg-slate-50/70 p-6 sm:p-8 lg:border-l lg:border-t-0">
              {results.map((result) => (
                <div
                  key={result.label}
                  className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-900/5"
                >
                  <div
                    className={`text-2xl font-extrabold tracking-tight tabular-nums ${result.tone}`}
                  >
                    {result.value}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-700">
                    {result.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{result.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

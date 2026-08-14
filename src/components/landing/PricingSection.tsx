"use client";

import { useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

type Plan = {
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: { icon: IconName; label: string }[];
  popular: boolean;
  cta: string;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    description: "For boutique brokers and independent travel agents.",
    monthlyPrice: 189,
    annualPrice: 149,
    features: [
      { icon: "users", label: "Up to 10 users" },
      { icon: "chat", label: "1 connected WhatsApp line" },
      { icon: "kanban", label: "Shared inbox & Kanban pipeline" },
      { icon: "bolt", label: "1,000 AI actions / month" },
      { icon: "mail", label: "Standard email support" },
    ],
    popular: false,
    cta: "Start 14-day free trial",
  },
  {
    name: "Agency Pro",
    description: "For growing Umrah & Hajj agencies running group deals.",
    monthlyPrice: 499,
    annualPrice: 399,
    features: [
      { icon: "users", label: "Up to 30 users" },
      { icon: "chat", label: "3 connected WhatsApp lines" },
      { icon: "database", label: "SQL-grounded AI quoting" },
      { icon: "kanban", label: "Visual workflow canvas" },
      { icon: "bolt", label: "5,000 AI actions / month" },
      { icon: "lock", label: "Encrypted passport vault" },
      { icon: "clock", label: "Priority 24/7 SLA support" },
    ],
    popular: true,
    cta: "Start 14-day free trial",
  },
  {
    name: "Enterprise",
    description: "For large hotel brokers and multi-agency consortiums.",
    monthlyPrice: null,
    annualPrice: null,
    features: [
      { icon: "users", label: "Unlimited users & lines" },
      { icon: "globe", label: "Live inventory sync API" },
      { icon: "database", label: "Custom search_hotels() rules" },
      { icon: "shield", label: "Multi-tenant isolation & roles" },
      { icon: "trophy", label: "Dedicated account manager" },
    ],
    popular: false,
    cta: "Talk to sales",
  },
];

export default function PricingSection({ isConfigured = true }: { isConfigured?: boolean }) {
  const [isAnnual, setIsAnnual] = useState(true);
  const targetRoute = isConfigured ? "/home" : "/setup";

  return (
    <section id="pricing" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Transparent pricing"
            title="Simple plans built to"
            highlight="scale your bookings."
            description="No setup fees. Change or pause your plan whenever the season does."
          />
        </Reveal>

        {/* Billing toggle */}
        <Reveal delay={100} className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-xl bg-rule p-1 ring-1 ring-graphite/5">
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                !isAnnual ? "bg-plate text-graphite shadow-sm" : "text-stone hover:text-graphite"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                isAnnual
                  ? "bg-dome text-white shadow-md shadow-dome/20"
                  : "text-stone hover:text-graphite"
              }`}
            >
              Annual
              <span className="rounded bg-brass px-1.5 py-0.5 text-[9px] font-black text-graphite">
                −20%
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;

            return (
              <Reveal
                key={plan.name}
                variant="zoom"
                delay={i * 110}
                className="h-full"
              >
                <div
                  className={`relative flex h-full flex-col rounded-3xl bg-plate p-7 transition-all duration-300 ${
                    plan.popular
                      ? "shadow-lift-lg ring-2 ring-dome lg:-mt-4 lg:pb-11"
                      : "shadow-sm ring-1 ring-graphite/5 hover:-translate-y-1 hover:shadow-xl"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-dome px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-dome/30">
                      Most popular
                    </span>
                  )}

                  <h3 className="text-xl font-extrabold tracking-tight text-graphite">
                    {plan.name}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-haze">
                    {plan.description}
                  </p>

                  <div className="mt-6 flex min-h-[3.5rem] items-baseline gap-1">
                    {price === null ? (
                      <span className="text-4xl font-extrabold tracking-tight text-graphite">
                        Contact us
                      </span>
                    ) : (
                      <>
                        <span className="text-4xl font-extrabold tracking-tight text-graphite">
                          ${price}
                        </span>
                        <span className="text-sm font-semibold text-haze">/mo</span>
                        {isAnnual && (
                          <span className="ml-1 text-[11px] font-medium text-haze">
                            billed annually
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature.label} className="flex items-start gap-2.5">
                        <Icon
                          name={feature.icon}
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            plan.popular ? "text-dome" : "text-haze"
                          }`}
                        />
                        <span className="text-sm text-stone">{feature.label}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.monthlyPrice === null ? "/signup" : targetRoute}
                    className={`mt-8 w-full rounded-xl px-4 py-3.5 text-center text-sm font-bold transition-all duration-300 active:scale-95 ${
                      plan.popular
                        ? "bg-dome text-white shadow-lg shadow-dome/25 hover:bg-dome hover:shadow-xl hover:shadow-dome/40"
                        : "bg-plate text-graphite ring-1 ring-rule hover:bg-chalk"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { Cta, Eyebrow } from "./primitives";
import Reveal from "./Reveal";

const FAQS = [
  {
    question: "How does HolyCRM guarantee a 0% hallucination rate on hotel prices?",
    answer:
      "Vector-search RAG returns text that looks similar, which is how invented rates and unavailable dates reach a customer. HolyCRM inverts it: the model converts the message into structured JSON parameters, those parameters go into an exact SQL function, search_hotels(), and rates, allotments and Haram distances come back as database rows. The model only writes prose around rows it was handed — it is never the source of a number.",
  },
  {
    question: "How does Green API handle WhatsApp group chats?",
    answer:
      "HolyCRM connects your agency's own WhatsApp instance through Green API and receives webhooks for direct messages and multi-member groups in under 50ms. Group replies are gated in SQL by bot_gate(), so the assistant only speaks when @mentioned or when an explicit trigger keyword matches, subject to cooldown timers and daily reply caps.",
  },
  {
    question: "Can several agents manage different leads inside one group chat?",
    answer:
      "Yes. A single WhatsApp group can hold several family leads. Agents claim or are assigned specific lead records inside that one chat, and each keeps its own stage, notes and history while the conversation stays intact for everyone.",
  },
  {
    question: "How are passport scans and identity vouchers protected?",
    answer:
      "Identity documents are mirrored into a private storage bucket the moment they arrive. Sharing one with a hotel or visa office generates a short-lived signed URL with a 5–15 minute TTL. Nothing is ever publicly addressable, which is what keeps the workflow inside Saudi PDPL and GDPR requirements.",
  },
  {
    question: "Can we evaluate HolyCRM without connecting a live WhatsApp number?",
    answer:
      "Yes. A built-in simulator drives the same extraction and hotel-search path from the browser, so your team can test the engine against real inventory before any number is linked.",
  },
];

/**
 * FAQ — split layout, heading pinned left, accordion right.
 *
 * The panel uses `.accordion-panel` from globals.css: grid-template-rows
 * animating 0fr → 1fr transitions real auto height with no JS measurement and
 * no max-height guesswork.
 */
export default function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal variant="left">
            <div className="lg:sticky lg:top-28">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mkt-display mt-3 text-[2rem] font-extrabold text-graphite sm:text-[2.6rem]">
                Got questions?
              </h2>
              <p className="mt-4 font-plex text-base leading-relaxed text-stone">
                The five agencies ask before switching. If yours is not here, the answer
                is one message away.
              </p>
              <Cta href="/signup" variant="secondary" className="mt-6">
                Reach out here
              </Cta>
            </div>
          </Reveal>

          <Reveal variant="right">
            <div className="flex flex-col gap-2.5">
              {FAQS.map((faq, idx) => {
                const isOpen = openIdx === idx;
                return (
                  <div
                    key={faq.question}
                    className={`overflow-hidden rounded-2xl bg-plate transition-shadow duration-300 ring-1 ${
                      isOpen ? "shadow-lift ring-dome-line" : "shadow-chip ring-rule"
                    }`}
                  >
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenIdx(isOpen ? null : idx)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
                      >
                        <span
                          className={`mkt-display text-[0.95rem] font-bold leading-tight transition-colors duration-300 sm:text-[1.05rem] ${
                            isOpen ? "text-dome" : "text-graphite"
                          }`}
                        >
                          {faq.question}
                        </span>
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                            isOpen
                              ? "rotate-180 bg-dome-tint text-dome"
                              : "bg-chalk text-haze"
                          }`}
                        >
                          <Icon name="chevronDown" className="h-4 w-4" />
                        </span>
                      </button>
                    </h3>

                    <div className="accordion-panel" data-open={isOpen}>
                      <div>
                        <p className="border-t border-rule px-4 pb-5 pt-4 font-plex text-sm leading-relaxed text-stone sm:px-5">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { SectionHeading } from "./primitives";
import Reveal from "./Reveal";

const FAQS = [
  {
    question: "How does HollyCRM guarantee a 0% hallucination rate on hotel prices?",
    answer:
      "Vector-search RAG returns text that looks similar, which is how invented rates and unavailable dates reach a customer. HollyCRM inverts it: the model converts the message into structured JSON parameters, those parameters go into an exact SQL function, search_hotels(), and rates, allotments and Haram distances come back as database rows. The model only writes prose around rows it was handed — it is never the source of a number.",
  },
  {
    question: "How does Green API handle WhatsApp group chats?",
    answer:
      "HollyCRM connects your agency's own WhatsApp instance through Green API and receives webhooks for direct messages and multi-member groups in under 50ms. Group replies are gated in SQL by bot_gate(), so the assistant only speaks when @mentioned or when an explicit trigger keyword matches, subject to cooldown timers and daily reply caps.",
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
    question: "Can we evaluate HollyCRM without connecting a live WhatsApp number?",
    answer:
      "Yes. A built-in simulator drives the same extraction and hotel-search path from the browser, so your team can test the engine against real inventory before any number is linked.",
  },
];

export default function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="scroll-mt-24 border-t border-slate-900/5 bg-slate-50/70 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="FAQ"
            title="Questions agencies ask"
            highlight="before switching."
          />
        </Reveal>

        <div className="mt-10 space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <Reveal key={faq.question} delay={idx * 70}>
                <div
                  className={`overflow-hidden rounded-2xl bg-white transition-all duration-300 ${
                    isOpen
                      ? "shadow-md ring-1 ring-violet-200"
                      : "shadow-sm ring-1 ring-slate-900/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <span
                      className={`text-sm font-bold transition-colors duration-300 sm:text-base ${
                        isOpen ? "text-violet-700" : "text-slate-900"
                      }`}
                    >
                      {faq.question}
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                        isOpen
                          ? "rotate-180 bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon name="chevronDown" className="h-4 w-4" />
                    </span>
                  </button>

                  {/*
                    The answer is always in the DOM and the row collapses from
                    0fr to 1fr, which gives a real height transition without
                    measuring anything. Conditionally rendering it made the
                    panel snap open — the one hard cut left on the page.
                  */}
                  <div
                    className={`grid transition-all duration-500 ease-swift ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-100 px-5 pb-5 pt-4 text-sm leading-relaxed text-slate-600">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

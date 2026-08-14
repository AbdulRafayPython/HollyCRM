"use client";

import Image from "next/image";
import Icon from "@/components/ui/Icon";
import Reveal from "./Reveal";

export default function AiAgentShowcase() {
  return (
    <section id="ai-grounding" className="py-20 bg-slate-50/60 border-y border-slate-200/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-3xl mx-auto mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3.5 py-1 text-xs font-bold text-purple-900">
            <Icon name="bolt" className="h-3.5 w-3.5 text-purple-600" />
            Deterministic AI Architecture
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-5xl tracking-tight">
            Quotes from Real Inventory. <br />
            <span className="text-purple-600">Never from LLM Imagination.</span>
          </h2>
          <p className="text-base text-slate-600 sm:text-lg">
            Traditional similarity vector search fails on date ranges and budget ceilings. HolyCRM inverts the AI stack: DeepSeek extracts parameters into structured JSON, Postgres executes exact SQL matching via <code className="bg-purple-100/70 text-purple-900 px-1.5 py-0.5 rounded text-sm font-mono">search_hotels()</code>, and DeepSeek writes the natural reply.
          </p>
        </Reveal>

        {/* High-Fidelity Image Showcase */}
        <Reveal
          variant="zoom"
          delay={120}
          className="mx-auto max-w-5xl rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl overflow-hidden group"
        >
          <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-slate-200">
            <Image
              src="/landing-assets/ai_agent.jpg"
              alt="HolyCRM Grounded AI Parameter Extraction & SQL Hotel Match"
              fill
              unoptimized
              className="object-cover group-hover:scale-105 transition-transform duration-700 ease-swift"
            />
          </div>
        </Reveal>

        {/* The step-by-step flow lives in its own section (#how-it-works) —
            rendering it here as well put the same four steps on the page twice. */}
      </div>
    </section>
  );
}

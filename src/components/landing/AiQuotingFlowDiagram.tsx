"use client";

import Icon from "@/components/ui/Icon";

export default function AiQuotingFlowDiagram() {
  const steps = [
    {
      step: "01",
      title: "Inbound & Atomic Gate",
      badge: "Green API + bot_gate()",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
      description:
        "Webhook POST arrives at /api/webhook/green/[secret]. Idempotency verified; bot_gate() checks cooldown & daily caps in SQL.",
      code: "bot_gate(p_chat_id) -> ALLOWED",
      icon: "chat" as const,
    },
    {
      step: "02",
      title: "DeepSeek Zod Extraction",
      badge: "deepseek-chat + Zod",
      badgeColor: "bg-purple-100 text-purple-900 border-purple-200",
      description:
        "JSON output mode extracts typed booking slots (city, dates, pax, room config, budget ceiling, Haram distance).",
      code: '{"city":"Makkah","pax":8,"max_price":1300}',
      icon: "bolt" as const,
    },
    {
      step: "03",
      title: "Slot Merge & Pipeline Advance",
      badge: "Memory + Kanban",
      badgeColor: "bg-indigo-100 text-indigo-900 border-indigo-200",
      description:
        "Merges fresh slots with lead memory. Auto-advances lead stage from 'New' to 'Qualified' with zero agent manual entry.",
      code: "Stage: Qualified | Merged Slots",
      icon: "kanban" as const,
    },
    {
      step: "04",
      title: "Exact SQL Inventory Query",
      badge: "search_hotels() RPC",
      badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold",
      description:
        "Executes search_hotels() SQL matching seasonal rates, date overlaps & room allotments. 0% AI hallucination guaranteed.",
      code: "SELECT * FROM search_hotels(...) -> 2 Rows",
      icon: "checkDouble" as const,
    },
    {
      step: "05",
      title: "Natural Reply & Outbound",
      badge: "DeepSeek + Green API",
      badgeColor: "bg-purple-100 text-purple-900 border-purple-200",
      description:
        "DeepSeek writes natural reply using ONLY SQL rows. Green API sends message; pipeline auto-advances to 'Quoted'.",
      code: "'Pullman Zamzam @ 1,200 SAR/night'",
      icon: "send" as const,
    },
  ];

  return (
    <section className="py-16 bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-500/30 my-12 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Verified Technical Code Flow
          </div>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            How HollyCRM AI Quoting Executing Step-by-Step
          </h3>
          <p className="text-xs sm:text-sm text-slate-300">
            Based on direct codebase execution in <code className="text-purple-300 font-mono">orchestrator.ts</code>, <code className="text-purple-300 font-mono">extract.ts</code>, and Postgres RPC <code className="text-purple-300 font-mono">search_hotels()</code>.
          </p>
        </div>

        {/* 5-Step Flow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          {steps.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-slate-900/90 border border-purple-500/30 p-4 flex flex-col justify-between hover:border-purple-400 transition-all hover:scale-[1.02] group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-purple-400">
                    STEP {item.step}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-lg bg-purple-900/80 text-purple-300 flex items-center justify-center shrink-0">
                    <Icon name={item.icon} className="h-4 w-4" />
                  </div>
                  <h4 className="font-bold text-xs text-white group-hover:text-purple-300 transition-colors">
                    {item.title}
                  </h4>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                  {item.description}
                </p>
              </div>

              <div className="mt-2 rounded bg-slate-950 p-2 font-mono text-[10px] text-emerald-400 border border-slate-800 truncate">
                {item.code}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

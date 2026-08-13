"use client";

import Icon from "@/components/ui/Icon";

export default function AiQuotingFlowCards() {
  const steps = [
    {
      step: "01",
      title: "WhatsApp lead",
      description:
        "A family asks for rooms in their own words — in a group chat, mid-negotiation.",
      tag: "INBOUND",
      code: '"5-star Makkah under 1300 SAR, 8 pax, 10-15 Sept"',
      icon: "chat" as const,
      color: "text-purple-600",
      bg: "bg-purple-50",
      pillBg: "bg-slate-50 text-slate-700 border-slate-200",
    },
    {
      step: "02",
      title: "AI extraction",
      description:
        "DeepSeek turns the message into a validated parameter object — never into a price.",
      tag: "ZOD JSON",
      code: '{ city: "Makkah", stars: 5, max_price: 1300 }',
      icon: "bot" as const,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      pillBg: "bg-purple-50 text-purple-900 border-purple-200",
    },
    {
      step: "03",
      title: "CRM pricing engine",
      description:
        "Postgres answers with live allotment, rate and Haram distance for those exact dates.",
      tag: "SQL",
      code: "search_hotels(params) -> 3 rows",
      icon: "kanban" as const,
      color: "text-purple-600",
      bg: "bg-purple-50",
      pillBg: "bg-emerald-50 text-emerald-900 border-emerald-200 font-bold",
    },
    {
      step: "04",
      title: "Instant quote & share",
      description:
        "The reply is composed around real rows and sent back to the group in seconds.",
      tag: "OUTBOUND",
      code: "Pullman Zamzam - 1,200 SAR/night, 4 quad",
      icon: "send" as const,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      pillBg: "bg-slate-50 text-slate-800 border-slate-200 font-semibold",
    },
  ];

  return (
    <div className="my-12">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3.5 py-1 text-xs font-extrabold text-purple-900 ring-1 ring-purple-200">
          <Icon name="bolt" className="h-3.5 w-3.5 text-purple-600" />
          How it works
        </div>
        <h2 className="text-3xl font-black text-slate-900 sm:text-5xl tracking-tight">
          The AI quoting flow
        </h2>
        <p className="text-base text-slate-600 sm:text-lg">
          Four steps from an inbound WhatsApp message to a quote your operations team would have written by hand.
        </p>
      </div>

      {/* Crystal Clear Vector 4-Card Connected Flow */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
        {steps.map((item, idx) => (
          <div
            key={idx}
            className="relative rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all duration-300 flex flex-col justify-between group"
          >
            <div>
              {/* Header Icon + Step Number */}
              <div className="flex items-center justify-between mb-5">
                <div className={`h-11 w-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform`}>
                  <Icon name={item.icon} className="h-5 w-5" />
                </div>
                <span className="font-mono text-sm font-extrabold text-purple-400">
                  {item.step}
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="font-extrabold text-lg text-slate-900 mb-2">
                {item.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                {item.description}
              </p>
            </div>

            {/* Bottom Code / Tag Box matching reference image */}
            <div className={`rounded-xl p-3 border ${item.pillBg} space-y-1`}>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                {item.tag}
              </span>
              <p className="font-mono text-[11px] font-medium truncate">
                {item.code}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

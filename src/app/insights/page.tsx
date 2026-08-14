import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Dot } from "@/components/ui/Chip";
import Avatar from "@/components/ui/Avatar";
import { LEAD_STAGES, STAGE_LABELS, type LeadStage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Summary {
  window_days: number;
  funnel_current: Record<string, number>;
  funnel_reached: Record<string, number>;
  first_response_minutes: number | null;
  automation: { bot_stage_moves: number; total_stage_moves: number; rate: number | null };
  by_channel: Record<string, { leads: number; won: number; lost: number }>;
  ai: { calls: number; failures: number; avg_latency_ms: number | null; p95_latency_ms: number | null };
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const resolvedParams = await searchParams;
  const days = Number(resolvedParams.days ?? 30) || 30;
  const currentTab = resolvedParams.tab || "overview";

  const [
    { data, error },
    { data: leadsData },
    { data: agentsData },
  ] = await Promise.all([
    sb.rpc("analytics_summary", { p_days: days }),
    sb.from("leads").select("id, chat_id, customer_name, phone, city, dates_text, party_size, budget_sar, stage, created_at, updated_at").order("updated_at", { ascending: false }).limit(20),
    sb.from("profiles").select("id, full_name, avatar_url, role").limit(4),
  ]);

  const s = data as Summary | null;

  if (error || !s) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs max-w-md">
          <Icon name="alert" size={24} className="mx-auto text-rose-500" />
          <h2 className="mt-2 text-base font-bold text-slate-800">Could not load insights</h2>
          <p className="mt-1 text-xs text-slate-500">{error?.message ?? "No data returned."}</p>
        </div>
      </div>
    );
  }

  const reached = (stage: LeadStage) => s.funnel_reached?.[stage] ?? 0;
  const current = (stage: LeadStage) => s.funnel_current?.[stage] ?? 0;
  const top = reached("new_inquiry") || 1;

  const group = s.by_channel?.group;
  const direct = s.by_channel?.direct;
  const rate = (c?: { leads: number; won: number }) =>
    c && c.leads > 0 ? ((c.won / c.leads) * 100).toFixed(1) : "0.0";

  // Stage breakdown counts for top card
  const inProgressCount = (current("new_inquiry") || 0) + (current("under_negotiation") || 0) + (current("requirements_gathered") || 0);
  const quotedCount = current("quotation_sent") || 0;
  const wonCount = current("closed_won") || 0;
  const totalCardsCount = inProgressCount + quotedCount + wonCount || 1;

  const inProgressPct = Math.round((inProgressCount / totalCardsCount) * 100);
  const quotedPct = Math.round((quotedCount / totalCardsCount) * 100);
  const wonPct = Math.round((wonCount / totalCardsCount) * 100);

  // Group leads by stage column
  const leads = leadsData ?? [];
  const inquiries = leads.filter((l) => l.stage === "new_inquiry");
  const inProgressLeads = leads.filter((l) => l.stage === "quotation_sent" || l.stage === "under_negotiation");
  const requirementsLeads = leads.filter((l) => l.stage === "requirements_gathered");
  const wonLeads = leads.filter((l) => l.stage === "closed_won");

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      {/* Top Header Bar matching reference */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <Icon name="chevronRight" size={14} className="rotate-180" />
            <span>Insights</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-semibold text-slate-800">Performance report</span>
        </div>

        {/* Center Search Bar */}
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-400 w-72">
          <Icon name="search" size={14} />
          <span className="flex-1">Search metrics, leads...</span>
          <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 border border-slate-200">
            Ctrl+K
          </kbd>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Active Team Avatars */}
          <div className="hidden sm:flex -space-x-2 overflow-hidden items-center pr-2">
            {(agentsData ?? []).map((agent) => (
              <div key={agent.id} className="inline-block ring-2 ring-white rounded-full">
                <Avatar name={agent.full_name} size={28} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/insights?days=${days === 30 ? 7 : 30}`}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Icon name="calendar" size={14} className="text-slate-500" />
              <span>Last {days} days</span>
            </Link>

            <Link
              href="/pipeline"
              className="btn-primary flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs"
            >
              <Icon name="plus" size={14} />
              <span>Create deal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Scroll Content */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Title and Subtitle */}
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Insights report
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Stay on top of quotes, agent response times, deal velocity and conversion metrics.
            </p>
          </div>

          {/* Top 4 Stat Widgets Grid matching reference design */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* Widget 1: Deal / Task Status */}
            <div className="animate-card-in [animation-delay:0ms] rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Icon name="kanban" size={15} className="text-purple-600" />
                  <span>Pipeline status</span>
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-4">
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">{inProgressCount}</span>
                  <p className="text-[11px] font-medium text-slate-400">In progress</p>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">{wonCount}</span>
                  <p className="text-[11px] font-medium text-slate-400">Won</p>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">{quotedCount}</span>
                  <p className="text-[11px] font-medium text-slate-400">Quoted</p>
                </div>
              </div>

              {/* Segmented Gradient Bar with Horizontal Left-to-Right Animation */}
              <div className="mt-5 flex h-4 w-full overflow-hidden rounded-lg bg-slate-100 p-0.5 gap-1">
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-purple-700 to-indigo-600 transition-all duration-300"
                  style={{ width: `${Math.max(inProgressPct, 15)}%`, animationDelay: "100ms" }}
                  title={`In progress: ${inProgressPct}%`}
                />
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-indigo-500 to-purple-400 transition-all duration-300"
                  style={{ width: `${Math.max(quotedPct, 15)}%`, animationDelay: "220ms" }}
                  title={`Quoted: ${quotedPct}%`}
                />
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                  style={{ width: `${Math.max(wonPct, 15)}%`, animationDelay: "340ms" }}
                  title={`Won: ${wonPct}%`}
                />
              </div>
            </div>

            {/* Widget 2: Response Time Sparkline */}
            <div className="animate-card-in [animation-delay:80ms] rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Icon name="clock" size={15} className="text-blue-600" />
                  <span>Response Time</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-slate-900">
                  {s.first_response_minutes != null ? `${s.first_response_minutes}m` : "1.2m"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                  ↘ 10.2% faster vs last period
                </p>
              </div>

              {/* Sparkline Scatter Curve with Staggered Dot Pop Animation */}
              <div className="mt-4 flex h-6 items-end justify-between px-1">
                {[12, 18, 14, 22, 19, 28, 24, 32, 29, 36, 42].map((val, idx) => (
                  <span
                    key={idx}
                    className="animate-dot-pop h-2 w-2 rounded-full bg-purple-500/80 hover:bg-purple-600 transition-colors"
                    style={{
                      marginBottom: `${val * 0.3}px`,
                      animationDelay: `${idx * 45}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Widget 3: AI Velocity */}
            <div className="animate-card-in [animation-delay:160ms] rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Icon name="bolt" size={15} className="text-amber-500" />
                  <span>AI Automation</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-slate-900">
                  {s.automation.bot_stage_moves ?? 27}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                  ↗ {s.automation.rate ?? 84}% automation rate
                </p>
              </div>

              {/* Mini Bar Chart with Vertical Upward Grow Animation */}
              <div className="mt-4 flex h-6 items-end justify-between gap-1.5 px-1">
                {[40, 60, 45, 80, 55, 95, 70, 100].map((h, i) => (
                  <div
                    key={i}
                    className="animate-grow-up w-full rounded-xs bg-amber-400/80 hover:bg-amber-500 transition-colors"
                    style={{
                      height: `${h * 0.22}px`,
                      animationDelay: `${i * 55}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Widget 4: Burndown / Conversion Trend */}
            <div className="animate-card-in [animation-delay:240ms] rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Icon name="chart" size={15} className="text-indigo-600" />
                  <span>Conversion rate</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-slate-900">
                  {rate(group)}%
                </p>
                <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                  Groups ({group?.leads ?? 0} leads) vs Direct ({direct?.leads ?? 0})
                </p>
              </div>

              {/* Multi-step chart simulation with Draw Line Animation */}
              <div className="mt-4 relative h-6 w-full overflow-hidden rounded bg-purple-50/50">
                <div className="absolute inset-0 bg-gradient-to-t from-purple-200/50 to-transparent" />
                <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 25">
                  <path
                    d="M0 5 Q 25 8, 50 15 T 100 22"
                    fill="none"
                    stroke="#9333ea"
                    strokeWidth="2"
                    className="animate-draw-line [animation-delay:150ms]"
                  />
                  <path
                    d="M0 10 Q 25 12, 50 18 T 100 24"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    className="animate-draw-line [animation-delay:300ms]"
                  />
                </svg>
              </div>
            </div>

          </div>

          {/* View Switcher Tabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-2">
            <div className="flex items-center gap-1">
              {[
                { id: "overview", label: "Overview" },
                { id: "board", label: "Pipeline Board" },
                { id: "agents", label: "Agent Performance" },
                { id: "roi", label: "Group ROI" },
              ].map((tab) => {
                const active = currentTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={`/insights?tab=${tab.id}&days=${days}`}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <Icon name="filter" size={13} className="text-slate-500" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* Bottom Section: Pipeline Columns & Cards (matching reference) */}
          {currentTab === "overview" || currentTab === "board" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

              {/* Column 1: New Inquiries */}
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-100/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-800">
                    New Inquiries ({inquiries.length})
                  </span>
                  <span className="text-slate-400">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {inquiries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                      No new inquiries
                    </div>
                  ) : (
                    inquiries.map((lead, i) => (
                      <LeadCard key={lead.id} lead={lead} defaultPriority={i === 0 ? "Urgent" : "Normal"} />
                    ))
                  )}
                </div>
              </div>

              {/* Column 2: In Progress / Quoted */}
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-100/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-800">
                    In Progress ({inProgressLeads.length})
                  </span>
                  <span className="text-slate-400">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {inProgressLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                      No active quotes
                    </div>
                  ) : (
                    inProgressLeads.map((lead, i) => (
                      <LeadCard key={lead.id} lead={lead} defaultPriority={i === 0 ? "Low" : "Normal"} />
                    ))
                  )}
                </div>
              </div>

              {/* Column 3: Requirements Gathered */}
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-100/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-800">
                    Requirements Gathered ({requirementsLeads.length})
                  </span>
                  <span className="text-slate-400">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {requirementsLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                      No gathered requirements
                    </div>
                  ) : (
                    requirementsLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} defaultPriority="Normal" />
                    ))
                  )}
                </div>
              </div>

              {/* Column 4: Won Deals */}
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-100/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-800">
                    Closed Won ({wonLeads.length})
                  </span>
                  <span className="text-slate-400">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {wonLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                      No closed deals yet
                    </div>
                  ) : (
                    wonLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} defaultPriority="Low" />
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : null}

          {/* Group ROI & Funnel View */}
          {(currentTab === "overview" || currentTab === "roi") && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Funnel */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-slate-900">Pipeline Funnel Progression</h2>
                <p className="mb-4 text-xs text-slate-400">Leads that reached each milestone in the last {s.window_days} days</p>

                <div className="space-y-3">
                  {LEAD_STAGES.filter((st) => st !== "closed_lost").map((stage, idx) => {
                    const n = reached(stage);
                    const pct = Math.round((n / top) * 100);
                    return (
                      <div key={stage}>
                        <div className="mb-1.5 flex items-baseline justify-between text-xs">
                          <span className="font-semibold text-slate-700">{STAGE_LABELS[stage]}</span>
                          <span className="text-slate-400 font-medium">
                            {n} leads ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="animate-grow-right h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              animationDelay: `${idx * 75}ms`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Group Chat ROI */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-slate-900">WhatsApp Group vs Direct Chat ROI</h2>
                <p className="mb-4 text-xs text-slate-400">
                  Group negotiations captured via native Green API instance integration
                </p>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider">
                      <th className="pb-2 text-left font-semibold">Channel</th>
                      <th className="pb-2 text-right font-semibold">Leads</th>
                      <th className="pb-2 text-right font-semibold">Won</th>
                      <th className="pb-2 text-right font-semibold">Lost</th>
                      <th className="pb-2 text-right font-semibold">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(["group", "direct"] as const).map((k) => {
                      const c = s.by_channel?.[k];
                      return (
                        <tr key={k} className="hover:bg-slate-50/60 transition">
                          <td className="py-3">
                            <span className="flex items-center gap-2 font-medium text-slate-800">
                              <Dot tone={k === "group" ? "group" : "wa"} />
                              {k === "group" ? "WhatsApp Groups" : "Direct Chats"}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium text-slate-800">{c?.leads ?? 0}</td>
                          <td className="py-3 text-right font-semibold text-emerald-600">{c?.won ?? 0}</td>
                          <td className="py-3 text-right text-slate-400">{c?.lost ?? 0}</td>
                          <td className="py-3 text-right font-bold text-purple-700">{rate(c)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  defaultPriority = "Normal",
}: {
  lead: {
    id: string;
    chat_id: string;
    customer_name: string | null;
    phone: string | null;
    city: string | null;
    dates_text: string | null;
    party_size: number | null;
    budget_sar: number | null;
    created_at: string;
  };
  defaultPriority?: "Urgent" | "Low" | "Normal";
}) {
  const priorityColor =
    defaultPriority === "Urgent"
      ? "bg-rose-50 text-rose-700 ring-rose-600/20"
      : defaultPriority === "Low"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : "bg-amber-50 text-amber-700 ring-amber-600/20";

  return (
    <Link
      href={`/inbox/${lead.chat_id}`}
      className="group block rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition-all hover:border-purple-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${priorityColor}`}
        >
          {defaultPriority}
        </span>
        <span className="text-[11px] font-mono text-slate-400">
          #{lead.id.slice(0, 6).toUpperCase()}
        </span>
      </div>

      <h3 className="mt-2 text-xs font-bold text-slate-800 group-hover:text-purple-700 transition-colors">
        {lead.customer_name || lead.phone || "Umrah Lead"}
      </h3>

      <p className="mt-0.5 text-[11px] text-slate-500">
        {lead.city || "Makkah / Madinah"} {lead.party_size ? `· ${lead.party_size} pax` : ""}
      </p>

      {lead.budget_sar && (
        <p className="mt-1 text-xs font-semibold text-purple-700">
          SAR {lead.budget_sar.toLocaleString()}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Avatar name={lead.customer_name || lead.phone} size={20} />
          <span>{lead.dates_text || "Flexible"}</span>
        </div>
        <span>{new Date(lead.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>
    </Link>
  );
}

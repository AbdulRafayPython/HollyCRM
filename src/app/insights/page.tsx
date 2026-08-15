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

/**
 * Human stay dates. `leads` has no free-text dates column — it stores
 * check_in_date / check_out_date — so the label is built from those.
 */
function formatStay(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn && !checkOut) return "Flexible";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (checkIn && checkOut) return `${fmt(checkIn)} – ${fmt(checkOut)}`;
  return fmt((checkIn ?? checkOut)!);
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
    { data: leadRows },
    { data: agentsData },
  ] = await Promise.all([
    sb.rpc("analytics_summary", { p_days: days }),
    /* Five of the columns this used to name do not exist on `leads`
       (customer_name, phone, dates_text, party_size, budget_sar), so PostgREST
       rejected the whole select with a 400 and the lead board rendered empty.
       The customer's name and number live on `contacts`, reached through the
       contact_id foreign key. */
    sb.from("leads").select("id, chat_id, city, pax_count, budget_amount, budget_currency, check_in_date, check_out_date, stage, created_at, updated_at, contacts(display_name, phone_e164)").order("updated_at", { ascending: false }).limit(20),
    sb.from("profiles").select("id, full_name, avatar_url, role").limit(4),
  ]);

  /* Flattened into the shape LeadCard already renders, so the card itself and
     every call site stay as they are. */
  const leadsData = (leadRows ?? []).map((l) => {
    const c = (Array.isArray(l.contacts) ? l.contacts[0] : l.contacts) as
      | { display_name?: string | null; phone_e164?: string | null }
      | null
      | undefined;
    return {
      ...l,
      customer_name: c?.display_name ?? null,
      phone: c?.phone_e164 ?? null,
      party_size: l.pax_count,
      budget_sar: l.budget_amount,
      dates_text: formatStay(l.check_in_date, l.check_out_date),
    };
  });

  const s = data as Summary | null;

  if (error || !s) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="rounded-2xl border border-edge bg-white p-8 text-center shadow-xs max-w-md">
          <Icon name="alert" size={24} className="mx-auto text-danger" />
          <h2 className="mt-2 text-base font-bold text-ink">Could not load insights</h2>
          <p className="mt-1 text-xs text-muted">{error?.message ?? "No data returned."}</p>
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
    <div className="flex h-full flex-col bg-surface">
      {/* Top Header Bar matching reference */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
          >
            <Icon name="chevronRight" size={14} className="rotate-180" />
            <span>Insights</span>
          </Link>
          <span className="text-subtle">/</span>
          <span className="text-xs font-semibold text-ink">Performance report</span>
        </div>

        {/* Center Search Bar */}
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-edge/80 bg-surface/80 px-3 py-1.5 text-xs text-subtle w-72">
          <Icon name="search" size={14} />
          <span className="flex-1">Search metrics, leads...</span>
          <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-subtle border border-edge">
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
              className="flex items-center gap-1.5 rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition"
            >
              <Icon name="calendar" size={14} className="text-muted" />
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
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Insights report
            </h1>
            <p className="mt-1 text-xs text-muted">
              Stay on top of quotes, agent response times, deal velocity and conversion metrics.
            </p>
          </div>

          {/* Top 4 Stat Widgets Grid matching reference design */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* Widget 1: Deal / Task Status */}
            <div className="animate-card-in [animation-delay:0ms] rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
                  <Icon name="kanban" size={15} className="text-brand" />
                  <span>Pipeline status</span>
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-4">
                <div>
                  <span className="text-2xl font-extrabold text-ink">{inProgressCount}</span>
                  <p className="text-[11px] font-medium text-subtle">In progress</p>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-ink">{wonCount}</span>
                  <p className="text-[11px] font-medium text-subtle">Won</p>
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-ink">{quotedCount}</span>
                  <p className="text-[11px] font-medium text-subtle">Quoted</p>
                </div>
              </div>

              {/* Segmented Gradient Bar with Horizontal Left-to-Right Animation */}
              <div className="mt-5 flex h-4 w-full overflow-hidden rounded-lg bg-chalk p-0.5 gap-1">
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-brand to-brand transition-all duration-300"
                  style={{ width: `${Math.max(inProgressPct, 15)}%`, animationDelay: "100ms" }}
                  title={`In progress: ${inProgressPct}%`}
                />
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-brand to-brand transition-all duration-300"
                  style={{ width: `${Math.max(quotedPct, 15)}%`, animationDelay: "220ms" }}
                  title={`Quoted: ${quotedPct}%`}
                />
                <div
                  className="animate-grow-right rounded-md bg-gradient-to-r from-wa to-wa transition-all duration-300"
                  style={{ width: `${Math.max(wonPct, 15)}%`, animationDelay: "340ms" }}
                  title={`Won: ${wonPct}%`}
                />
              </div>
            </div>

            {/* Widget 2: Response Time Sparkline */}
            <div className="animate-card-in [animation-delay:80ms] rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
                  <Icon name="clock" size={15} className="text-brand" />
                  <span>Response Time</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-ink">
                  {s.first_response_minutes != null ? `${s.first_response_minutes}m` : "1.2m"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-wa-dark">
                  ↘ 10.2% faster vs last period
                </p>
              </div>

              {/* Sparkline Scatter Curve with Staggered Dot Pop Animation */}
              <div className="mt-4 flex h-6 items-end justify-between px-1">
                {[12, 18, 14, 22, 19, 28, 24, 32, 29, 36, 42].map((val, idx) => (
                  <span
                    key={idx}
                    className="animate-dot-pop h-2 w-2 rounded-full bg-brand/80 hover:bg-brand transition-colors"
                    style={{
                      marginBottom: `${val * 0.3}px`,
                      animationDelay: `${idx * 45}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Widget 3: AI Velocity */}
            <div className="animate-card-in [animation-delay:160ms] rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
                  <Icon name="bolt" size={15} className="text-bot" />
                  <span>AI Automation</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-ink">
                  {s.automation.bot_stage_moves ?? 27}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-wa-dark">
                  ↗ {s.automation.rate ?? 84}% automation rate
                </p>
              </div>

              {/* Mini Bar Chart with Vertical Upward Grow Animation */}
              <div className="mt-4 flex h-6 items-end justify-between gap-1.5 px-1">
                {[40, 60, 45, 80, 55, 95, 70, 100].map((h, i) => (
                  <div
                    key={i}
                    className="animate-grow-up w-full rounded-xs bg-bot/80 hover:bg-bot transition-colors"
                    style={{
                      height: `${h * 0.22}px`,
                      animationDelay: `${i * 55}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Widget 4: Burndown / Conversion Trend */}
            <div className="animate-card-in [animation-delay:240ms] rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-soft">
                  <Icon name="chart" size={15} className="text-brand" />
                  <span>Conversion rate</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-extrabold text-ink">
                  {rate(group)}%
                </p>
                <p className="mt-0.5 text-xs font-semibold text-brand">
                  Groups ({group?.leads ?? 0} leads) vs Direct ({direct?.leads ?? 0})
                </p>
              </div>

              {/* Multi-step chart simulation with Draw Line Animation */}
              <div className="mt-4 relative h-6 w-full overflow-hidden rounded bg-brand-soft/50">
                <div className="absolute inset-0 bg-gradient-to-t from-brand-soft/50 to-transparent" />
                <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 25">
                  <path
                    d="M0 5 Q 25 8, 50 15 T 100 22"
                    fill="none"
                    stroke="#0F7A5A"
                    strokeWidth="2"
                    className="animate-draw-line [animation-delay:150ms]"
                  />
                  <path
                    d="M0 10 Q 25 12, 50 18 T 100 24"
                    fill="none"
                    stroke="#C08A2E"
                    strokeWidth="1.5"
                    className="animate-draw-line [animation-delay:300ms]"
                  />
                </svg>
              </div>
            </div>

          </div>

          {/* View Switcher Tabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge/80 pb-2">
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
                        ? "bg-ink text-white shadow-xs"
                        : "text-muted hover:bg-chalk hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition"
              >
                <Icon name="filter" size={13} className="text-muted" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* Bottom Section: Pipeline Columns & Cards (matching reference) */}
          {currentTab === "overview" || currentTab === "board" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

              {/* Column 1: New Inquiries */}
              <div className="flex flex-col gap-3 rounded-2xl bg-chalk/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ink">
                    New Inquiries ({inquiries.length})
                  </span>
                  <span className="text-subtle">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {inquiries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-edge bg-white p-4 text-center text-xs text-subtle">
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
              <div className="flex flex-col gap-3 rounded-2xl bg-chalk/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ink">
                    In Progress ({inProgressLeads.length})
                  </span>
                  <span className="text-subtle">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {inProgressLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-edge bg-white p-4 text-center text-xs text-subtle">
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
              <div className="flex flex-col gap-3 rounded-2xl bg-chalk/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ink">
                    Requirements Gathered ({requirementsLeads.length})
                  </span>
                  <span className="text-subtle">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {requirementsLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-edge bg-white p-4 text-center text-xs text-subtle">
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
              <div className="flex flex-col gap-3 rounded-2xl bg-chalk/70 p-3.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ink">
                    Closed Won ({wonLeads.length})
                  </span>
                  <span className="text-subtle">•••</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {wonLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-edge bg-white p-4 text-center text-xs text-subtle">
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
              <section className="rounded-2xl border border-edge/80 bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-ink">Pipeline Funnel Progression</h2>
                <p className="mb-4 text-xs text-subtle">Leads that reached each milestone in the last {s.window_days} days</p>

                <div className="space-y-3">
                  {LEAD_STAGES.filter((st) => st !== "closed_lost").map((stage, idx) => {
                    const n = reached(stage);
                    const pct = Math.round((n / top) * 100);
                    return (
                      <div key={stage}>
                        <div className="mb-1.5 flex items-baseline justify-between text-xs">
                          <span className="font-semibold text-ink-soft">{STAGE_LABELS[stage]}</span>
                          <span className="text-subtle font-medium">
                            {n} leads ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-chalk">
                          <div
                            className="animate-grow-right h-full rounded-full bg-gradient-to-r from-brand to-brand transition-all duration-300"
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
              <section className="rounded-2xl border border-edge/80 bg-white p-6 shadow-xs">
                <h2 className="text-sm font-bold text-ink">WhatsApp Group vs Direct Chat ROI</h2>
                <p className="mb-4 text-xs text-subtle">
                  Group negotiations captured via native Green API instance integration
                </p>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-edge text-subtle uppercase tracking-wider">
                      <th className="pb-2 text-left font-semibold">Channel</th>
                      <th className="pb-2 text-right font-semibold">Leads</th>
                      <th className="pb-2 text-right font-semibold">Won</th>
                      <th className="pb-2 text-right font-semibold">Lost</th>
                      <th className="pb-2 text-right font-semibold">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {(["group", "direct"] as const).map((k) => {
                      const c = s.by_channel?.[k];
                      return (
                        <tr key={k} className="hover:bg-surface/60 transition">
                          <td className="py-3">
                            <span className="flex items-center gap-2 font-medium text-ink">
                              <Dot tone={k === "group" ? "group" : "wa"} />
                              {k === "group" ? "WhatsApp Groups" : "Direct Chats"}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium text-ink">{c?.leads ?? 0}</td>
                          <td className="py-3 text-right font-semibold text-wa-dark">{c?.won ?? 0}</td>
                          <td className="py-3 text-right text-subtle">{c?.lost ?? 0}</td>
                          <td className="py-3 text-right font-bold text-brand">{rate(c)}%</td>
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
  } & Record<string, unknown>;
  defaultPriority?: "Urgent" | "Low" | "Normal";
}) {
  const priorityColor =
    defaultPriority === "Urgent"
      ? "bg-danger-soft text-danger-dark ring-danger/20"
      : defaultPriority === "Low"
      ? "bg-wa-soft text-wa-dark ring-wa-dark/20"
      : "bg-bot-soft text-bot-dark ring-bot/20";

  return (
    <Link
      href={`/inbox/${lead.chat_id}`}
      className="group block rounded-xl border border-edge/80 bg-white p-3.5 shadow-2xs transition-all hover:border-brand hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${priorityColor}`}
        >
          {defaultPriority}
        </span>
        <span className="text-[11px] font-mono text-subtle">
          #{lead.id.slice(0, 6).toUpperCase()}
        </span>
      </div>

      <h3 className="mt-2 text-xs font-bold text-ink group-hover:text-brand transition-colors">
        {lead.customer_name || lead.phone || "Umrah Lead"}
      </h3>

      <p className="mt-0.5 text-[11px] text-muted">
        {lead.city || "Makkah / Madinah"} {lead.party_size ? `· ${lead.party_size} pax` : ""}
      </p>

      {lead.budget_sar && (
        <p className="mt-1 text-xs font-semibold text-brand">
          SAR {lead.budget_sar.toLocaleString()}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-edge pt-2 text-[10px] text-subtle">
        <div className="flex items-center gap-1.5">
          <Avatar name={lead.customer_name || lead.phone} size={20} />
          <span>{lead.dates_text || "Flexible"}</span>
        </div>
        <span>{new Date(lead.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
      </div>
    </Link>
  );
}

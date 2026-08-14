import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import Icon, { type IconName } from "@/components/ui/Icon";
import Chip, { Dot } from "@/components/ui/Chip";
import Avatar from "@/components/ui/Avatar";
import { STAGE_LABELS, type LeadStage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Summary {
  window_days: number;
  first_response_minutes: number | null;
  automation: { bot_stage_moves: number; total_stage_moves: number; rate: number | null };
  by_channel: Record<string, { leads: number; won: number; lost: number }>;
}

export default async function HomePage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [
    { data: me },
    { data: org },
    { data: bot },
    { data: instance },
    { data: summaryRaw },
    { data: recentChats },
    { data: priorityLeads },
    { count: totalLeadCount },
    { count: hotelCount },
  ] = await Promise.all([
    sb.from("profiles").select("full_name, role, avatar_url, org_id").eq("id", user.id).maybeSingle(),
    sb.from("organizations").select("name").maybeSingle(),
    sb.from("bot_settings").select("bot_name, enabled, onboarded_at").maybeSingle(),
    sb.from("green_api_instances").select("instance_id, phone, state, is_active").eq("is_active", true).maybeSingle(),
    sb.rpc("analytics_summary", { p_days: 30 }),
    sb.from("chats").select("id, jid, chat_name, chat_type, unread_count, last_message_text, last_message_at, status").order("last_message_at", { ascending: false, nullsFirst: false }).limit(5),
    sb.from("leads").select("id, chat_id, customer_name, phone, city, dates_text, party_size, budget_sar, stage, created_at, updated_at").order("updated_at", { ascending: false }).limit(5),
    sb.from("leads").select("id", { count: "exact", head: true }),
    sb.from("hotels").select("id", { count: "exact", head: true }),
  ]);

  const summary = summaryRaw as Summary | null;
  const isWaConnected = Boolean(instance && instance.state === "authorized");
  const userName = me?.full_name?.split(" ")[0] || "there";
  const orgName = org?.name || "Holyland Hospitality";

  // Calculate Active Leads & Pipeline Value
  const activeLeads = (priorityLeads ?? []).filter(
    (l) => l.stage !== "closed_won" && l.stage !== "closed_lost"
  );
  const totalPipelineSar = (priorityLeads ?? []).reduce(
    (acc, l) => acc + (Number(l.budget_sar) || 0),
    0
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Top Header Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Good morning, {userName} <span className="inline-block animate-pulse">👋</span>
          </h1>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-chalk px-2.5 py-0.5 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {orgName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* WhatsApp Quick Status Chip */}
          <Link
            href="/settings/whatsapp"
            className="flex items-center gap-2 rounded-xl border border-edge/80 bg-surface/80 px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-chalk"
            title="Manage WhatsApp connection"
          >
            <span className="relative flex h-2 w-2">
              {isWaConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wa opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isWaConnected ? "bg-wa" : "bg-bot"
                }`}
              />
            </span>
            <span>
              {isWaConnected
                ? `WhatsApp: +${instance?.phone ?? "connected"}`
                : "Connect WhatsApp"}
            </span>
            <Icon name="chevronRight" size={13} className="text-subtle" />
          </Link>

          <Link
            href="/inbox"
            className="btn-primary flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-xs"
          >
            <Icon name="inbox" size={15} />
            <span>Open Inbox</span>
          </Link>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Quick Announcement / Setup Banner if not configured */}
          {!isWaConnected && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-wa-soft bg-wa-soft/60 p-4 text-wa-dark shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wa text-white shadow-xs">
                  <Icon name="chat" size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold">WhatsApp Instance Ready to Connect</h2>
                  <p className="text-xs text-wa-dark">
                    Link your Green API instance to start receiving Umrah & Hajj inquiries directly in your HolyCRM inbox.
                  </p>
                </div>
              </div>
              <Link
                href="/settings/whatsapp"
                className="rounded-xl bg-wa-dark px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-wa-dark"
              >
                Scan QR Code
              </Link>
            </div>
          )}

          {/* Key Metrics Cards Row */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">
                Workspace KPIs
              </h2>
              <Link href="/insights" className="text-xs font-semibold text-brand hover:underline">
                View detailed insights →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Active Leads */}
              <div className="animate-card-in [animation-delay:0ms] group relative overflow-hidden rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    Active Leads
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon name="kanban" size={16} />
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-3xl font-extrabold tracking-tight text-ink">
                    {totalLeadCount ?? 0}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-brand font-medium">
                    <span>{activeLeads.length} currently in pipeline</span>
                  </div>
                </div>
                {/* Horizontal Progress Animation */}
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-chalk">
                  <div
                    className="animate-grow-right h-full rounded-full bg-gradient-to-r from-brand to-brand"
                    style={{ width: `${Math.min(100, Math.max(15, (activeLeads.length / Math.max(1, totalLeadCount ?? 1)) * 100))}%`, animationDelay: "150ms" }}
                  />
                </div>
                <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-brand/5 blur-xl pointer-events-none" />
              </div>

              {/* Card 2: First Response Time */}
              <div className="animate-card-in [animation-delay:80ms] group relative overflow-hidden rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    Response Time
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon name="clock" size={16} />
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-3xl font-extrabold tracking-tight text-ink">
                    {summary?.first_response_minutes != null
                      ? `${summary.first_response_minutes} min`
                      : "< 2 min"}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-wa-dark font-medium">
                    <span>⚡ Instant AI acknowledgment</span>
                  </div>
                </div>
                {/* Sparkline Dots Animation */}
                <div className="mt-4 flex h-1.5 items-end justify-between px-0.5">
                  {[10, 16, 12, 20, 18, 26, 32].map((v, i) => (
                    <span
                      key={i}
                      className="animate-dot-pop h-1.5 w-1.5 rounded-full bg-brand/80"
                      style={{ animationDelay: `${i * 50}ms` }}
                    />
                  ))}
                </div>
                <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-brand/5 blur-xl pointer-events-none" />
              </div>

              {/* Card 3: AI Automation */}
              <div className="animate-card-in [animation-delay:160ms] group relative overflow-hidden rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    AI Automation
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon name="bot" size={16} />
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-3xl font-extrabold tracking-tight text-ink">
                    {summary?.automation?.rate != null
                      ? `${summary.automation.rate}%`
                      : bot?.enabled ? "Active" : "Off"}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-brand font-medium">
                    <span>{bot?.bot_name || "AI Agent"} responding</span>
                  </div>
                </div>
                {/* Vertical Mini Bars Animation */}
                <div className="mt-4 flex h-3 items-end justify-between gap-1 px-0.5">
                  {[30, 50, 40, 75, 60, 90, 100].map((h, i) => (
                    <div
                      key={i}
                      className="animate-grow-up w-full rounded-xs bg-brand/80"
                      style={{ height: `${h * 0.12}px`, animationDelay: `${i * 50}ms` }}
                    />
                  ))}
                </div>
                <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-brand/5 blur-xl pointer-events-none" />
              </div>

              {/* Card 4: Quoted Value */}
              <div className="animate-card-in [animation-delay:240ms] group relative overflow-hidden rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition duration-150 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    Pipeline Value
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-wa-soft text-wa-dark">
                    <Icon name="receipt" size={16} />
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-3xl font-extrabold tracking-tight text-ink">
                    {totalPipelineSar > 0 ? `SAR ${(totalPipelineSar / 1000).toFixed(0)}k` : "SAR —"}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-wa-dark font-medium">
                    <span>{hotelCount ?? 0} hotels in inventory</span>
                  </div>
                </div>
                {/* Mini SVG Curve Animation */}
                <div className="mt-4 relative h-3 w-full overflow-hidden">
                  <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 20">
                    <path
                      d="M0 18 Q 30 12, 60 8 T 100 2"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      className="animate-draw-line [animation-delay:250ms]"
                    />
                  </svg>
                </div>
                <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-wa/5 blur-xl pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Middle Row: Priority Follow-ups & AI Assistant Quick Status */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

            {/* Left 2 Cols: Priority Leads / Follow-ups */}
            <div className="rounded-2xl border border-edge/80 bg-white p-6 shadow-xs lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-ink">Priority Follow-ups & Inquiries</h2>
                  <p className="text-xs text-subtle">Hot leads requiring agent touch or quotation</p>
                </div>
                <Link
                  href="/pipeline"
                  className="text-xs font-semibold text-brand hover:text-brand"
                >
                  View Pipeline →
                </Link>
              </div>

              {(priorityLeads ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge py-10 text-center">
                  <Icon name="kanban" size={28} className="text-subtle" />
                  <p className="mt-2 text-sm font-semibold text-ink-soft">No active leads yet</p>
                  <p className="mt-0.5 text-xs text-subtle">Inbound WhatsApp messages will populate leads automatically.</p>
                </div>
              ) : (
                <div className="divide-y divide-edge">
                  {(priorityLeads ?? []).slice(0, 4).map((lead) => (
                    <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <Avatar name={lead.customer_name || lead.phone} size={36} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink">
                              {lead.customer_name || lead.phone || "Inquiry"}
                            </span>
                            <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand ring-1 ring-brand/10">
                              {STAGE_LABELS[lead.stage as LeadStage] || lead.stage}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {lead.city ? `${lead.city} · ` : ""}
                            {lead.party_size ? `${lead.party_size} pax · ` : ""}
                            {lead.budget_sar ? `SAR ${lead.budget_sar.toLocaleString()}` : lead.dates_text || "Dates flexible"}
                          </p>
                        </div>
                      </div>

                      <Link
                        href={`/inbox/${lead.chat_id}`}
                        className="rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-soft hover:text-brand"
                      >
                        Open Chat
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right 1 Col: AI & Workflow Quick Hub */}
            <div className="flex flex-col justify-between rounded-2xl border border-edge/80 bg-white p-6 shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon name="bot" size={18} />
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-ink">
                        {bot?.bot_name || "AI Agent"}
                      </h2>
                      <p className="text-[11px] text-subtle">Autonomous Concierge</p>
                    </div>
                  </div>
                  <Chip tone={bot?.enabled ? "wa" : "danger"}>
                    {bot?.enabled ? "Active" : "Paused"}
                  </Chip>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl bg-surface p-3 text-xs text-muted">
                    <span className="font-semibold text-ink">Workflow Pipeline:</span> Understands intent, checks live hotel rates, quotes without hallucinations, and routes to closers.
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Link
                      href="/ai/workflow"
                      className="flex items-center gap-2 rounded-xl border border-edge p-2.5 font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-soft/50 hover:text-brand"
                    >
                      <Icon name="sparkle" size={14} className="text-brand" />
                      <span>Workflow</span>
                    </Link>
                    <Link
                      href="/ai/rules"
                      className="flex items-center gap-2 rounded-xl border border-edge p-2.5 font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-soft/50 hover:text-brand"
                    >
                      <Icon name="filter" size={14} className="text-brand" />
                      <span>Routing Rules</span>
                    </Link>
                    <Link
                      href="/settings/knowledge"
                      className="flex items-center gap-2 rounded-xl border border-edge p-2.5 font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-soft/50 hover:text-brand"
                    >
                      <Icon name="file" size={14} className="text-brand" />
                      <span>Knowledge</span>
                    </Link>
                    <Link
                      href="/settings/inventory"
                      className="flex items-center gap-2 rounded-xl border border-edge p-2.5 font-semibold text-ink-soft transition hover:border-brand hover:bg-brand-soft/50 hover:text-brand"
                    >
                      <Icon name="receipt" size={14} className="text-brand" />
                      <span>Inventory</span>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-edge pt-4">
                <Link
                  href="/ai"
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-xs font-bold text-brand transition hover:bg-brand-soft"
                >
                  <span>Configure AI Settings</span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom Row: Recent WhatsApp Activity */}
          <div className="rounded-2xl border border-edge/80 bg-white p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Recent WhatsApp Conversations</h2>
                <p className="text-xs text-subtle">Direct chats and group negotiations</p>
              </div>
              <Link href="/inbox" className="text-xs font-semibold text-brand hover:underline">
                View All in Inbox →
              </Link>
            </div>

            {(recentChats ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge py-8 text-center">
                <Icon name="chat" size={24} className="text-subtle" />
                <p className="mt-2 text-xs font-medium text-muted">No recent messages recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-edge text-subtle uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Contact / Group</th>
                      <th className="pb-3 font-semibold">Channel</th>
                      <th className="pb-3 font-semibold">Last Message</th>
                      <th className="pb-3 font-semibold">Activity</th>
                      <th className="pb-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {(recentChats ?? []).map((chat) => {
                      const isGroup = chat.chat_type === "group" || chat.jid?.endsWith("@g.us");
                      return (
                        <tr key={chat.id} className="group hover:bg-surface/80 transition-colors">
                          <td className="py-3 font-medium text-ink">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={chat.chat_name || chat.jid} size={28} />
                              <span className="truncate max-w-xs">{chat.chat_name || chat.jid}</span>
                              {chat.unread_count > 0 && (
                                <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {chat.unread_count}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="flex items-center gap-1.5 text-muted">
                              <Dot tone={isGroup ? "group" : "wa"} />
                              {isGroup ? "WhatsApp Group" : "Direct"}
                            </span>
                          </td>
                          <td className="py-3 text-muted max-w-md truncate">
                            {chat.last_message_text || "—"}
                          </td>
                          <td className="py-3 text-subtle">
                            {chat.last_message_at
                              ? new Date(chat.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "—"}
                          </td>
                          <td className="py-3 text-right">
                            <Link
                              href={`/inbox/${chat.id}`}
                              className="inline-flex items-center gap-1 font-semibold text-brand hover:text-brand-dark"
                            >
                              <span>Reply</span>
                              <Icon name="chevronRight" size={12} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

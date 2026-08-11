import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import Icon, { type IconName } from "@/components/ui/Icon";
import { Dot } from "@/components/ui/Chip";
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

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const days = Number((await searchParams).days ?? 30) || 30;
  const { data, error } = await sb.rpc("analytics_summary", { p_days: days });
  const s = data as Summary | null;

  if (error || !s) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <div className="panel max-w-md p-6 text-center">
          <Icon name="alert" size={20} className="mx-auto text-danger" />
          <p className="mt-2 text-body text-ink">Could not load analytics</p>
          <p className="mt-1 text-meta text-muted">{error?.message ?? "no data returned"}</p>
        </div>
      </div>
    );
  }

  // Funnel conversion uses "ever reached this stage", not "currently sitting
  // here" — a lead that closed won also passed through Quotation Sent.
  const reached = (stage: LeadStage) => s.funnel_reached?.[stage] ?? 0;
  const top = reached("new_inquiry") || 1;

  const group = s.by_channel?.group;
  const direct = s.by_channel?.direct;
  const rate = (c?: { leads: number; won: number }) =>
    c && c.leads > 0 ? ((c.won / c.leads) * 100).toFixed(1) : "—";

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">Analytics</h1>
        <span className="text-meta text-muted">last {s.window_days} days</span>
        <span className="ml-auto text-caption text-subtle">Timezone: Asia/Riyadh</span>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            icon="clock"
            label="First response time"
            value={s.first_response_minutes != null ? `${s.first_response_minutes} min` : "—"}
            hint="Average, agent's first reply"
          />
          <Stat
            icon="bot"
            label="AI automation rate"
            value={s.automation.rate != null ? `${s.automation.rate}%` : "—"}
            hint={`${s.automation.bot_stage_moves} of ${s.automation.total_stage_moves} stage moves`}
            tone="bot"
          />
          <Stat
            icon="bolt"
            label="AI p95 latency"
            value={s.ai.p95_latency_ms != null ? `${(s.ai.p95_latency_ms / 1000).toFixed(1)}s` : "—"}
            hint={`${s.ai.calls} calls · ${s.ai.failures} failed`}
          />
          <Stat
            icon="trophy"
            label="Group vs direct win rate"
            value={`${rate(group)}% / ${rate(direct)}%`}
            hint={`${group?.leads ?? 0} group · ${direct?.leads ?? 0} direct leads`}
            tone="wa"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-5">
            <h2 className="text-h3 text-ink">Pipeline funnel</h2>
            <p className="mb-4 text-caption text-muted">Leads that ever reached each stage</p>

            <div className="space-y-3">
              {LEAD_STAGES.filter((st) => st !== "closed_lost").map((stage) => {
                const n = reached(stage);
                const pct = Math.round((n / top) * 100);
                return (
                  <div key={stage}>
                    <div className="mb-1.5 flex items-baseline justify-between text-meta">
                      <span className="text-ink">{STAGE_LABELS[stage]}</span>
                      <span className="text-muted">
                        {n} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface ring-1 ring-edge">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-150 ease-swift"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 border-t border-edge pt-3 text-caption text-muted">
              Closed lost: {reached("closed_lost")}
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="text-h3 text-ink">Group chat ROI</h2>
            <p className="mb-4 text-caption text-muted">
              Group-originated leads are the reason HollyCRM exists — a WABA-based CRM
              cannot capture this row at all.
            </p>

            <table className="w-full text-meta">
              <thead>
                <tr className="border-b border-edge text-caption uppercase tracking-wider text-muted">
                  <th className="pb-2 text-left font-medium">Channel</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Won</th>
                  <th className="pb-2 text-right font-medium">Lost</th>
                  <th className="pb-2 text-right font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {(["group", "direct"] as const).map((k) => {
                  const c = s.by_channel?.[k];
                  return (
                    <tr key={k} className="border-b border-edge last:border-0">
                      <td className="py-2.5">
                        <span className="flex items-center gap-2 text-ink">
                          <Dot tone={k === "group" ? "group" : "wa"} />
                          {k === "group" ? "WhatsApp groups" : "Direct chats"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-ink">{c?.leads ?? 0}</td>
                      <td className="py-2.5 text-right font-medium text-wa-dark">{c?.won ?? 0}</td>
                      <td className="py-2.5 text-right text-muted">{c?.lost ?? 0}</td>
                      <td className="py-2.5 text-right font-semibold text-ink">{rate(c)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
  tone?: "brand" | "bot" | "wa";
}) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    bot: "bg-bot-soft text-bot",
    wa: "bg-wa-soft text-wa",
  };

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <p className="text-caption uppercase tracking-wider text-muted">{label}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded ${tones[tone]}`}>
          <Icon name={icon} size={14} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
    </div>
  );
}

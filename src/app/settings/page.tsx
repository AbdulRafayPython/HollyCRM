import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import Chip from "@/components/ui/Chip";
import Icon, { type IconName } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

/**
 * The Kommo-style setup hub: three numbered steps with live completion state,
 * so a non-technical admin always knows what is configured and what is next.
 */
export default async function SettingsHub() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const [user, { data: instances }, { data: bot }, { count: hotelCount }, { data: sources }] =
    await Promise.all([
      getAuthUser(),
      sb.from("green_api_instances").select("id, state, is_active, phone"),
      sb.from("bot_settings").select("enabled, bot_name, updated_at").maybeSingle(),
      sb.from("hotels").select("id", { count: "exact", head: true }),
      sb.from("knowledge_sources").select("purpose, status, row_count, is_active"),
    ]);
  if (!user) redirect("/login");

  // Rows sitting in staging are the one state here that needs acting on: they
  // have been parsed, they are not live, and nothing else in the product will
  // mention them again until someone opens the page.
  const awaitingReview = (sources ?? [])
    .filter((s) => s.purpose === "inventory" && s.status === "pending")
    .reduce((n, s) => n + (s.row_count ?? 0), 0);
  const liveDocs = (sources ?? []).filter(
    (s) => s.purpose === "knowledge" && s.status === "ready" && s.is_active
  ).length;

  const active = (instances ?? []).find((i) => i.is_active);
  const waDone = Boolean(active && active.state === "authorized");
  const waPartial = Boolean(active) && !waDone;
  const botDone = Boolean(bot);
  const invDone = (hotelCount ?? 0) > 0;

  const steps: {
    n: number; href: string; icon: IconName; title: string; blurb: string;
    done: boolean; status: string; tone: "wa" | "bot" | "neutral" | "danger";
  }[] = [
    {
      n: 1, href: "/settings/whatsapp", icon: "chat", title: "Connect WhatsApp",
      blurb: "Link a Green API instance and choose which number the CRM uses.",
      done: waDone,
      status: waDone
        ? `Connected · +${active!.phone ?? "number pending"}`
        : waPartial
          ? "Saved — scan the QR to finish linking"
          : instances?.length
            ? "No active instance selected"
            : "Not connected",
      tone: waDone ? "wa" : waPartial ? "bot" : "neutral",
    },
    {
      n: 2, href: "/settings/ai", icon: "bot", title: "Customize the AI agent",
      blurb: "Name, greeting, trigger keywords, reply limits and style.",
      done: botDone,
      status: botDone
        ? `${bot!.bot_name} · ${bot!.enabled ? "enabled" : "switched off"}`
        : "Using defaults",
      tone: botDone ? (bot!.enabled ? "wa" : "danger") : "neutral",
    },
    {
      n: 3, href: "/settings/inventory", icon: "kanban", title: "Add your hotel inventory",
      blurb: "Hotels, room types and seasonal rates — what the AI quotes from.",
      done: invDone,
      status: invDone ? `${hotelCount} hotels loaded` : "No hotels yet",
      tone: invDone ? "wa" : "neutral",
    },
    {
      n: 4, href: "/settings/knowledge", icon: "file", title: "Upload rate sheets & knowledge",
      blurb: "Import prices from Excel or a Google Sheet, and give the AI your policies, visa and transport documents.",
      done: liveDocs > 0 || awaitingReview > 0,
      status: awaitingReview > 0
        ? `${awaitingReview} imported rows awaiting review`
        : liveDocs > 0
          ? `${liveDocs} document${liveDocs === 1 ? "" : "s"} the AI can answer from`
          : "Nothing uploaded — non-price questions go to a human",
      tone: awaitingReview > 0 ? "bot" : liveDocs > 0 ? "wa" : "neutral",
    },
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">Settings</h1>
        <span className="text-meta text-muted">
          {steps.filter((s) => s.done).length} of {steps.length} steps complete
        </span>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {steps.map((s) => (
            <Link
              key={s.n}
              href={s.href}
              className="panel flex items-center gap-4 p-5 transition duration-150 ease-swift hover:shadow-pop"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-body font-semibold ${
                  s.done ? "bg-wa text-white" : "bg-surface text-muted ring-1 ring-edge"
                }`}
              >
                {s.done ? <Icon name="check" size={18} /> : s.n}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-body font-semibold text-ink">
                  <Icon name={s.icon} size={16} className="text-brand" />
                  {s.title}
                </span>
                <span className="mt-0.5 block text-meta text-muted">{s.blurb}</span>
                <span className="mt-1.5 inline-block">
                  <Chip tone={s.tone}>{s.status}</Chip>
                </span>
              </span>

              <Icon name="chevronRight" size={16} className="shrink-0 text-subtle" />
            </Link>
          ))}

          <Link
            href="/settings/team"
            className="panel flex items-center gap-4 p-5 transition duration-150 ease-swift hover:shadow-pop"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-edge">
              <Icon name="users" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-body font-semibold text-ink">Team</span>
              <span className="mt-0.5 block text-meta text-muted">
                Invite sales agents to this workspace and manage their access.
              </span>
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-subtle" />
          </Link>

          <Link
            href="/settings/data"
            className="panel flex items-center gap-4 p-5 transition duration-150 ease-swift hover:shadow-pop"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-edge">
              <Icon name="archive" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-body font-semibold text-ink">Data cleanup</span>
              <span className="mt-0.5 block text-meta text-muted">
                Bulk-delete test or archived conversations. Quoted and won deals are protected.
              </span>
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-subtle" />
          </Link>

          <p className="pt-2 text-center text-caption text-subtle">
            Developer environment values (.env) live under{" "}
            <Link href="/setup" className="text-brand hover:underline">Setup</Link>.
            Everything here is stored in the database and applies without restarts.
          </p>
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import PipelineBoard, { type BoardChat } from "@/components/PipelineBoard";
import Icon from "@/components/ui/Icon";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const sb = await supabaseServer();
  const [user, { data: leads }] = await Promise.all([
    getAuthUser(),
    sb
      .from("leads")
      .select("id, chat_id, stage, check_in_date, check_out_date, pax_count, rooms_count, room_configuration, budget_amount, budget_currency, nights, drop_reason, updated_at")
      .order("updated_at", { ascending: false })
      .limit(300),
  ]);
  if (!user) redirect("/login");

  const chatIds = [...new Set((leads ?? []).map((l) => l.chat_id))];
  const { data: chats } = chatIds.length
    ? await sb.from("chats").select("id, title, chat_jid, chat_type, is_bot_paused").in("id", chatIds)
    : { data: [] };

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-ink">Pipeline</h1>
          <span className="rounded-full bg-chalk px-2.5 py-0.5 text-xs font-semibold text-muted">
            {leads?.length ?? 0} active leads
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-subtle">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-wa" />
            Drag cards to progress stages
          </span>
        </div>
      </header>

      <PipelineBoard leads={(leads ?? []) as Lead[]} chats={(chats ?? []) as BoardChat[]} />
    </div>
  );
}

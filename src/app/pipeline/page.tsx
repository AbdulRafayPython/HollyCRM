import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import PipelineBoard, { type BoardChat } from "@/components/PipelineBoard";
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

  // Titles live on chats, not leads. Two flat queries rather than a nested select
  // so a relationship-name change in the schema can't empty the board.
  const chatIds = [...new Set((leads ?? []).map((l) => l.chat_id))];
  const { data: chats } = chatIds.length
    ? await sb.from("chats").select("id, title, chat_jid, chat_type, is_bot_paused").in("id", chatIds)
    : { data: [] };

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
        <h1 className="text-h1 text-ink">Pipeline</h1>
        <span className="text-meta text-muted">{leads?.length ?? 0} open leads</span>
        <span className="ml-auto text-caption text-subtle">
          Drag a card to move it · All amounts per night · Asia/Riyadh
        </span>
      </header>

      <PipelineBoard leads={(leads ?? []) as Lead[]} chats={(chats ?? []) as BoardChat[]} />
    </div>
  );
}

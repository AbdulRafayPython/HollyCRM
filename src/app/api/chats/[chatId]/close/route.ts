import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Outcome = "won" | "lost" | "archive_only";

/**
 * Close a conversation — the NON-destructive wrap-up:
 *   1. the open lead is moved to closed_won / closed_lost (with reason), or
 *      left as-is for "archive_only";
 *   2. the bot is paused so it cannot re-engage a finished conversation;
 *   3. the chat is archived out of the active inbox.
 *
 * Nothing is deleted: history, quotes, documents and analytics all survive,
 * and if the customer returns next season the whole relationship is still here.
 * Runs on the user's client throughout, so RLS decides who may do this.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { outcome, dropReason } = (await req.json()) as {
    outcome?: Outcome;
    dropReason?: string;
  };

  if (!outcome || !["won", "lost", "archive_only"].includes(outcome)) {
    return NextResponse.json({ error: "outcome must be won | lost | archive_only" }, { status: 400 });
  }
  if (outcome === "lost" && !dropReason?.trim()) {
    return NextResponse.json({ error: "a drop reason is required to close as lost" }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: chat } = await sb
    .from("chats").select("id").eq("id", chatId).maybeSingle();
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (outcome !== "archive_only") {
    const { data: lead } = await sb
      .from("leads")
      .select("id")
      .eq("chat_id", chatId)
      .not("stage", "in", "(closed_won,closed_lost)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead) {
      const { error } = await sb
        .from("leads")
        .update({
          stage: outcome === "won" ? "closed_won" : "closed_lost",
          ...(outcome === "lost" ? { drop_reason: dropReason!.trim() } : {}),
        })
        .eq("id", lead.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const { data: updated, error: chatErr } = await sb
    .from("chats")
    .update({ is_archived: true, is_bot_paused: true, bot_resume_at: null })
    .eq("id", chatId)
    .select("id")
    .maybeSingle();

  if (chatErr) return NextResponse.json({ error: chatErr.message }, { status: 400 });
  if (!updated) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true, outcome });
}

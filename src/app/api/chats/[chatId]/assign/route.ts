import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Claim / release / reassign a chat.
 *
 * The rule (agents may claim unassigned chats and release their own; only
 * supervisors may hand a chat to someone else) lives in the assign_chat() SQL
 * function, so calling PostgREST directly cannot bypass it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { agentId } = (await req.json()) as { agentId: string | null };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.rpc("assign_chat", {
    p_chat_id: chatId,
    p_agent_id: agentId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true, chat: data });
}

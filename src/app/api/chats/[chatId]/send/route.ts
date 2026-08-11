import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GreenQuotaError, sendText } from "@/lib/green/client";

export const runtime = "nodejs";

/** Agent sends a WhatsApp message from the shared inbox. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  // RLS decides whether this agent may see the chat — we do not re-implement
  // the access rule here, we let the policy answer it. The auth check and the
  // chat lookup are independent round trips, so they run in parallel.
  const sb = await supabaseServer();
  const [{ data: { user } }, { data: chat }] = await Promise.all([
    sb.auth.getUser(),
    sb.from("chats").select("id, org_id, chat_jid").eq("id", chatId).maybeSingle(),
  ]);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!chat) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let waId: string | null = null;
  try {
    const res = await sendText(chat.org_id, chat.chat_jid, text);
    waId = res?.idMessage ?? null;
  } catch (err) {
    if (err instanceof GreenQuotaError) {
      // A permanent condition for the month, not a retryable failure — tell the
      // agent exactly what the boundary is instead of dumping gateway JSON.
      return NextResponse.json(
        {
          error:
            `Green API free-tier monthly quota is exhausted. This chat cannot be ` +
            `messaged — only ${err.allowedJids.length} number(s) remain usable this month: ` +
            `${err.allowedJids.map((j) => "+" + j.split("@")[0]).join(", ")}. ` +
            `Upgrade the tariff in the Green API console to lift the limit.`,
          quota_exceeded: true,
          allowed: err.allowedJids,
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: `send failed: ${err}` }, { status: 502 });
  }

  // first_agent_reply_at, last_message_at and unread_count are all maintained
  // by the apply_message_rollups trigger (0004) on this insert.
  const db = supabaseAdmin();
  await db.from("messages").insert({
    org_id: chat.org_id,
    chat_id: chat.id,
    wa_message_id: waId,
    direction: "out",
    sender_type: "agent",
    sender_agent_id: user.id,
    message_type: "text",
    body: text,
    wa_timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, wa_message_id: waId });
}

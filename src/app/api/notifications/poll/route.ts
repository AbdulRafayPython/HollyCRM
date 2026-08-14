import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");

  // Query profile for org_id
  const { data: profile } = await sb
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) {
    return NextResponse.json({ messages: [], serverTime: new Date().toISOString() });
  }

  const serverTime = new Date().toISOString();

  // If no `since` param is supplied, simply return the current checkpoint timestamp
  if (!since) {
    return NextResponse.json({ messages: [], serverTime });
  }

  // Fetch new inbound messages created/timestamped after `since`
  const { data: messages, error } = await sb
    .from("messages")
    .select(`
      id,
      chat_id,
      direction,
      sender_type,
      message_type,
      body,
      media_name,
      wa_timestamp,
      created_at,
      chats!inner (
        id,
        title,
        chat_jid,
        chat_type,
        assigned_agent_id,
        org_id,
        is_archived
      )
    `)
    .eq("direction", "in")
    .eq("chats.org_id", profile.org_id)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message, messages: [], serverTime }, { status: 200 });
  }

  const formatted = (messages ?? []).map((m: any) => ({
    id: m.id,
    chatId: m.chat_id,
    title: m.chats?.title || m.chats?.chat_jid?.split("@")[0] || "WhatsApp Message",
    chatJid: m.chats?.chat_jid,
    chatType: m.chats?.chat_type || "direct",
    assignedToMe: m.chats?.assigned_agent_id === user.id,
    isUnassigned: m.chats?.assigned_agent_id === null,
    body: m.body || (m.message_type === "image" ? "📷 Photo" : m.message_type === "voice" || m.message_type === "audio" ? "🎤 Voice note" : m.message_type === "document" ? `📄 ${m.media_name || "Document"}` : "New message"),
    messageType: m.message_type,
    time: m.wa_timestamp || m.created_at || serverTime,
  }));

  return NextResponse.json({ messages: formatted, serverTime });
}

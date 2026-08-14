import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Per poll. Ordered oldest-first, so hitting the cap parks the checkpoint on
 *  the last row we actually returned instead of skipping the rest. */
const PAGE = 20;

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");

  const { data: profile } = await sb
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();

  /*
   * The checkpoint must come from the database clock, not this process.
   *
   * created_at and assigned_at are written by Postgres. Handing the browser a
   * Node timestamp to compare against them means that whenever Node runs ahead
   * of Postgres, rows written inside the skew are never returned by any poll —
   * the checkpoint has already moved past them. Silent, permanent notification
   * loss. db_now() makes both sides of the comparison the same clock.
   */
  const { data: dbNow } = await sb.rpc("db_now");
  const serverTime = (dbNow as string | null) ?? new Date().toISOString();

  if (!profile?.org_id) {
    return NextResponse.json({ messages: [], assignments: [], serverTime });
  }

  // No checkpoint yet: hand one back and notify nothing. Without this a fresh
  // tab would replay the entire backlog as "new".
  if (!since) {
    return NextResponse.json({ messages: [], assignments: [], serverTime });
  }

  const [messagesRes, assignmentsRes] = await Promise.all([
    sb
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
      // Oldest first. The previous DESC + limit combination returned the ten
      // NEWEST messages of a burst and then advanced the checkpoint past the
      // older ones, losing them permanently.
      .order("created_at", { ascending: true })
      .limit(PAGE),

    /*
     * Conversations that became mine since the checkpoint.
     *
     * assigned_at is stamped by a trigger (migration 0026), so this catches
     * every assignment path — the bot's handoff router, a rules action, and the
     * manual picker — without each one having to remember to announce itself.
     */
    sb
      .from("chats")
      .select("id, title, chat_jid, chat_type, assigned_at, is_archived")
      .eq("org_id", profile.org_id)
      .eq("assigned_agent_id", user.id)
      .gt("assigned_at", since)
      .order("assigned_at", { ascending: true })
      .limit(PAGE),
  ]);

  const messages = messagesRes.data ?? [];
  const assignments = (assignmentsRes.data ?? []).filter((c) => !c.is_archived);

  /*
   * If either query filled its page there is more waiting. Park the checkpoint
   * on the oldest "last row we returned" rather than on now(), so the next poll
   * picks up the remainder instead of stepping over it.
   */
  let nextCheckpoint = serverTime;
  if (messages.length === PAGE) {
    nextCheckpoint = String(messages[messages.length - 1].created_at);
  }
  if (assignments.length === PAGE) {
    const lastAssigned = String(assignments[assignments.length - 1].assigned_at);
    if (lastAssigned < nextCheckpoint) nextCheckpoint = lastAssigned;
  }

  type ChatJoin = {
    title?: string | null;
    chat_jid?: string | null;
    chat_type?: string | null;
    assigned_agent_id?: string | null;
  };

  const formatted = messages.map((m) => {
    const chat = (m as unknown as { chats?: ChatJoin }).chats ?? {};
    return {
      id: m.id,
      chatId: m.chat_id,
      title: chat.title || chat.chat_jid?.split("@")[0] || "WhatsApp Message",
      chatJid: chat.chat_jid,
      chatType: chat.chat_type || "direct",
      assignedToMe: chat.assigned_agent_id === user.id,
      isUnassigned: chat.assigned_agent_id === null,
      body:
        m.body ||
        (m.message_type === "image"
          ? "📷 Photo"
          : m.message_type === "voice" || m.message_type === "audio"
            ? "🎤 Voice note"
            : m.message_type === "document"
              ? `📄 ${m.media_name || "Document"}`
              : "New message"),
      messageType: m.message_type,
      time: m.wa_timestamp || m.created_at || serverTime,
    };
  });

  const formattedAssignments = assignments.map((c) => ({
    // Stable per assignment event, so a re-poll of the same row de-duplicates
    // but a genuine reassignment later does not.
    id: `assign-${c.id}-${c.assigned_at}`,
    chatId: c.id,
    title: c.title || c.chat_jid?.split("@")[0] || "Conversation",
    chatType: c.chat_type || "direct",
    assignedAt: c.assigned_at,
  }));

  return NextResponse.json({
    messages: formatted,
    assignments: formattedAssignments,
    serverTime: nextCheckpoint,
  });
}

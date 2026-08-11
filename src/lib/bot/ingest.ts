import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractMessage, mentionsOwnJid } from "@/lib/green/client";
import { isGroupJid, jidToPhone, type GreenWebhook } from "@/lib/green/types";

export interface IngestResult {
  chatId: string;
  messageId: string | null;
  leadId: string | null;
  body: string;
  isGroup: boolean;
  isBotPaused: boolean;
  mentionsBot: boolean;
  duplicate: boolean;
  mediaUrl: string | null;
  mediaMime: string | null;
}

/**
 * Persists one inbound webhook: contact -> chat -> message, then ensures a lead
 * exists. Runs on the service-role client (bypasses RLS) because there is no
 * authenticated user in a webhook request.
 */
export async function ingestInbound(
  hook: GreenWebhook,
  orgId: string,
  ownJid: string
): Promise<IngestResult | null> {
  const db = supabaseAdmin();
  const chatJid = hook.senderData?.chatId;
  if (!chatJid) return null;

  const isGroup = isGroupJid(chatJid);
  const senderJid = hook.senderData?.sender ?? chatJid;
  const { type, body, mediaUrl, mediaMime, mediaName } = extractMessage(hook.messageData);

  // B7: WhatsApp-side timestamp, not insert time — retried webhooks would
  // otherwise render the conversation out of order.
  const waTimestamp = hook.timestamp
    ? new Date(hook.timestamp * 1000).toISOString()
    : new Date().toISOString();

  // ---- contact ----
  const { data: contact } = await db
    .from("contacts")
    .upsert(
      {
        org_id: orgId,
        wa_jid: senderJid,
        phone_e164: `+${jidToPhone(senderJid)}`,
        display_name: hook.senderData?.senderName ?? hook.senderData?.senderContactName ?? null,
      },
      { onConflict: "org_id,wa_jid" }
    )
    .select("id")
    .single();

  // ---- chat ----
  const { data: existingChat } = await db
    .from("chats")
    .select("id, is_bot_paused")
    .eq("org_id", orgId)
    .eq("chat_jid", chatJid)
    .maybeSingle();

  let chatId = existingChat?.id as string | undefined;
  let isBotPaused = existingChat?.is_bot_paused ?? false;

  if (!chatId) {
    const { data: created, error } = await db
      .from("chats")
      .insert({
        org_id: orgId,
        chat_jid: chatJid,
        chat_type: isGroup ? "group" : "direct",
        title: isGroup
          ? hook.senderData?.chatName ?? "WhatsApp Group"
          : hook.senderData?.senderName ?? jidToPhone(chatJid),
        contact_id: isGroup ? null : contact?.id ?? null,
        last_message_at: waTimestamp,
      })
      .select("id, is_bot_paused")
      .single();
    if (error || !created) return null;
    chatId = created.id;
    isBotPaused = created.is_bot_paused;
  }
  // NOTE: unread_count / last_message_at / first_agent_reply_at are maintained
  // by the apply_message_rollups trigger (0004) — atomically, for every message
  // insert, regardless of which code path wrote it. Do not update them here.

  // Track group membership so the participant list in the UI is real.
  if (isGroup && contact?.id) {
    await db
      .from("chat_participants")
      .upsert({ chat_id: chatId, contact_id: contact.id }, { onConflict: "chat_id,contact_id" });
  }

  // ---- lead (one open lead per chat for the demo) ----
  const { data: openLead } = await db
    .from("leads")
    .select("id")
    .eq("chat_id", chatId)
    .not("stage", "in", "(closed_won,closed_lost)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId = openLead?.id as string | undefined;
  if (!leadId) {
    const { data: newLead } = await db
      .from("leads")
      .insert({
        org_id: orgId,
        chat_id: chatId,
        contact_id: contact?.id ?? null,
        stage: "new_inquiry",
      })
      .select("id")
      .single();
    leadId = newLead?.id;
  }

  // ---- message ----
  // D3: the unique index on (org_id, wa_message_id) is what makes a retried
  // webhook a no-op instead of a duplicate lead and a second bot reply.
  const { data: msg, error: msgErr } = await db
    .from("messages")
    .upsert(
      {
        org_id: orgId,
        chat_id: chatId,
        lead_id: leadId ?? null,
        wa_message_id: hook.idMessage ?? null,
        direction: "in",
        sender_type: "client",
        sender_contact_id: contact?.id ?? null,
        message_type: type,
        body,
        media_path: mediaUrl,
        media_mime: mediaMime,
        media_name: mediaName,
        reply_to_wa_message_id: hook.messageData?.quotedMessage?.stanzaId ?? null,
        wa_timestamp: waTimestamp,
      },
      { onConflict: "org_id,wa_message_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  return {
    chatId: chatId!,
    messageId: msg?.id ?? null,
    leadId: leadId ?? null,
    body,
    isGroup,
    isBotPaused,
    mentionsBot: mentionsOwnJid(hook, ownJid),
    // upsert with ignoreDuplicates returns no row when the message already existed
    duplicate: !msgErr && !msg,
    mediaUrl,
    mediaMime,
  };
}

/**
 * Copies inbound media out of Green API's temporary download URL into our own
 * private bucket, then repoints the message at the stored object.
 *
 * Green API's download links expire, so a passport received today would 404 by
 * the time an agent opens the lead. Runs after the webhook has responded.
 */
export async function mirrorInboundMedia(
  messageId: string,
  orgId: string,
  chatId: string,
  sourceUrl: string,
  mime: string | null
): Promise<void> {
  const db = supabaseAdmin();
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const ext = (mime?.split("/")[1] ?? "bin").split(";")[0];
    const path = `${orgId}/${chatId}/${messageId}.${ext}`;

    const { error } = await db.storage
      .from("wa-media")
      .upload(path, bytes, { contentType: mime ?? "application/octet-stream", upsert: true });
    if (error) throw error;

    await db.from("messages").update({ media_path: path }).eq("id", messageId);

    // The thread UI tells agents to open attachments "from the Files tab" —
    // so inbound media must actually appear there, not only agent uploads.
    // Kind is 'other' because classifying a passport needs vision, which
    // DeepSeek does not have (PRD v2 §4.1); the agent re-tags it.
    const { data: msgRow } = await db
      .from("messages").select("lead_id").eq("id", messageId).single();
    await db.from("documents").insert({
      org_id: orgId,
      lead_id: msgRow?.lead_id ?? null,
      chat_id: chatId,
      kind: "other",
      storage_path: path,
    });
  } catch (err) {
    console.error("[media] mirror failed", err);
    // Leave the original URL in place — a stale link beats losing the reference.
  }
}

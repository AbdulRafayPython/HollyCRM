import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractMessage, mentionsOwnJid } from "@/lib/green/client";
import { isGroupJid, jidToPhone, type GreenWebhook } from "@/lib/green/types";
import { countryCode } from "@/lib/phone";
import { asProvider, type Provider } from "@/lib/wa/send";

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
  /**
   * Which gateway delivered this — and therefore which one the reply must leave
   * through. Read from the chat row rather than trusted from the caller, so a
   * chat that was created under one provider keeps answering on it even if a
   * webhook from the other ever arrives for the same jid.
   */
  provider: Provider;
  /**
   * Who sent this message — not which chat it arrived in.
   *
   * In a group these differ, and until 0018 only the chat was carried forward.
   * Everything downstream therefore treated five people as one anonymous
   * "Customer": their requirements were merged into a single lead, and a reply
   * meant for Onais was addressed to nobody in particular. The bot cannot
   * remember a person it was never told about.
   */
  senderContactId: string | null;
  senderName: string | null;
  senderPhone: string;
}

/**
 * Persists one inbound webhook: contact -> chat -> message, then ensures a lead
 * exists. Runs on the service-role client (bypasses RLS) because there is no
 * authenticated user in a webhook request.
 */
export async function ingestInbound(
  hook: GreenWebhook,
  orgId: string,
  ownJid: string,
  /** The gateway this webhook came from. Stamped onto chats it creates. */
  provider: Provider = "green_api",
  /** wasender_sessions.id, when provider is 'wasender'. */
  wasenderSessionId: string | null = null
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
  // display_name is only written when WhatsApp actually gave us one. Pushing a
  // null through the upsert would erase a name we learned on an earlier message
  // — WhatsApp omits senderName whenever the sender's privacy settings hide it,
  // so a person the CRM knew as "Onais" would intermittently revert to a bare
  // phone number and the bot would start addressing them as one.
  const senderName =
    hook.senderData?.senderName?.trim() ||
    hook.senderData?.senderContactName?.trim() ||
    null;

  const { data: contact } = await db
    .from("contacts")
    .upsert(
      {
        org_id: orgId,
        wa_jid: senderJid,
        phone_e164: `+${jidToPhone(senderJid)}`,
        ...(senderName ? { display_name: senderName } : {}),
        // Resolved once, here, rather than parsed on every routing decision.
        // The assignment engine keys on this, so it has to exist by the time the
        // first message finishes being ingested — a handoff on message one still
        // needs to know which desk the customer belongs to.
        //
        // Never from a group jid. senderJid falls back to chatJid when Green API
        // omits the sender, and a group id like 120363411449511029 prefix-matches
        // dialling code '1' — which would quietly file that contact under the
        // US desk and route their chats there for good.
        country_code: isGroupJid(senderJid) ? null : countryCode(senderJid),
        last_seen_at: waTimestamp,
      },
      { onConflict: "org_id,wa_jid" }
    )
    .select("id, display_name")
    .single();

  // ---- chat ----
  const { data: existingChat } = await db
    .from("chats")
    .select("id, is_bot_paused, provider")
    .eq("org_id", orgId)
    .eq("chat_jid", chatJid)
    .maybeSingle();

  let chatId = existingChat?.id as string | undefined;
  let isBotPaused = existingChat?.is_bot_paused ?? false;
  // An existing chat's own provider wins. Replying through a gateway the
  // conversation did not start on would send the answer from a different phone
  // number, which to the customer reads as a stranger joining the thread.
  let chatProvider = existingChat ? asProvider(existingChat.provider) : provider;

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
        provider,
        wasender_session_id: provider === "wasender" ? wasenderSessionId : null,
      })
      .select("id, is_bot_paused, provider")
      .single();
    if (error || !created) return null;
    chatId = created.id;
    isBotPaused = created.is_bot_paused;
    chatProvider = asProvider(created.provider);
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

  // ---- lead: one open lead per PERSON per chat (0018) ----
  //
  // This used to be "the newest open lead on this chat", which is why two people
  // negotiating in the same group overwrote each other's city, dates and party
  // size all the way to a quote. Scoping the lookup to the sender means Onais
  // and Bilal each accumulate their own requirements in parallel and the
  // pipeline shows two real leads rather than one incoherent merge.
  //
  // A message whose sender we could not resolve still falls back to a
  // chat-level lead — losing the thread entirely is worse than sharing one.
  let leadQuery = db
    .from("leads")
    .select("id")
    .eq("chat_id", chatId)
    .not("stage", "in", "(closed_won,closed_lost)");

  leadQuery = contact?.id
    ? leadQuery.eq("contact_id", contact.id)
    : leadQuery.is("contact_id", null);

  const { data: openLead } = await leadQuery
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

    // leads_one_open_per_contact (0018) makes a concurrent insert fail rather
    // than produce a second lead for the same person — two messages arriving
    // together are processed in parallel after() callbacks. Losing that race
    // means the other callback created the row we wanted; read it back.
    if (!leadId && contact?.id) {
      const { data: raced } = await db
        .from("leads")
        .select("id")
        .eq("chat_id", chatId)
        .eq("contact_id", contact.id)
        .not("stage", "in", "(closed_won,closed_lost)")
        .maybeSingle();
      leadId = raced?.id;
    }
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
    provider: chatProvider,
    senderContactId: contact?.id ?? null,
    senderName: senderName ?? contact?.display_name ?? null,
    senderPhone: jidToPhone(senderJid),
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

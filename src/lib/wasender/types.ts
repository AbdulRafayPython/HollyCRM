/**
 * WasenderAPI webhook payload shapes, and the adapter that turns one into the
 * GreenWebhook shape the ingest pipeline already speaks.
 *
 * WasenderAPI is Baileys underneath, so its events carry raw WhatsApp protocol
 * objects (`key`, `message.conversation`, `contextInfo`) rather than Green API's
 * flattened `messageData`. Normalising here — once, at the edge — means
 * ingestInbound, extractMessage and mentionsOwnJid stay provider-agnostic and
 * neither the bot nor the inbox ever learns there are two gateways.
 */

import type { GreenWebhook, WebhookType } from "@/lib/green/types";

/** The events we subscribe to. WasenderAPI emits ~23; these are the ones we act on. */
export type WasenderEvent =
  | "messages.received"
  | "messages.upsert"
  | "message.sent"
  | "messages.update"
  | "session.status"
  | "qrcode.updated";

export interface WasenderKey {
  id?: string;
  fromMe?: boolean;
  /** `<phone>@s.whatsapp.net` for direct, `<id>@g.us` for a group. */
  remoteJid?: string;
  /** Group messages only: the participant who actually spoke. */
  participant?: string;
  addressingMode?: string;
  senderPn?: string;
  cleanedSenderPn?: string;
  senderLid?: string;
}

/** Baileys message content. Only the variants we render are typed. */
export interface WasenderMessageContent {
  conversation?: string;
  extendedTextMessage?: {
    text?: string;
    contextInfo?: {
      stanzaId?: string;
      mentionedJid?: string[];
    };
  };
  imageMessage?: WasenderMedia;
  videoMessage?: WasenderMedia;
  audioMessage?: WasenderMedia;
  documentMessage?: WasenderMedia;
  stickerMessage?: WasenderMedia;
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
  };
}

/**
 * Media descriptor.
 *
 * `url` on a raw Baileys object is an encrypted WhatsApp CDN reference and is
 * NOT directly downloadable. WasenderAPI is expected to substitute a fetchable
 * link, but which field carries it is not stated in their docs, so mediaUrl()
 * below tries the plausible names in order. Every payload is stored verbatim in
 * webhook_events, so the first real media message tells us the true field name.
 */
export interface WasenderMedia {
  url?: string;
  directPath?: string;
  mediaUrl?: string;
  downloadUrl?: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  fileLength?: number | string;
}

export interface WasenderMessage {
  key?: WasenderKey;
  /** WasenderAPI's own flattened plaintext — present on text messages. */
  messageBody?: string;
  message?: WasenderMessageContent;
  pushName?: string;
  messageTimestamp?: number | string;
  broadcast?: boolean;
}

export interface WasenderWebhook {
  event?: WasenderEvent | string;
  timestamp?: number;
  /** Present on most events; also read from the X-Session-Id header as a fallback. */
  sessionId?: string | number;
  data?: {
    /**
     * Singular in their docs' example, but message.upsert style events send an
     * array. Both are accepted.
     */
    messages?: WasenderMessage | WasenderMessage[];
    status?: string;
    /** messages.update — delivery receipts. */
    update?: { status?: string };
    key?: WasenderKey;
    [k: string]: unknown;
  };
}

/* -------------------------------------------------------------------------- */

/**
 * `<phone>@s.whatsapp.net` -> `<phone>@c.us`.
 *
 * The rest of the app — chats.chat_jid, contacts.wa_jid, isGroupJid, the inbox —
 * was written against Green API's `@c.us` convention. Rewriting the suffix at the
 * edge keeps one canonical jid per person in the database, so the same customer
 * does not appear as two contacts if a workspace ever moves between gateways.
 * toWasenderRecipient() reverses it on the way out.
 */
export function toCanonicalJid(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  // Strip Baileys' device suffix: 12345:6@s.whatsapp.net addresses one linked
  // device, and keeping it would open a new chat row per device the customer owns.
  const [user, domain] = jid.split("@");
  const bare = user?.split(":")[0] ?? "";
  if (!domain) return jid;
  if (domain === "g.us") return `${bare}@g.us`;
  // @lid is WhatsApp's privacy-preserving id — no phone number in it. Passed
  // through unchanged rather than mangled into a fake @c.us.
  if (domain === "lid") return jid;
  return `${bare}@c.us`;
}

/** `<phone>@c.us` -> `+<phone>`; group jids are sent as-is. */
export function toWasenderRecipient(jid: string): string {
  if (jid.endsWith("@g.us")) return jid;
  const phone = jid.split("@")[0]?.split(":")[0] ?? "";
  return phone.startsWith("+") ? phone : `+${phone}`;
}

/** First plausible fetchable URL on a media object. See WasenderMedia. */
function mediaUrl(m: WasenderMedia | undefined): string | null {
  return m?.mediaUrl ?? m?.downloadUrl ?? m?.url ?? null;
}

/** Unwraps `data.messages`, which is an object in the docs and an array in practice. */
export function firstMessage(hook: WasenderWebhook): WasenderMessage | null {
  const m = hook.data?.messages;
  if (!m) return null;
  return Array.isArray(m) ? m[0] ?? null : m;
}

/**
 * Maps a Baileys content object onto Green API's flattened `messageData`.
 *
 * extractMessage() in lib/green/client keys off `typeMessage`, so the strings
 * here must match its cases exactly — "textMessage", "imageMessage",
 * "documentMessage" and so on.
 */
function toMessageData(msg: WasenderMessage): GreenWebhook["messageData"] {
  const c = msg.message ?? {};
  const ctx = c.extendedTextMessage?.contextInfo;
  const quoted = ctx?.stanzaId ? { stanzaId: ctx.stanzaId } : undefined;

  if (c.extendedTextMessage?.text !== undefined) {
    return {
      typeMessage: "extendedTextMessage",
      extendedTextMessageData: {
        text: c.extendedTextMessage.text ?? "",
        mentionedJidList: ctx?.mentionedJid,
      },
      quotedMessage: quoted,
    };
  }

  const file =
    (c.imageMessage && (["imageMessage", c.imageMessage] as const)) ||
    (c.videoMessage && (["videoMessage", c.videoMessage] as const)) ||
    (c.audioMessage && (["audioMessage", c.audioMessage] as const)) ||
    (c.documentMessage && (["documentMessage", c.documentMessage] as const)) ||
    null;

  if (file) {
    const [kind, media] = file;
    return {
      typeMessage: kind,
      fileMessageData: {
        downloadUrl: mediaUrl(media) ?? undefined,
        caption: media.caption ?? "",
        fileName: media.fileName ?? undefined,
        mimeType: media.mimetype ?? undefined,
      },
      quotedMessage: quoted,
    };
  }

  if (c.locationMessage) {
    return {
      typeMessage: "locationMessage",
      locationMessageData: {
        latitude: c.locationMessage.degreesLatitude,
        longitude: c.locationMessage.degreesLongitude,
        nameLocation: c.locationMessage.name,
      },
    };
  }

  // conversation, or anything else that still carried plaintext. messageBody is
  // WasenderAPI's own flattening and is the more reliable of the two.
  return {
    typeMessage: "textMessage",
    textMessageData: { textMessage: msg.messageBody ?? c.conversation ?? "" },
    quotedMessage: quoted,
  };
}

/** WasenderAPI event name -> the Green webhook type the route switches on. */
function toWebhookType(event: string | undefined): WebhookType | null {
  switch (event) {
    case "messages.received":
    case "messages.upsert":
    case "message.upsert":
    case "personal.message.received":
    case "group.message.received":
      return "incomingMessageReceived";
    case "messages.update":
    case "message.status.update":
    case "message-receipt.update":
      return "outgoingMessageStatus";
    case "session.status":
      return "stateInstanceChanged";
    default:
      return null;
  }
}

/**
 * The whole adapter: one WasenderAPI event -> one GreenWebhook.
 *
 * Returns null for events we do not consume (contacts, groups, polls, QR
 * refreshes), which the route logs and acknowledges without further work.
 */
export function toGreenWebhook(
  hook: WasenderWebhook,
  sessionId: string
): GreenWebhook | null {
  const typeWebhook = toWebhookType(hook.event);
  if (!typeWebhook) return null;

  const base: GreenWebhook = {
    typeWebhook,
    instanceData: { idInstance: sessionId },
    timestamp: hook.timestamp,
  };

  if (typeWebhook === "stateInstanceChanged") {
    return { ...base, stateInstance: hook.data?.status ?? "unknown" };
  }

  const msg = firstMessage(hook);

  if (typeWebhook === "outgoingMessageStatus") {
    return {
      ...base,
      idMessage: msg?.key?.id ?? hook.data?.key?.id,
      status: hook.data?.update?.status ?? hook.data?.status,
    };
  }

  if (!msg?.key?.remoteJid) return null;

  // Our own outbound messages come back as an event too. We already wrote those
  // rows when we sent them, so ingesting the echo would duplicate the thread.
  if (msg.key.fromMe) return null;

  const chatId = toCanonicalJid(msg.key.remoteJid)!;
  const isGroup = chatId.endsWith("@g.us");

  // In a group, `participant` is the human who spoke; remoteJid is only the room.
  // Falling back to the room jid for a direct chat is correct — there they are
  // the same thing.
  const sender = toCanonicalJid(msg.key.participant ?? msg.key.senderPn) ?? chatId;

  return {
    ...base,
    idMessage: msg.key.id,
    // Baileys timestamps are seconds, same unit ingestInbound expects (B7).
    timestamp: Number(msg.messageTimestamp) || hook.timestamp,
    senderData: {
      chatId,
      chatName: isGroup ? undefined : msg.pushName,
      sender,
      senderName: msg.pushName,
    },
    messageData: toMessageData(msg),
  };
}

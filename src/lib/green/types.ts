/** Green API webhook payload shapes (the subset HollyCRM consumes). */

export type WebhookType =
  | "incomingMessageReceived"
  | "outgoingMessageReceived"
  | "outgoingAPIMessageReceived"
  | "outgoingMessageStatus"
  | "stateInstanceChanged"
  | "deviceInfo"
  | "incomingCall";

export interface GreenSenderData {
  chatId: string;          // ...@c.us (direct) or ...@g.us (group)
  chatName?: string;
  sender: string;          // the participant who sent it (differs from chatId in groups)
  senderName?: string;
  senderContactName?: string;
}

export interface GreenMessageData {
  typeMessage?: string;
  textMessageData?: { textMessage?: string };
  extendedTextMessageData?: {
    text?: string;
    description?: string;
    title?: string;
    /** Present on some tariffs/versions only — we fall back to text parsing. */
    mentionedJidList?: string[];
  };
  fileMessageData?: {
    downloadUrl?: string;
    caption?: string;
    fileName?: string;
    mimeType?: string;
  };
  locationMessageData?: { latitude?: number; longitude?: number; nameLocation?: string };
  quotedMessage?: { stanzaId?: string };
}

export interface GreenWebhook {
  typeWebhook: WebhookType;
  instanceData?: { idInstance?: number | string; wid?: string; typeInstance?: string };
  timestamp?: number;         // seconds since epoch, WhatsApp-side (B7)
  idMessage?: string;
  senderData?: GreenSenderData;
  messageData?: GreenMessageData;
  stateInstance?: string;     // stateInstanceChanged
  status?: string;            // outgoingMessageStatus
}

export const isGroupJid = (jid: string) => jid.endsWith("@g.us");

/** 9665XXXXXXXX@c.us -> 9665XXXXXXXX */
export const jidToPhone = (jid: string) => jid.split("@")[0]?.split(":")[0] ?? "";

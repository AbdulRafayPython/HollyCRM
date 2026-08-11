import type { GreenMessageData, GreenWebhook } from "./types";

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface GreenCreds {
  base: string;
  id: string;
  token: string;
  ownJid: string | null;
}

/**
 * Credentials come from the ACTIVE row in green_api_instances FOR THAT
 * WORKSPACE — the instance its owner selected in Settings → WhatsApp.
 *
 * The org id is required, not optional. This lookup used to select the first
 * `is_active` instance in the whole database, which meant every workspace sent
 * through whichever WhatsApp number happened to be connected first. The cache
 * is keyed per org for the same reason.
 *
 * .env remains a fallback so a single-workspace developer setup still works
 * before anything is configured in the UI, but only for the workspace that
 * DEMO_ORG_ID names — never for someone else's.
 */
const credsCache = new Map<string, { value: GreenCreds; at: number }>();
const CREDS_TTL_MS = 30_000;

export async function activeCreds(orgId: string): Promise<GreenCreds> {
  if (!orgId) throw new Error("activeCreds requires an organisation id.");

  const cached = credsCache.get(orgId);
  if (cached && Date.now() - cached.at < CREDS_TTL_MS) return cached.value;

  try {
    const { data } = await supabaseAdmin()
      .from("green_api_instances")
      .select("instance_id, api_token, api_url, own_jid")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (data?.instance_id && data?.api_token) {
      const value: GreenCreds = {
        base: (data.api_url || "https://api.green-api.com").replace(/\/+$/, ""),
        id: data.instance_id,
        token: data.api_token,
        ownJid: data.own_jid ?? null,
      };
      credsCache.set(orgId, { value, at: Date.now() });
      return value;
    }
  } catch {
    // fall through to env
  }

  const id = process.env.GREEN_API_ID_INSTANCE;
  const token = process.env.GREEN_API_TOKEN;
  const envOrg = process.env.DEMO_ORG_ID;
  if (!id || !token || (envOrg && envOrg !== orgId)) {
    throw new Error(
      "No WhatsApp connected for this workspace. Connect a number in Settings → WhatsApp."
    );
  }
  const value: GreenCreds = {
    base: (process.env.GREEN_API_BASE_URL || "https://api.green-api.com").replace(/\/+$/, ""),
    id,
    token,
    ownJid: process.env.GREEN_API_OWN_JID ?? null,
  };
  credsCache.set(orgId, { value, at: Date.now() });
  return value;
}

/** Settings pages call this after changing instances so sends switch instantly. */
export function invalidateCredsCache(orgId?: string) {
  if (orgId) credsCache.delete(orgId);
  else credsCache.clear();
}

/**
 * HTTP 466: the free Developer tariff's monthly quota is exhausted. The month is
 * locked to the correspondents already used — every send to a new number or
 * group will fail until the tariff is upgraded. This is a distinct, permanent
 * (for the month) condition and callers treat it differently from a transient
 * network error, so it gets its own type.
 */
export class GreenQuotaError extends Error {
  readonly allowedJids: string[];
  constructor(method: string, allowedJids: string[]) {
    super(
      `Green API monthly quota exceeded (free Developer tariff). ` +
        `This month is locked to: ${allowedJids.join(", ") || "the numbers already messaged"}. ` +
        `Upgrade the tariff at console.green-api.com to send anywhere else. (${method})`
    );
    this.name = "GreenQuotaError";
    this.allowedJids = allowedJids;
  }
}

async function call<T>(orgId: string, method: string, body: unknown): Promise<T> {
  const { base, id, token } = await activeCreds(orgId);
  const res = await fetch(`${base}/waInstance${id}/${method}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // D6: never let a hung gateway call hold a request open indefinitely
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 466) {
      throw new GreenQuotaError(method, text.match(/\d+@[cg]\.us/g) ?? []);
    }
    throw new Error(`Green API ${method} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Outbound sends are serialized per process with a small gap.
 *
 * Bursty traffic from an unofficial gateway is the classic trigger for a
 * WhatsApp number ban (E1/D6). This is a single-process guard only — a real
 * deployment needs a shared rate limiter across instances.
 */
let sendChain: Promise<unknown> = Promise.resolve();
const SEND_GAP_MS = 1200;

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = sendChain.then(async () => {
    const out = await fn();
    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    return out;
  });
  // Keep the chain alive even if one send rejects.
  sendChain = next.catch(() => undefined);
  return next;
}

export function sendText(
  orgId: string,
  chatId: string,
  message: string,
  quotedMessageId?: string
) {
  return serialize(() =>
    call<{ idMessage: string }>(orgId, "sendMessage", {
      chatId,
      message,
      ...(quotedMessageId ? { quotedMessageId } : {}),
    })
  );
}

/**
 * C3: `urlFile` must be reachable by Green API's servers. For customer documents
 * (passports, visas, vouchers) pass a SHORT-LIVED SIGNED URL from a private
 * Supabase Storage bucket — never a public object URL.
 */
export function sendFileByUrl(
  orgId: string,
  chatId: string,
  urlFile: string,
  fileName: string,
  caption?: string
) {
  return serialize(() =>
    call<{ idMessage: string }>(orgId, "sendFileByUrl", { chatId, urlFile, fileName, caption })
  );
}

export async function getStateInstance(orgId: string) {
  const { base, id, token } = await activeCreds(orgId);
  return fetch(`${base}/waInstance${id}/getStateInstance/${token}`, {
    signal: AbortSignal.timeout(10_000),
  }).then((r) => r.json() as Promise<{ stateInstance: string }>);
}

/**
 * Probe arbitrary credentials (used by Settings → WhatsApp before saving) and,
 * when valid, push our webhook configuration to Green API so the user never
 * copies URLs into the console by hand — the Kommo moment.
 */
export async function probeAndConfigure(input: {
  base: string;
  id: string;
  token: string;
  webhookUrl: string;
  webhookToken: string;
}): Promise<{ state: string; phone: string | null }> {
  const base = input.base.replace(/\/+$/, "");
  const url = (m: string) => `${base}/waInstance${input.id}/${m}/${input.token}`;

  const stateRes = await fetch(url("getStateInstance"), { signal: AbortSignal.timeout(15_000) });
  if (!stateRes.ok) {
    throw new Error(
      stateRes.status === 401 || stateRes.status === 403
        ? "Green API rejected the token — check idInstance and apiTokenInstance."
        : `Green API answered ${stateRes.status} — check the apiUrl.`
    );
  }
  const { stateInstance } = (await stateRes.json()) as { stateInstance: string };

  const setRes = await fetch(url("setSettings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: input.webhookUrl,
      webhookUrlToken: input.webhookToken,
      incomingWebhook: "yes",          // customer messages
      stateWebhook: "yes",             // D5: authorized/blocked/sleepMode alerting
      outgoingWebhook: "yes",          // B14: delivery receipts (sent/delivered/read)
      // Echoes of our own sends: we already write those rows ourselves, and
      // ingesting them again would duplicate the thread.
      outgoingMessageWebhook: "no",
      outgoingAPIMessageWebhook: "no",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!setRes.ok) {
    throw new Error(`Credentials are valid but webhook setup failed (${setRes.status}).`);
  }

  // Own number — best effort; only exists once a phone is linked.
  let phone: string | null = null;
  try {
    const wa = await fetch(url("getWaSettings"), { signal: AbortSignal.timeout(10_000) });
    if (wa.ok) {
      const j = (await wa.json()) as { phone?: string };
      phone = j?.phone ?? null;
    }
  } catch { /* not linked yet — fine */ }

  return { state: stateInstance, phone };
}

export function getGroupData(orgId: string, groupId: string) {
  return call<{
    groupName?: string;
    participants?: { id: string; isAdmin?: boolean }[];
  }>(orgId, "getGroupData", { groupId });
}

// Note: Green API exposes no "typing indicator" endpoint on standard tariffs,
// so there is nothing to send while the model composes. Perceived latency is
// managed by keeping the reply path to deepseek-chat only (see PRD v2 §4.1).

/** Normalizes the many message shapes into { type, body, mediaUrl }. */
export function extractMessage(md: GreenMessageData | undefined): {
  type: string;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
} {
  const t = md?.typeMessage ?? "";
  const none = { mediaUrl: null, mediaMime: null, mediaName: null };
  if (t === "textMessage") {
    return { type: "text", body: md?.textMessageData?.textMessage ?? "", ...none };
  }
  if (t === "extendedTextMessage" || t === "quotedMessage") {
    return { type: "text", body: md?.extendedTextMessageData?.text ?? "", ...none };
  }
  if (t === "imageMessage" || t === "videoMessage" || t === "documentMessage" || t === "audioMessage") {
    const kind =
      t === "imageMessage" ? "image"
      : t === "videoMessage" ? "video"
      : t === "audioMessage" ? "audio"
      : "document";
    return {
      type: kind,
      body: md?.fileMessageData?.caption ?? "",
      mediaUrl: md?.fileMessageData?.downloadUrl ?? null,
      mediaMime: md?.fileMessageData?.mimeType ?? null,
      // The customer's own filename. The mirrored object is named after the
      // message id, so this is the only chance to keep "passport-ahmed.pdf".
      mediaName: md?.fileMessageData?.fileName ?? null,
    };
  }
  if (t === "locationMessage") {
    const l = md?.locationMessageData;
    return {
      type: "location",
      body: l?.nameLocation ?? `${l?.latitude ?? ""},${l?.longitude ?? ""}`,
      ...none,
    };
  }
  return { type: "unsupported", body: "", ...none };
}

/**
 * E2: PRD v1.1 triggered on a literal "@bot" token, which does not exist in the
 * payload — WhatsApp mentions are phone-number JIDs. We check the structured
 * list where the tariff provides it, and otherwise look for "@<number>" in the
 * body, which is how a mention is rendered in the text.
 */
export function mentionsOwnJid(hook: GreenWebhook, ownJid: string): boolean {
  if (!ownJid) return false;
  const phone = ownJid.split("@")[0];
  const list = hook.messageData?.extendedTextMessageData?.mentionedJidList;
  if (Array.isArray(list) && list.some((j) => j.startsWith(phone))) return true;
  const text = hook.messageData?.extendedTextMessageData?.text ?? "";
  return text.includes(`@${phone}`);
}

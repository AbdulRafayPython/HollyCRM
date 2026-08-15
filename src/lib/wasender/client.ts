import { supabaseAdmin } from "@/lib/supabase/admin";
import { toWasenderRecipient } from "./types";

/**
 * WasenderAPI outbound client.
 *
 * Deliberately exposes the same surface as lib/green/client — sendText,
 * sendFileByUrl, both resolving credentials per workspace and both returning
 * `{ idMessage }` — so lib/wa/send.ts can dispatch between the two gateways
 * without either caller or callee knowing which one it got.
 */

const API_BASE = (process.env.WASENDER_BASE_URL || "https://www.wasenderapi.com").replace(/\/+$/, "");

export interface WasenderCreds {
  sessionId: string;
  apiKey: string;
  ownJid: string | null;
}

/**
 * Credentials come from the ACTIVE row in wasender_sessions for that workspace.
 * Org-scoped for the same reason Green API's lookup is (see lib/green/client):
 * a global "first active session" query would send every workspace's replies
 * through whichever number happened to be connected first.
 */
const credsCache = new Map<string, { value: WasenderCreds; at: number }>();
const CREDS_TTL_MS = 30_000;

export async function activeSession(orgId: string): Promise<WasenderCreds> {
  if (!orgId) throw new Error("activeSession requires an organisation id.");

  const cached = credsCache.get(orgId);
  if (cached && Date.now() - cached.at < CREDS_TTL_MS) return cached.value;

  const { data } = await supabaseAdmin()
    .from("wasender_sessions")
    .select("session_id, api_key, own_jid")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data?.session_id || !data?.api_key) {
    throw new Error(
      "No WasenderAPI session connected for this workspace. Connect one in Settings → WhatsApp."
    );
  }

  const value: WasenderCreds = {
    sessionId: data.session_id,
    apiKey: data.api_key,
    ownJid: data.own_jid ?? null,
  };
  credsCache.set(orgId, { value, at: Date.now() });
  return value;
}

/** Settings pages call this after changing sessions so sends switch instantly. */
export function invalidateSessionCache(orgId?: string) {
  if (orgId) credsCache.delete(orgId);
  else credsCache.clear();
}

/**
 * HTTP 429: WasenderAPI throttles per plan. Distinct from a transient network
 * failure — the caller should back off rather than retry immediately — so it
 * gets its own type, mirroring GreenQuotaError's role on the other gateway.
 */
export class WasenderRateLimitError extends Error {
  constructor(detail: string) {
    super(`WasenderAPI rate limit reached. ${detail}`.trim());
    this.name = "WasenderRateLimitError";
  }
}

interface SendResponse {
  success?: boolean;
  message?: string;
  data?: { msgId?: number | string; jid?: string; status?: string };
}

async function post(apiKey: string, body: Record<string, unknown>): Promise<SendResponse> {
  const res = await fetch(`${API_BASE}/api/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // D6: never let a hung gateway call hold a request open indefinitely.
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new WasenderRateLimitError(text.slice(0, 300));
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `WasenderAPI rejected the API key (${res.status}). Reconnect the session in Settings → WhatsApp.`
      );
    }
    throw new Error(`WasenderAPI send failed: ${res.status} ${text.slice(0, 300)}`);
  }

  let json: SendResponse;
  try {
    json = JSON.parse(text) as SendResponse;
  } catch {
    throw new Error(`WasenderAPI returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (json.success === false) {
    throw new Error(`WasenderAPI send rejected: ${json.message ?? "unknown error"}`);
  }
  return json;
}

/**
 * Outbound sends are serialized per process with a small gap — same reasoning as
 * the Green API client: bursty traffic through an unofficial gateway is the
 * classic trigger for a WhatsApp number ban (E1/D6). Single-process only; a real
 * deployment needs a shared limiter.
 *
 * The chain is separate from Green API's on purpose. They are different numbers
 * with different rate limits, and sharing a queue would make one gateway's
 * backlog delay the other's replies.
 */
let sendChain: Promise<unknown> = Promise.resolve();
const SEND_GAP_MS = 1200;

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = sendChain.then(async () => {
    const out = await fn();
    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    return out;
  });
  sendChain = next.catch(() => undefined);
  return next;
}

/**
 * NOTE on the returned id: WasenderAPI answers with `data.msgId`, its own
 * internal handle, while the delivery-receipt webhook reports the WhatsApp
 * `key.id`. They are not the same value, so a status update cannot be matched
 * back to this row by id alone — outbound WasenderAPI messages will sit at their
 * initial status until we learn the mapping from a real receipt payload (every
 * one is stored verbatim in webhook_events). Inbound and sending are unaffected.
 */
export function sendText(orgId: string, chatJid: string, message: string) {
  return serialize(async () => {
    const { apiKey } = await activeSession(orgId);
    const json = await post(apiKey, {
      to: toWasenderRecipient(chatJid),
      text: message,
    });
    return { idMessage: json.data?.msgId != null ? String(json.data.msgId) : null };
  });
}

/**
 * C3: `url` must be reachable by WasenderAPI's servers. For customer documents
 * (passports, visas, vouchers) pass a SHORT-LIVED SIGNED URL from a private
 * Supabase Storage bucket — never a public object URL.
 */
export function sendFileByUrl(
  orgId: string,
  chatJid: string,
  url: string,
  fileName: string,
  caption?: string
) {
  return serialize(async () => {
    const { apiKey } = await activeSession(orgId);
    const json = await post(apiKey, {
      to: toWasenderRecipient(chatJid),
      ...mediaField(fileName, url),
      fileName,
      ...(caption ? { text: caption } : {}),
    });
    return { idMessage: json.data?.msgId != null ? String(json.data.msgId) : null };
  });
}

/**
 * WasenderAPI has no single "file" parameter — the field name selects how
 * WhatsApp renders the attachment. Sending a voice note as `documentUrl` shows a
 * paperclip instead of a playable bubble, so the extension has to pick.
 */
function mediaField(fileName: string, url: string): Record<string, string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return { imageUrl: url };
  if (["mp4", "mov", "3gp", "mkv"].includes(ext)) return { videoUrl: url };
  if (["ogg", "opus", "mp3", "m4a", "wav", "aac"].includes(ext)) return { audioUrl: url };
  return { documentUrl: url };
}

/**
 * Probe a key before saving it (used by Settings → WhatsApp).
 *
 * WasenderAPI's webhook URL and secret are configured in THEIR dashboard, on the
 * session — there is no API to push them from here, which is the one place this
 * differs from the Green API flow. So this validates the key and reports the
 * session's connection state; the UI tells the user what to paste where.
 */
export async function probeSession(apiKey: string): Promise<{
  status: string;
  phone: string | null;
  sessionId: string | null;
  name: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/status`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "WasenderAPI rejected that API key — copy it again from the session page."
        : `WasenderAPI answered ${res.status}. Check the key and try again.`
    );
  }

  /*
   * GET /api/status documents a bare `{ "status": "connected" }`, but the rest
   * of the API wraps payloads in `data`. Both are read so a wrapper appearing
   * (or disappearing) does not silently turn every session's state into
   * "unknown" and light up the disconnected banner across the app.
   *
   * Session id, name and phone are not part of this response. They are read
   * from the sessions list when an account token is available, and otherwise
   * supplied by the user in the connect form.
   */
  const json = (await res.json()) as {
    status?: string;
    data?: {
      id?: number | string;
      status?: string;
      name?: string;
      phone_number?: string;
      phoneNumber?: string;
    };
  };

  const d = json.data ?? {};
  const phone = (d.phone_number ?? d.phoneNumber ?? "").replace(/[^\d]/g, "") || null;

  return {
    status: d.status ?? json.status ?? "unknown",
    phone,
    sessionId: d.id != null ? String(d.id) : null,
    name: d.name ?? null,
  };
}

/** WasenderAPI reports "connected"; everything else means it cannot send yet. */
export const isLive = (status: string) => status === "connected";

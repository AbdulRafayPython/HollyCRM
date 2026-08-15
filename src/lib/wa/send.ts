/**
 * One outbound door for both WhatsApp gateways.
 *
 * A reply has to leave from the number the customer messaged, so the gateway is
 * chosen per chat, not per workspace — a team can run Green API and WasenderAPI
 * side by side (and will, while migrating between them). Every caller already
 * reads the chat row, so the provider travels as an argument rather than costing
 * an extra lookup here.
 *
 * Both clients return `{ idMessage }`, so callers stay identical either way.
 */

import * as green from "@/lib/green/client";
import * as wasender from "@/lib/wasender/client";

export type Provider = "green_api" | "wasender";

/**
 * Anything read out of chats.provider. The column is constrained and defaulted,
 * but a row read before migration 0028 lands — or through a stale PostgREST
 * schema cache — can still surface null, and defaulting to Green API keeps every
 * pre-existing chat working exactly as it did.
 */
export function asProvider(value: string | null | undefined): Provider {
  return value === "wasender" ? "wasender" : "green_api";
}

export function sendText(
  provider: Provider,
  orgId: string,
  chatJid: string,
  text: string,
  quotedMessageId?: string
): Promise<{ idMessage: string | null }> {
  return provider === "wasender"
    ? wasender.sendText(orgId, chatJid, text)
    : // Green API's client types idMessage as string; widening keeps one
      // return type across both branches.
      green.sendText(orgId, chatJid, text, quotedMessageId);
}

export function sendFileByUrl(
  provider: Provider,
  orgId: string,
  chatJid: string,
  url: string,
  fileName: string,
  caption?: string
): Promise<{ idMessage: string | null }> {
  return provider === "wasender"
    ? wasender.sendFileByUrl(orgId, chatJid, url, fileName, caption)
    : green.sendFileByUrl(orgId, chatJid, url, fileName, caption);
}

/**
 * Turns a gateway failure into something an agent can act on.
 *
 * Both providers have one failure mode that is not a bug and not retryable —
 * Green API's monthly tariff quota, WasenderAPI's rate limit — and an agent
 * staring at a message that will not send needs to be told which it is rather
 * than shown raw gateway JSON. Returns null for ordinary failures so callers can
 * fall through to their generic 502.
 */
export function explainSendError(
  err: unknown
): { message: string; status: number; quota_exceeded?: boolean; allowed?: string[] } | null {
  if (err instanceof green.GreenQuotaError) {
    return {
      status: 402,
      quota_exceeded: true,
      allowed: err.allowedJids,
      message:
        `Green API free-tier monthly quota is exhausted. This chat cannot be ` +
        `messaged — only ${err.allowedJids.length} number(s) remain usable this month: ` +
        `${err.allowedJids.map((j) => "+" + j.split("@")[0]).join(", ")}. ` +
        `Upgrade the tariff in the Green API console to lift the limit.`,
    };
  }
  if (err instanceof wasender.WasenderRateLimitError) {
    return {
      status: 429,
      message:
        `WasenderAPI is rate limiting this session. Wait a moment and send again, ` +
        `or raise the plan limit in the WasenderAPI dashboard.`,
    };
  }
  return null;
}

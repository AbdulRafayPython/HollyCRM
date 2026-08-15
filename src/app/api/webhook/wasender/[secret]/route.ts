import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestInbound, mirrorInboundMedia } from "@/lib/bot/ingest";
import { runBot, shouldReply } from "@/lib/bot/orchestrator";
import { toGreenWebhook, type WasenderWebhook } from "@/lib/wasender/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WasenderAPI inbound webhook.
 *
 * Same contract as the Green API route (PRD v2 §5, Module 1): verify -> dedupe
 * -> persist -> 200 fast, with the bot running in `after()` off the response
 * path. Gateways retry anything that does not get a prompt 200, and a retry that
 * reaches the pipeline is a duplicate lead and a second bot reply.
 *
 * The payload is normalised into the Green API shape by toGreenWebhook() before
 * anything downstream sees it, so ingestInbound and the orchestrator remain
 * provider-agnostic.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  // ---- C6: reject anything unverified BEFORE parsing the body ----
  //
  // Two independent checks. The path segment is ours (env), proving the caller
  // knows a URL we never published. The X-Webhook-Signature is WasenderAPI's,
  // generated per session in their dashboard. Either one alone would do; both
  // means a leaked server log containing the URL is not by itself enough.
  const { secret } = await params;
  const expected = process.env.WASENDER_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const signature = req.headers.get("x-webhook-signature")?.trim();
  if (!signature) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  /*
   * The signature is both halves of the door: it authenticates the request AND
   * names the workspace, in one indexed read. wasender_sessions.webhook_secret
   * is unique (0028), so a hit is unambiguous.
   *
   * This is why the route does not trust `sessionId` from the body — a value in
   * the payload proves nothing about who sent it.
   */
  const { data: session } = await db
    .from("wasender_sessions")
    .select("id, org_id, own_jid, session_id")
    .eq("webhook_secret", signature)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: WasenderWebhook;
  try {
    raw = (await req.json()) as WasenderWebhook;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const orgId = session.org_id as string;
  // Keyed on our own row id, not WasenderAPI's session id, because ours always
  // exists. Prefixed so it can never collide with a numeric Green API instance
  // id in the shared webhook_events dedup index.
  const instanceKey = `wasender:${session.id}`;

  const hook = toGreenWebhook(raw, instanceKey);

  // ---- D3+D4: raw payload retained AND deduped at the front door ----
  // The unique index on (instance_id, wa_message_id) makes a retry's insert fail
  // with 23505 — and that is the signal to stop HERE, before it can bump unread
  // counts, re-run triggers, or reach the bot. Idempotency belongs at the edge.
  //
  // The RAW payload is stored, not the normalised one: when a media message or a
  // receipt does not map the way we expect, this row is the only record of what
  // WasenderAPI actually sent.
  const { error: dupErr } = await db.from("webhook_events").insert({
    instance_id: instanceKey,
    wa_message_id: hook?.idMessage ?? null,
    event_type: raw.event ?? "unknown",
    payload: raw as unknown as Record<string, unknown>,
  });
  if (dupErr?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Events we do not consume — contacts, groups, polls, QR refreshes, and our
  // own outbound echoes. Stored above for inspection, acknowledged here.
  if (!hook) {
    return NextResponse.json({ ok: true, ignored: raw.event ?? "unmapped" });
  }

  // ---- D5: session state is the most common cause of a silent outage ----
  if (hook.typeWebhook === "stateInstanceChanged") {
    await db
      .from("wasender_sessions")
      .update({
        status: hook.stateInstance ?? "unknown",
        status_changed_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    return NextResponse.json({ ok: true });
  }

  // ---- B14: delivery receipts for outbound messages ----
  if (hook.typeWebhook === "outgoingMessageStatus") {
    if (hook.idMessage && hook.status) {
      const map: Record<string, string> = {
        sent: "sent", server_ack: "sent", delivery_ack: "delivered",
        delivered: "delivered", read: "read", played: "read",
        failed: "failed", error: "failed",
      };
      await db
        .from("messages")
        .update({ delivery_status: map[hook.status] ?? "sent" })
        .eq("wa_message_id", hook.idMessage);
    }
    return NextResponse.json({ ok: true });
  }

  if (hook.typeWebhook !== "incomingMessageReceived") {
    return NextResponse.json({ ok: true, ignored: hook.typeWebhook });
  }

  const ingested = await ingestInbound(
    hook,
    orgId,
    session.own_jid ?? "",
    "wasender",
    session.id as string
  );
  if (!ingested) return NextResponse.json({ ok: true, ignored: "unparseable" });

  const chatJid = hook.senderData!.chatId;

  // ---- respond now; think later ----
  after(async () => {
    try {
      // Pull media into our own private bucket before the gateway's link expires.
      if (ingested.messageId && ingested.mediaUrl) {
        await mirrorInboundMedia(
          ingested.messageId, orgId, ingested.chatId,
          ingested.mediaUrl, ingested.mediaMime
        );
      }

      const gate = await shouldReply(ingested, orgId);
      if (!gate.reply) {
        console.log(`[bot] skipped chat=${ingested.chatId} reason=${gate.reason}`);
        return;
      }
      const result = await runBot(ingested, orgId, chatJid);
      console.log(`[bot] chat=${ingested.chatId}`, result);
    } catch (err) {
      console.error("[bot] failed", err);
      await supabaseAdmin().from("ai_runs").insert({
        org_id: orgId, chat_id: ingested.chatId, model: "orchestrator",
        purpose: "bot_loop", succeeded: false, error: String(err),
      });
    } finally {
      // Scoped by instance too: a WhatsApp message id is only unique within the
      // gateway that issued it, and marking the wrong provider's row done would
      // hide a genuinely stuck event.
      await supabaseAdmin()
        .from("webhook_events")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("instance_id", instanceKey)
        .eq("wa_message_id", hook.idMessage ?? "");
    }
  });

  return NextResponse.json({ ok: true });
}

/** WasenderAPI pings the URL when the webhook is saved. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "holycrm-wasender-webhook" });
}

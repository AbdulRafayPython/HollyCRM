import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestInbound, mirrorInboundMedia } from "@/lib/bot/ingest";
import { runBot, shouldReply } from "@/lib/bot/orchestrator";
import type { GreenWebhook } from "@/lib/green/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Green API inbound webhook.
 *
 * Contract (PRD v2 §5, Module 1): verify -> dedupe -> persist -> 200 in <100ms.
 * Green API retries when it does not get a fast 200, so anything slow here turns
 * into duplicate deliveries. The bot runs in `after()`, off the response path.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  // ---- C6: reject anything unverified BEFORE parsing the body ----
  const { secret } = await params;
  if (secret !== process.env.GREEN_API_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let hook: GreenWebhook;
  try {
    hook = (await req.json()) as GreenWebhook;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // C6: Bearer must match either the env token or the token stored for THIS
  // instance in Settings → WhatsApp. Instances added through the UI get their
  // own webhook token, so a UI-connected number authenticates without any
  // .env edit.
  let instanceOwnJid = process.env.GREEN_API_OWN_JID ?? "";
  let instanceOrgId: string | null = null;
  {
    const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const envToken = process.env.GREEN_API_WEBHOOK_TOKEN;
    const { data: inst } = await supabaseAdmin()
      .from("green_api_instances")
      .select("org_id, webhook_token, own_jid")
      .eq("instance_id", String(hook.instanceData?.idInstance ?? ""))
      .maybeSingle();
    if (inst?.own_jid) instanceOwnJid = inst.own_jid;
    if (inst?.org_id) instanceOrgId = inst.org_id;

    const ok =
      Boolean(envToken && auth === envToken) ||
      Boolean(inst?.webhook_token && auth === inst.webhook_token);
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  // Which workspace does this message belong to? The instance that delivered it
  // decides — every workspace connects its own Green API number, so the
  // instance id IS the tenant key. This used to read DEMO_ORG_ID from .env, so
  // every message in the system landed in one organisation no matter whose
  // number received it. The env value survives only as a fallback for a number
  // configured in .env before any instance row existed.
  const orgId = instanceOrgId ?? process.env.DEMO_ORG_ID ?? null;
  if (!orgId) {
    // 200, not 500: Green API retries non-2xx, and retrying will not conjure an
    // instance row. The event is already stored for inspection.
    console.error("[webhook] no workspace owns instance", hook.instanceData?.idInstance);
    return NextResponse.json({ ok: true, ignored: "unknown instance" });
  }

  // ---- D3+D4: raw payload retained AND deduped at the front door ----
  // Green API retries any webhook that doesn't get a fast 200. The unique index
  // on (instance_id, wa_message_id) makes the retry's insert fail with 23505 —
  // and that is our signal to stop HERE, before the retry can bump unread
  // counts, re-run triggers, or reach the bot. Idempotency belongs at the edge,
  // not halfway down the pipeline.
  const { error: dupErr } = await db.from("webhook_events").insert({
    instance_id: String(hook.instanceData?.idInstance ?? ""),
    wa_message_id: hook.idMessage ?? null,
    event_type: hook.typeWebhook,
    payload: hook as unknown as Record<string, unknown>,
  });
  if (dupErr?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // ---- D5: instance state is the most common cause of a silent outage ----
  if (hook.typeWebhook === "stateInstanceChanged") {
    await db
      .from("green_api_instances")
      .update({ state: hook.stateInstance ?? "unknown", state_changed_at: new Date().toISOString() })
      .eq("instance_id", String(hook.instanceData?.idInstance ?? ""));
    return NextResponse.json({ ok: true });
  }

  // ---- B14: delivery receipts for outbound messages ----
  if (hook.typeWebhook === "outgoingMessageStatus") {
    if (hook.idMessage && hook.status) {
      const map: Record<string, string> = {
        sent: "sent", delivered: "delivered", read: "read",
        failed: "failed", noAccount: "failed", notInGroup: "failed",
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

  const ingested = await ingestInbound(hook, orgId, instanceOwnJid);
  if (!ingested) return NextResponse.json({ ok: true, ignored: "unparseable" });

  const chatJid = hook.senderData!.chatId;

  // ---- respond now; think later ----
  after(async () => {
    try {
      // Pull media into our own private bucket before Green API's link expires.
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
      await supabaseAdmin()
        .from("webhook_events")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("wa_message_id", hook.idMessage ?? "");
    }
  });

  return NextResponse.json({ ok: true });
}

/** Green API pings the URL on save. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "hollycrm-green-webhook" });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateSessionCache, probeSession } from "@/lib/wasender/client";
import { isOwner } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Settings → WhatsApp, WasenderAPI half.
 *
 * Same posture as the Green API route next door: writes run on the user's
 * client so the wasender_admin RLS policy (supervisors only) is the real gate,
 * and api_key / webhook_secret never travel back to the browser.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("wasender_sessions")
    .select("id, session_id, session_name, phone, own_jid, status, status_changed_at, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    apiKey?: string;
    webhookSecret?: string;
    sessionName?: string;
    phone?: string;
  };

  const apiKey = body.apiKey?.trim();
  const webhookSecret = body.webhookSecret?.trim();
  const sessionName = body.sessionName?.trim() || null;
  // Stored digits-only so own_jid matches the format WhatsApp puts in a mention.
  const phone = body.phone?.replace(/[^\d]/g, "") || null;

  if (!apiKey) {
    return NextResponse.json({ error: "The session API key is required." }, { status: 400 });
  }
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "The webhook secret is required — it is how inbound messages are authenticated." },
      { status: 400 }
    );
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me || !isOwner(me.role)) {
    return NextResponse.json(
      { error: "Only the workspace owner can connect WhatsApp." },
      { status: 403 }
    );
  }

  /*
   * One gateway per workspace (0029). The trigger is the real guarantee; this
   * check exists so the user gets a sentence they can act on instead of a
   * Postgres exception surfacing as "duplicate key".
   */
  const { count: greenCount } = await sb
    .from("green_api_instances")
    .select("id", { count: "exact", head: true });
  if ((greenCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This workspace is already connected to Green API. Disconnect it first — " +
          "running two WhatsApp gateways at once makes replies unpredictable and raises the risk of the number being restricted.",
        blocked_by: "green_api",
      },
      { status: 409 }
    );
  }

  const pathSecret = process.env.WASENDER_WEBHOOK_SECRET;
  if (!pathSecret) {
    return NextResponse.json(
      { error: "WASENDER_WEBHOOK_SECRET is not set on the server." },
      { status: 500 }
    );
  }

  // 1. Validate the key against WasenderAPI before storing anything.
  let probe: Awaited<ReturnType<typeof probeSession>>;
  try {
    probe = await probeSession(apiKey);
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 422 }
    );
  }

  // 2. Save. First session for the org becomes the active sender automatically.
  const { count } = await sb
    .from("wasender_sessions")
    .select("id", { count: "exact", head: true });

  const resolvedPhone = phone ?? probe.phone;

  const { data: saved, error } = await sb
    .from("wasender_sessions")
    .upsert(
      {
        org_id: me.org_id,
        // Reconnecting the same session must update the existing row rather
        // than trip the unique index on webhook_secret.
        webhook_secret: webhookSecret,
        api_key: apiKey,
        session_id: probe.sessionId,
        session_name: sessionName ?? probe.name,
        status: probe.status,
        status_changed_at: new Date().toISOString(),
        phone: resolvedPhone,
        // E2: what @mention detection compares against.
        own_jid: resolvedPhone ? `${resolvedPhone}@c.us` : null,
        is_active: (count ?? 0) === 0,
      },
      { onConflict: "webhook_secret" }
    )
    .select("id, session_id, session_name, status, phone, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  invalidateSessionCache();

  return NextResponse.json({
    ok: true,
    session: saved,
    linked: probe.status === "connected",
    /*
     * Unlike Green API, WasenderAPI has no endpoint for pushing webhook settings
     * from here — the URL is configured on their session page. So the flow ends
     * by handing the user the exact URL to paste, rather than claiming it is
     * already wired up.
     */
    webhookUrl: `${new URL(req.url).origin}/api/webhook/wasender/${pathSecret}`,
    hint:
      probe.status === "connected"
        ? "Connected. Paste the webhook URL below into the session's settings in WasenderAPI and enable Message Received."
        : `Key accepted, but the session is "${probe.status}" — scan the QR in the WasenderAPI dashboard to link the phone.`,
  });
}

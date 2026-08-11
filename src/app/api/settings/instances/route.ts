import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateCredsCache, probeAndConfigure } from "@/lib/green/client";
import { isSupervisor } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Settings → WhatsApp. All writes run on the user's client: the
 * instances_admin RLS policy (supervisors only) is the actual gate.
 * The api_token never travels back to the browser — list responses are
 * masked server-side.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("green_api_instances")
    .select("id, instance_id, api_url, phone, own_jid, state, state_changed_at, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ instances: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    apiUrl?: string;
    idInstance?: string;
    apiToken?: string;
    webhookBaseUrl?: string; // the public https URL Green API should call
  };

  const apiUrl = body.apiUrl?.trim();
  const idInstance = body.idInstance?.trim();
  const apiToken = body.apiToken?.trim();
  const webhookBase = body.webhookBaseUrl?.trim()?.replace(/\/+$/, "");

  if (!apiUrl || !idInstance || !apiToken) {
    return NextResponse.json(
      { error: "apiUrl, idInstance and apiToken are all required." },
      { status: 400 }
    );
  }
  if (!webhookBase || !/^https:\/\//.test(webhookBase)) {
    return NextResponse.json(
      { error: "The webhook base URL must be a public https:// address (your tunnel or deployment)." },
      { status: 400 }
    );
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me || !isSupervisor(me.role)) {
    return NextResponse.json(
      { error: "Only the workspace owner can connect WhatsApp." },
      { status: 403 }
    );
  }

  const secret = process.env.GREEN_API_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "GREEN_API_WEBHOOK_SECRET is not set on the server." },
      { status: 500 }
    );
  }

  // Per-instance webhook token: the webhook route accepts it from the DB, so
  // connecting a number here requires no .env change at all.
  const webhookToken = randomBytes(24).toString("hex");

  // 1. Validate against Green API and push our webhook settings to it.
  let probe: { state: string; phone: string | null };
  try {
    probe = await probeAndConfigure({
      base: apiUrl,
      id: idInstance,
      token: apiToken,
      webhookUrl: `${webhookBase}/api/webhook/green/${secret}`,
      webhookToken,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 422 });
  }

  // 2. Save. First instance for the org becomes active automatically.
  const { count } = await sb
    .from("green_api_instances")
    .select("id", { count: "exact", head: true });

  const { data: saved, error } = await sb
    .from("green_api_instances")
    .upsert(
      {
        org_id: me.org_id,
        instance_id: idInstance,
        api_url: apiUrl.replace(/\/+$/, ""),
        api_token: apiToken,
        webhook_token: webhookToken,
        state: probe.state as never,
        state_changed_at: new Date().toISOString(),
        phone: probe.phone,
        own_jid: probe.phone ? `${probe.phone}@c.us` : null,
        is_active: (count ?? 0) === 0,
      },
      { onConflict: "instance_id" }
    )
    .select("id, instance_id, state, phone, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  invalidateCredsCache();
  return NextResponse.json({
    ok: true,
    instance: saved,
    linked: probe.state === "authorized",
    hint:
      probe.state === "authorized"
        ? "Connected and receiving."
        : "Credentials saved and webhook configured — now scan the QR in the Green API console to link the phone.",
  });
}

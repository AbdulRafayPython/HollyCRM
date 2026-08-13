import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runWorkflowTest } from "@/lib/bot/test-run";

export const runtime = "nodejs";
// Two or three model calls back to back can exceed the default budget.
export const maxDuration = 60;

/**
 * Run a message through the workflow and report what each step did.
 *
 * Real pipeline, delivery off: nothing reaches WhatsApp, no lead moves, no chat
 * is assigned. Safe to run against a live workspace mid-demo, which is exactly
 * when someone will want to.
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    message?: string; history?: string[]; speaker?: string;
  };
  const message = String(body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Type a message to test." }, { status: 400 });
  if (message.length > 2000) {
    return NextResponse.json({ error: "That message is too long to test." }, { status: 400 });
  }

  const result = await runWorkflowTest(me.org_id, message, {
    history: Array.isArray(body.history) ? body.history.slice(-12).map(String) : undefined,
    speaker: body.speaker ? String(body.speaker).slice(0, 60) : null,
  });

  // Written with the admin client: the row records the org's test history and
  // the RLS write policy is supervisor-only, but any member may run a test.
  await supabaseAdmin().from("workflow_test_runs").insert({
    org_id: me.org_id,
    message,
    trace: result.trace,
    reply: result.reply,
    intent: result.intent,
    succeeded: result.succeeded,
    latency_ms: result.latencyMs,
    created_by: user.id,
  });

  return NextResponse.json(result);
}

/** Recent runs, so a change can be compared against what the agent did before. */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: runs } = await sb
    .from("workflow_test_runs")
    .select("id, message, reply, intent, succeeded, latency_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ runs: runs ?? [] });
}

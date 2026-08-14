import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStateInstance } from "@/lib/green/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D5: live Green API session state, plus who and where the caller is.
 *
 * A dead WhatsApp session is the most likely cause of a silent outage — messages
 * simply stop arriving with no error anywhere. The CRM polls this and shows a
 * banner, rather than waiting for someone to notice the inbox went quiet.
 *
 * The workspace identity rides along on the same poll the shell already makes:
 * the account menu needs the signed-in person, and the thread needs the name
 * this workspace gave its assistant — which was hardcoded as "Holyland AI" in
 * five components even though it has been a per-workspace setting all along.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The banner has to report THIS workspace's number. It previously updated the
  // row matching GREEN_API_ID_INSTANCE from .env, which is one specific
  // instance regardless of who was asking.
  const { data: me } = await sb
    .from("profiles").select("org_id, role, full_name, avatar_url").eq("id", user.id).maybeSingle();

  const [{ data: org }, { data: bot }] = await Promise.all([
    sb.from("organizations").select("name").eq("id", me?.org_id ?? "").maybeSingle(),
    sb.from("bot_settings").select("bot_name").maybeSingle(),
  ]);

  const identity = {
    user: {
      name: me?.full_name ?? null,
      email: user.email ?? null,
      role: me?.role ?? null,
      avatar: me?.avatar_url ?? null,
    },
    workspace: org?.name ?? null,
    assistant: bot?.bot_name?.trim() || "AI Assistant",
  };

  if (!me?.org_id) return NextResponse.json({ state: null, healthy: false, ...identity });

  const db = supabaseAdmin();
  const { data: instance } = await db
    .from("green_api_instances")
    .select("id, instance_id")
    .eq("org_id", me.org_id)
    .eq("is_active", true)
    .maybeSingle();

  // No number connected yet is a normal state for a new workspace, not a fault:
  // null state means the shell renders no banner at all.
  if (!instance) return NextResponse.json({ state: null, healthy: false, ...identity });

  try {
    const { stateInstance } = await getStateInstance(me.org_id);

    // Cache it so the banner survives a Green API outage too.
    await db
      .from("green_api_instances")
      .update({ state: stateInstance, state_changed_at: new Date().toISOString() })
      .eq("id", instance.id);

    return NextResponse.json({
      state: stateInstance,
      healthy: stateInstance === "authorized",
      ...identity,
    });
  } catch (err) {
    return NextResponse.json(
      { state: "unreachable", healthy: false, error: String(err), ...identity },
      { status: 200 }
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateSessionCache } from "@/lib/wasender/client";

export const runtime = "nodejs";

/** Choose which WasenderAPI session sends. RLS restricts this to supervisors. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { activate } = (await req.json()) as { activate?: boolean };
  if (!activate) {
    return NextResponse.json({ error: "only {activate:true} is supported" }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Two steps under the one-active-per-org unique index: clear, then set.
  const { error: clearErr } = await sb
    .from("wasender_sessions")
    .update({ is_active: false })
    .eq("is_active", true);
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 403 });

  const { data, error } = await sb
    .from("wasender_sessions")
    .update({ is_active: true })
    .eq("id", id)
    .select("id, session_name, phone, is_active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "session not found or not permitted" }, { status: 403 });

  invalidateSessionCache();
  return NextResponse.json({ ok: true, session: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  /*
   * chats.wasender_session_id is ON DELETE SET NULL and chats.provider is left
   * alone, so removing a session does not silently reroute its conversations
   * through Green API and answer them from a different number. Those chats stop
   * sending until a session is reconnected — which is the honest outcome.
   */
  const { data, error } = await sb
    .from("wasender_sessions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "session not found or not permitted" }, { status: 403 });

  invalidateSessionCache();
  return NextResponse.json({ ok: true });
}

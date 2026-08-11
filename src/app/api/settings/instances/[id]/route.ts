import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateCredsCache } from "@/lib/green/client";

export const runtime = "nodejs";

/** Choose which WhatsApp the CRM uses. RLS restricts this to supervisors. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { activate } = (await req.json()) as { activate?: boolean };
  if (!activate) return NextResponse.json({ error: "only {activate:true} is supported" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Two steps under the one-active-per-org unique index: clear, then set.
  const { error: clearErr } = await sb
    .from("green_api_instances")
    .update({ is_active: false })
    .eq("is_active", true);
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 403 });

  const { data, error } = await sb
    .from("green_api_instances")
    .update({ is_active: true })
    .eq("id", id)
    .select("id, instance_id, is_active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "instance not found or not permitted" }, { status: 403 });

  invalidateCredsCache();
  return NextResponse.json({ ok: true, instance: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("green_api_instances")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "instance not found or not permitted" }, { status: 403 });

  invalidateCredsCache();
  return NextResponse.json({ ok: true });
}

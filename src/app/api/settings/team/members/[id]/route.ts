import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isOwner } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Change a team member: deactivate, reactivate, or change their role.
 *
 * Deactivating is how someone leaves — the profile stays so their name still
 * renders on the messages they sent and the leads they worked. The database
 * refuses to strip the last owner (app.protect_last_owner), so that rule holds
 * even if another route forgets it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { is_active, role } = (await req.json().catch(() => ({}))) as {
    is_active?: boolean;
    role?: string;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me || !isOwner(me.role)) {
    return NextResponse.json(
      { error: "Only the workspace owner can change team members." },
      { status: 403 }
    );
  }
  if (id === user.id && is_active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate yourself." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof is_active === "boolean") patch.is_active = is_active;
  if (role === "owner" || role === "sales_agent") patch.role = role;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await sb
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("id, full_name, role, is_active")
    .maybeSingle();

  if (error) {
    // The last-owner guard raises check_violation with a sentence written for
    // a person — pass it through rather than replacing it with "failed".
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Member not found in this workspace." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, member: data });
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Revoke a pending invitation.
 *
 * Marked revoked rather than deleted: the link stays dead (handle_new_user only
 * accepts an invitation with revoked_at null) and the workspace keeps a record
 * that it was issued. RLS restricts this to the owner of that workspace.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "Invitation not found, already accepted, or not yours to revoke." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}

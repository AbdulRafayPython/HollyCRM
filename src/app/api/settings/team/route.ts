import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/types";

export const runtime = "nodejs";

/**
 * The team of one workspace: who is in it, and who has been invited.
 *
 * Members come back through the RLS client, so this can only ever return the
 * caller's own workspace. Emails are joined in with the service role because
 * they live in auth.users, which is not readable under RLS — an owner needs to
 * see which address an agent signs in with.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const [{ data: members }, { data: org }] = await Promise.all([
    sb.from("profiles")
      .select("id, full_name, role, role_id, is_active, created_at, assigned_role:roles(id, name)")
      .order("created_at"),
    sb.from("organizations").select("id, name").eq("id", me.org_id).maybeSingle(),
  ]);

  const admin = supabaseAdmin();
  const withEmail = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.id);
      return { ...m, email: data?.user?.email ?? null, is_you: m.id === user.id };
    })
  );

  // Only the owner deals with invitations; RLS would return an empty list for
  // an agent anyway, but asking at all is noise.
  let invitations: unknown[] = [];
  if (isOwner(me.role)) {
    const { data } = await sb
      .from("invitations")
      .select("id, email, role, token, created_at, expires_at, accepted_at, revoked_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    invitations = data ?? [];
  }

  return NextResponse.json({
    workspace: org?.name ?? null,
    you: { id: user.id, role: me.role, is_owner: isOwner(me.role) },
    members: withEmail,
    invitations,
  });
}

/**
 * Create an invitation and hand back a link.
 *
 * The link is a bearer token: single use, seven days, revocable. The email is
 * recorded so the owner can see who a pending link was meant for, but it does
 * not lock the link — the whole point of a copyable invite is that the owner
 * sends it wherever that person actually reads messages.
 */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me || !isOwner(me.role)) {
    return NextResponse.json(
      { error: "Only the workspace owner can invite people." },
      { status: 403 }
    );
  }

  const { email, role } = (await req.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
  };
  const clean = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  // Owners are not invited — a workspace has one, and it is whoever signed up.
  const inviteRole = role === "owner" ? "owner" : "sales_agent";

  const token = randomBytes(24).toString("base64url");

  const { data, error } = await sb
    .from("invitations")
    .insert({ org_id: me.org_id, email: clean, role: inviteRole, token, invited_by: user.id })
    .select("id, email, role, token, created_at, expires_at")
    .single();

  if (error) {
    // The partial unique index is what stops two live links for one address.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That address already has a pending invitation. Revoke it first to issue a new link." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invitation: data });
}

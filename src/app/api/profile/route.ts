import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_NAME = 80;

/** The signed-in person, their role, and which workspace they belong to. */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles")
    .select("id, full_name, role, avatar_url, is_active, created_at, org_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: org } = await sb
    .from("organizations")
    .select("name")
    .eq("id", me?.org_id ?? "")
    .maybeSingle();

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    // A pending address exists between requesting an email change and clicking
    // the confirmation link. Without showing it, the form looks like it silently
    // failed for however long that takes.
    pending_email: user.new_email ?? null,
    full_name: me?.full_name ?? null,
    role: me?.role ?? null,
    avatar_url: me?.avatar_url ?? null,
    workspace: org?.name ?? null,
    member_since: me?.created_at ?? user.created_at ?? null,
    // Google accounts have no password to change — the provider owns it.
    has_password: (user.app_metadata?.providers ?? []).includes("email"),
  });
}

/**
 * Update the parts of a profile that belong to the profiles table.
 *
 * Email and password are deliberately NOT here: both live in auth.users and
 * both need the caller's own session to change safely — the browser calls
 * supabase.auth.updateUser() for those. Role is not here either; a person
 * cannot promote themselves, only an owner can (see settings/team).
 */
export async function PATCH(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { full_name } = (await req.json().catch(() => ({}))) as { full_name?: string };

  const name = (full_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Your name cannot be empty." }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Keep your name under ${MAX_NAME} characters.` }, { status: 400 });
  }

  // profiles_self_update is what permits this; RLS refuses any other id.
  const { data, error } = await sb
    .from("profiles")
    .update({ full_name: name })
    .eq("id", user.id)
    .select("id, full_name, role, avatar_url")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  return NextResponse.json({ ok: true, profile: data });
}

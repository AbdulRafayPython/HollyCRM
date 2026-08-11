import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Accept an invitation without sending a single email.
 *
 * The client used to call auth.signUp() directly, which makes Supabase send a
 * confirmation email — and the built-in SMTP allows a couple of those an hour,
 * so the second person invited in an afternoon got "email rate limit exceeded"
 * and could not join. That defeated the point of a copyable link.
 *
 * Instead the server creates the account with the service role and
 * email_confirm: true, then the browser signs in with the password the person
 * just chose. The address is taken from the INVITATION, never from the request
 * body: the account is created pre-confirmed, so letting the caller name any
 * address would mint a verified account for an inbox nobody proved they own.
 */
export async function POST(req: Request) {
  const { token, fullName, password } = (await req.json().catch(() => ({}))) as {
    token?: string;
    fullName?: string;
    password?: string;
  };

  if (!token || !password || password.length < 8) {
    return NextResponse.json(
      { error: "A name, a password of at least 8 characters, and a valid link are required." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // Service role, because an anonymous caller has no rights to this table.
  // Every condition that makes a link dead is checked here, not in the UI.
  const { data: invite } = await db
    .from("invitations")
    .select("id, org_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  const dead =
    !invite ||
    invite.accepted_at !== null ||
    invite.revoked_at !== null ||
    new Date(invite.expires_at).getTime() <= Date.now();

  if (dead) {
    return NextResponse.json(
      { error: "This invite link is no longer valid. Ask the workspace owner for a fresh one." },
      { status: 410 }
    );
  }

  const { data: created, error } = await db.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: (fullName ?? "").trim() || invite.email.split("@")[0],
      // app.handle_new_user() reads this and places the profile in the right
      // workspace, then marks the invitation consumed — same transaction.
      invitation_token: token,
    },
  });

  if (error) {
    const already = /already been registered|already exists/i.test(error.message);
    return NextResponse.json(
      {
        error: already
          ? `${invite.email} already has an account. Sign in instead — the owner can re-invite a different address if needed.`
          : error.message,
      },
      { status: already ? 409 : 400 }
    );
  }

  // The trigger runs inside the user insert, so by here the profile exists. If
  // it somehow did not, the person would land in an app with no workspace and
  // no explanation — so verify rather than assume.
  const { data: profile } = await db
    .from("profiles")
    .select("org_id")
    .eq("id", created.user.id)
    .maybeSingle();

  if (!profile) {
    await db.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Could not attach the account to the workspace. Ask the owner for a new link." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email: invite.email });
}

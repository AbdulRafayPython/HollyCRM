import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Change the signed-in user's password.
 *
 * The settings page has posted here since it was written, but the route did not
 * exist — the request 404'd and the dialog reported "Could not update password"
 * with no way to tell that from a wrong current password.
 *
 * The current password is verified by re-authenticating rather than trusted
 * from the client: without that, anyone who got hold of a live session could
 * change the password without knowing the old one and lock the owner out.
 * `signInWithPassword` issues a fresh session and `supabaseServer` writes the
 * rotated cookies, so the caller stays signed in either way.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    current_password?: unknown;
    new_password?: unknown;
  };

  const currentPassword = String(body.current_password ?? "");
  const newPassword = String(body.new_password ?? "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Enter your current password and a new one." },
      { status: 400 }
    );
  }
  // Mirrors Supabase's own minimum; checked here too because the client is not
  // the security boundary.
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "The new password matches your current one." },
      { status: 400 }
    );
  }

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Google-only accounts have no password to change; say so rather than failing
  // with whatever the auth server returns for a missing credential.
  if (!user.email) {
    return NextResponse.json(
      { error: "This account signs in with Google and has no password." },
      { status: 400 }
    );
  }

  const { error: reauthError } = await sb.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
    );
  }

  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

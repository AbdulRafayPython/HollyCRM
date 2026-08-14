import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single landing point for every auth redirect:
 *  - Google OAuth returns with ?code=            -> exchangeCodeForSession
 *  - Password-recovery emails return with either ?code= (default template) or
 *    ?token_hash=&type= (customized template)    -> verifyOtp
 *
 * On success the session cookies are set and we forward to `next`
 * (e.g. /reset-password for recovery, /inbox for OAuth). On failure we land on
 * /login with a readable error instead of a dead white page.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // Never `new URL(req.url).origin` — behind a proxy that is the internal host,
  // and the user gets redirected off the domain their cookies belong to.
  const origin = siteOrigin(req);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only same-site paths — a full URL here would be an open redirect.
  const rawNext = searchParams.get("next") ?? "/inbox";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/inbox";

  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  // The provider itself can return an error (user cancelled the Google screen).
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError && !code && !tokenHash) return fail(providerError);

  const sb = await supabaseServer();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return fail(`Sign-in link problem: ${error.message}`);
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail(`This link is invalid or has expired: ${error.message}`);
    return NextResponse.redirect(`${origin}${next}`);
  }

  return fail("Missing sign-in code — please try again.");
}

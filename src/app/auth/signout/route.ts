import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  // Built from the forwarded host, not `req.url` — see lib/site-url.ts.
  return NextResponse.redirect(`${siteOrigin(req)}/login`, { status: 303 });
}

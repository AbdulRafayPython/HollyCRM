import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractRequirements } from "@/lib/deepseek/extract";
import { composeReply, noMatchReply } from "@/lib/deepseek/compose";
import type { HotelResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev-only harness: runs the full bot brain (extract -> search_hotels -> compose)
 * and RETURNS the reply instead of sending it to WhatsApp.
 *
 * This is the demo safety net. If Green API is unauthorized or the tunnel dies,
 * the AI and inventory logic can still be demonstrated end to end from a browser
 * or curl, with no WhatsApp dependency at all.
 *
 *   curl -X POST localhost:3000/api/dev/simulate \
 *     -H "Content-Type: application/json" \
 *     -d '{"text":"5 star Makkah hotel under 1300 riyal near Haram, 10-15 September, 8 people"}'
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }

  // The dev server is exposed through a public tunnel for the Green API webhook,
  // which means this route is public too — and it burns DeepSeek credit. Require
  // either a signed-in session (browser) or the webhook token (curl).
  const { supabaseServer } = await import("@/lib/supabase/server");
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const headerToken = req.headers.get("x-simulate-token");
  const expected = process.env.GREEN_API_WEBHOOK_TOKEN;
  if (!user && !(expected && headerToken === expected)) {
    return NextResponse.json(
      { error: "sign in, or send x-simulate-token: $GREEN_API_WEBHOOK_TOKEN" },
      { status: 401 }
    );
  }

  const { text, isGroup } = (await req.json()) as { text?: string; isGroup?: boolean };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Simulate against the caller's own workspace, so a dry run reads that
  // workspace's assistant settings and inventory rather than the demo org's.
  let orgId = process.env.DEMO_ORG_ID;
  if (user) {
    const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (me?.org_id) orgId = me.org_id;
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const t0 = Date.now();

  const requirements = await extractRequirements(text, { orgId, today });
  const tExtract = Date.now() - t0;

  let hotels: HotelResult[] = [];
  let searchError: string | null = null;

  if (requirements.city && requirements.check_in && requirements.check_out) {
    const { data, error } = await supabaseAdmin().rpc("search_hotels", {
      p_city: requirements.city,
      p_check_in: requirements.check_in,
      p_check_out: requirements.check_out,
      p_pax: requirements.pax ?? 2,
      // Null lets the SQL derive rooms from the party size — same as runBot().
      // Forcing 1 here would make this harness disagree with the live bot.
      p_rooms: requirements.rooms,
      p_max_price_per_night: requirements.max_price_per_night,
      p_max_distance_m: requirements.max_distance_m,
      p_min_stars: requirements.min_stars,
      p_shuttle_ok: true,
      p_limit: 5,
    });
    if (error) searchError = error.message;
    else hotels = (data ?? []) as HotelResult[];
  }

  const tSearch = Date.now() - t0 - tExtract;

  const reply =
    hotels.length > 0
      ? await composeReply(requirements, hotels, {
          orgId,
          customerMessage: text,
          isGroup: Boolean(isGroup),
        })
      : requirements.city && requirements.check_in
        ? noMatchReply(requirements.language, requirements)
        : null;

  return NextResponse.json({
    requirements,
    hotels,
    searchError,
    reply,
    timings_ms: {
      extract: tExtract,
      search: tSearch,
      total: Date.now() - t0,
    },
  });
}

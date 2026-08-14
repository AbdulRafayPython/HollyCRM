import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateBotSettingsCache } from "@/lib/bot/settings";

export const runtime = "nodejs";

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.from("bot_settings").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ settings: data });
}

/** Saves the AI agent configuration. bot_settings RLS = supervisors only. */
export async function PUT(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const clean = {
    org_id: me.org_id,
    enabled: Boolean(body.enabled),
    bot_name: String(body.bot_name ?? "Holyland AI").slice(0, 60) || "Holyland AI",
    greeting_enabled: Boolean(body.greeting_enabled),
    greeting_en: body.greeting_en ? String(body.greeting_en).slice(0, 1000) : null,
    greeting_ar: body.greeting_ar ? String(body.greeting_ar).slice(0, 1000) : null,
    custom_instructions: String(body.custom_instructions ?? "").slice(0, 1500),
    group_keywords: Array.isArray(body.group_keywords)
      ? body.group_keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 100)
      : undefined,
    handoff_keywords: Array.isArray(body.handoff_keywords)
      ? body.handoff_keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 50)
      : undefined,
    group_cooldown_seconds: clamp(Number(body.group_cooldown_seconds), 10, 3600, 60),
    group_daily_cap: clamp(Number(body.group_daily_cap), 1, 200, 10),
    // `?? true` rather than Boolean(): an older client that does not send this
    // field would otherwise switch social replies off on every save, and the
    // symptom — the bot silently stops answering greetings — looks like a
    // regression in the bot rather than a settings write.
    smalltalk_enabled: body.smalltalk_enabled === undefined
      ? true
      : Boolean(body.smalltalk_enabled),
    smalltalk_cooldown_seconds: clamp(Number(body.smalltalk_cooldown_seconds), 0, 3600, 45),
  };

  const { data, error } = await sb
    .from("bot_settings")
    .upsert(clean, { onConflict: "org_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: /row-level security/i.test(error.message)
          ? "Only a supervisor can change AI agent settings."
          : error.message },
      { status: 403 }
    );
  }

  invalidateBotSettingsCache();
  return NextResponse.json({ ok: true, settings: data });
}

function clamp(n: number, min: number, max: number, dflt: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
}

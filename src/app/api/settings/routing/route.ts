import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateBotSettingsCache } from "@/lib/bot/settings";

export const runtime = "nodejs";

/**
 * Settings → Routing. Which desk covers which customers, and who is on it.
 *
 * Reads are org-wide so every agent can see the coverage map; writes are
 * supervisor-only and enforced by the RLS policies in 0021 rather than by a
 * role check here — the caller's own client is used, so an agent's write simply
 * returns no row.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: regions }, { data: coverage }, { data: agents }, { data: settings }] =
    await Promise.all([
      sb.from("regions")
        .select("id, name, country_codes, is_default, is_active")
        .order("is_default", { ascending: false })
        .order("name"),
      sb.from("agent_regions").select("profile_id, region_id"),
      // available_agents is the same view the router reads, so this screen can
      // never claim someone is online while the router disagrees.
      sb.from("available_agents")
        .select("id, full_name, role, presence, is_online, open_chats, max_open_chats")
        .order("full_name"),
      sb.from("bot_settings")
        .select("auto_assign_enabled, assign_outside_region, presence_timeout_seconds, fallback_message_en, fallback_message_ar")
        .maybeSingle(),
    ]);

  return NextResponse.json({
    regions: regions ?? [],
    coverage: coverage ?? [],
    agents: agents ?? [],
    settings: settings ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string; country_codes?: string[]; is_default?: boolean;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const { error } = await sb.from("regions").insert({
    org_id: me.org_id,
    name: name.slice(0, 80),
    country_codes: cleanCodes(body.country_codes),
    is_default: Boolean(body.is_default),
  });

  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "region" | "coverage" | "capacity" | "settings";
    id?: string;
    name?: string;
    country_codes?: string[];
    is_default?: boolean;
    is_active?: boolean;
    profile_id?: string;
    region_id?: string;
    covered?: boolean;
    max_open_chats?: number;
    settings?: Record<string, unknown>;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (body.action === "region" && body.id) {
    // regions_one_default_per_org is a partial unique index, so promoting a new
    // default has to demote the old one first — otherwise the insert collides
    // and the operator sees a constraint name instead of a result.
    if (body.is_default) {
      await sb.from("regions").update({ is_default: false }).neq("id", body.id);
    }
    const { error } = await sb
      .from("regions")
      .update({
        ...(body.name !== undefined ? { name: String(body.name).trim().slice(0, 80) } : {}),
        ...(body.country_codes !== undefined ? { country_codes: cleanCodes(body.country_codes) } : {}),
        ...(body.is_default !== undefined ? { is_default: Boolean(body.is_default) } : {}),
        ...(body.is_active !== undefined ? { is_active: Boolean(body.is_active) } : {}),
      })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "coverage" && body.profile_id && body.region_id) {
    const { error } = body.covered
      ? await sb.from("agent_regions").upsert(
          { profile_id: body.profile_id, region_id: body.region_id },
          { onConflict: "profile_id,region_id" }
        )
      : await sb.from("agent_regions").delete()
          .eq("profile_id", body.profile_id)
          .eq("region_id", body.region_id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "capacity" && body.profile_id) {
    // 0021 extended protect_privileged_columns to cover max_open_chats, so a
    // non-supervisor reaching this raises rather than silently self-serving.
    const { error } = await sb
      .from("profiles")
      .update({ max_open_chats: clamp(Number(body.max_open_chats), 1, 500, 15) })
      .eq("id", body.profile_id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "settings") {
    const s = body.settings ?? {};
    const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

    const { error } = await sb.from("bot_settings").upsert(
      {
        org_id: me.org_id,
        auto_assign_enabled: s.auto_assign_enabled === undefined ? true : Boolean(s.auto_assign_enabled),
        assign_outside_region: s.assign_outside_region === undefined ? true : Boolean(s.assign_outside_region),
        presence_timeout_seconds: clamp(Number(s.presence_timeout_seconds), 30, 3600, 120),
        fallback_message_en: s.fallback_message_en ? String(s.fallback_message_en).slice(0, 1000) : null,
        fallback_message_ar: s.fallback_message_ar ? String(s.fallback_message_ar).slice(0, 1000) : null,
      },
      { onConflict: "org_id" }
    );
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
    invalidateBotSettingsCache();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: region } = await sb
    .from("regions").select("is_default").eq("id", id).maybeSingle();
  if (region?.is_default) {
    // Deleting the catch-all leaves customers no rule matched with nowhere to
    // go, and the router silently reports "no agent available" for all of them.
    return NextResponse.json(
      { error: "That's the default region — make another region the default first." },
      { status: 400 }
    );
  }

  const { data, error } = await sb.from("regions").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

/** Dialling prefixes: digits only, deduped, capped. "+92" and "92 " are the
 *  same rule, and storing both makes the longest-prefix sort meaningless. */
function cleanCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  return [
    ...new Set(
      codes
        .map((c) => String(c).replace(/\D/g, ""))
        .filter((c) => c.length >= 1 && c.length <= 4)
    ),
  ].slice(0, 60);
}

function clamp(n: number, lo: number, hi: number, dflt: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

function friendly(msg: string): string {
  if (/row-level security/i.test(msg)) return "Only a supervisor can change routing.";
  if (/regions_one_default_per_org/i.test(msg)) return "There is already a default region.";
  if (/regions_org_id_name_key|duplicate key/i.test(msg)) return "A region with that name already exists.";
  if (/chat capacity/i.test(msg)) return "Only a supervisor can change an agent's capacity.";
  return msg;
}

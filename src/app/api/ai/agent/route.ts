import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateBotSettingsCache } from "@/lib/bot/settings";
import { processSource, type SourceRow } from "@/lib/knowledge/ingest";

export const runtime = "nodejs";

/**
 * The AI agent's own configuration surface: what it knows about the business,
 * which branches are live, and where its nodes sit on the canvas.
 *
 * Split from /api/settings/bot on purpose. That route saves the whole settings
 * form as one object, so a canvas drag would have to round-trip every keyword
 * list and greeting to move a node twelve pixels — and two people editing at
 * once would overwrite each other's prompt changes with stale form state.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await sb
    .from("bot_settings")
    .select(
      "enabled, bot_name, business_name, business_url, business_description, onboarded_at, " +
      "workflow_layout, greeting_enabled, smalltalk_enabled, knowledge_enabled, " +
      "inventory_enabled, auto_assign_enabled, custom_instructions"
    )
    .maybeSingle();

  return NextResponse.json({ agent: data ?? null });
}

/**
 * Partial updates only — every field is optional and absent keys are untouched.
 * A canvas drag sends `{ workflow_layout }` and nothing else.
 */
export async function PATCH(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  const bool = (key: string) => {
    if (body[key] !== undefined) patch[key] = Boolean(body[key]);
  };
  const text = (key: string, max: number) => {
    if (body[key] !== undefined) {
      patch[key] = body[key] ? String(body[key]).slice(0, max) : null;
    }
  };

  bool("enabled");
  bool("greeting_enabled");
  bool("smalltalk_enabled");
  bool("knowledge_enabled");
  bool("inventory_enabled");
  bool("auto_assign_enabled");
  text("bot_name", 60);
  text("business_name", 120);
  text("business_url", 300);
  text("business_description", 2000);
  text("custom_instructions", 1500);

  if (body.workflow_layout !== undefined) {
    patch.workflow_layout = sanitiseLayout(body.workflow_layout);
  }
  if (body.onboarded === true) patch.onboarded_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await sb
    .from("bot_settings")
    .upsert({ org_id: me.org_id, ...patch }, { onConflict: "org_id" })
    .select("org_id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: /row-level security/i.test(error?.message ?? "")
          ? "Only a supervisor can change the AI agent."
          : error?.message ?? "Save failed." },
      { status: 403 }
    );
  }

  invalidateBotSettingsCache(me.org_id);
  return NextResponse.json({ ok: true });
}

/**
 * The build-your-agent wizard, in one call.
 *
 * Writes the business identity, then — if a URL was given — queues it as a
 * knowledge source so the agent can answer from the customer's own site
 * immediately rather than starting from an empty corpus. The fetch runs in
 * `after()`: a slow site must not hold the wizard open, and a site that is down
 * must not fail the setup it was only ever an optional part of.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    business_name?: string;
    business_url?: string;
    business_description?: string;
    bot_name?: string;
    tone?: string;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const name = String(body.business_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "What's the business called?" }, { status: 400 });

  const url = String(body.business_url ?? "").trim();
  if (url && !/^https?:\/\/\S+\.\S+/.test(url)) {
    return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
  }

  const description = String(body.business_description ?? "").trim();

  const { error } = await sb.from("bot_settings").upsert(
    {
      org_id: me.org_id,
      business_name: name.slice(0, 120),
      business_url: url ? url.slice(0, 300) : null,
      business_description: description.slice(0, 2000) || null,
      bot_name: String(body.bot_name ?? "").trim().slice(0, 60) || "AI Assistant",
      // The description and tone become the agent's standing instructions. They
      // are appended, never used to replace the absolute rules in the composer
      // prompts — those always win, whatever a workspace writes here.
      custom_instructions: buildInstructions(name, description, body.tone),
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) {
    return NextResponse.json(
      { error: /row-level security/i.test(error.message)
          ? "Only a supervisor can set this up."
          : error.message },
      { status: 403 }
    );
  }

  invalidateBotSettingsCache(me.org_id);

  let sourceId: string | null = null;
  if (url) {
    const { data: source } = await sb
      .from("knowledge_sources")
      .insert({
        org_id: me.org_id,
        purpose: "knowledge",
        kind: "csv", // a fetched page; the parser sniffs HTML and strips it
        title: `${name} website`,
        source_url: url,
        created_by: user.id,
      })
      .select("id, org_id, purpose, kind, title, storage_path, source_url, raw_text")
      .single();

    if (source) {
      sourceId = source.id;
      after(async () => { await processSource(source as SourceRow); });
    }
  }

  return NextResponse.json({ ok: true, sourceId });
}

/**
 * Positions only, bounded and numeric.
 *
 * This blob is written straight back into the canvas on every load, so it is
 * untrusted input that becomes render state. Anything that is not a finite
 * number within the canvas bounds is dropped rather than clamped — a node at
 * NaN disappears, and a node at 10^9 drags the scroll extent with it.
 */
function sanitiseLayout(raw: unknown): Record<string, { x: number; y: number }> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length > 40) continue;
    const v = value as { x?: unknown; y?: unknown };
    const x = Number(v?.x);
    const y = Number(v?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -2000 || x > 8000 || y < -2000 || y > 8000) continue;
    out[key] = { x: Math.round(x), y: Math.round(y) };
    if (Object.keys(out).length > 60) break;
  }
  return out;
}

function buildInstructions(name: string, description: string, tone?: string): string {
  const parts = [`You represent ${name}.`];
  if (description) parts.push(description);
  if (tone) parts.push(`Tone: ${tone}.`);
  return parts.join("\n\n").slice(0, 1500);
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ACTIONS, FIELDS, OPERATORS, type Condition, type RuleAction,
} from "@/lib/bot/rules";

export const runtime = "nodejs";

/**
 * Settings for the workspace's own if/else rules.
 *
 * Conditions and actions are validated field by field before they are stored.
 * These run against every inbound message, so a rule with a bad operator must
 * fail here — at 3pm, in front of the person who wrote it — rather than at 2am
 * against a real customer.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: rules }, { data: regions }, { data: agents }] = await Promise.all([
    sb.from("workflow_rules")
      .select("id, name, priority, match_type, conditions, action, continue_on_match, is_active, match_count, last_matched_at")
      .order("priority").order("created_at"),
    sb.from("regions").select("id, name").eq("is_active", true).order("name"),
    sb.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return NextResponse.json({
    rules: rules ?? [],
    regions: regions ?? [],
    agents: agents ?? [],
    fields: FIELDS,
    operators: OPERATORS,
    actions: ACTIONS,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const parsed = validate(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await sb.from("workflow_rules").insert({
    org_id: me.org_id,
    created_by: user.id,
    ...parsed.rule,
  });
  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // A bare enable/disable is not a full rule edit and must not be forced
  // through validation of fields it never sent.
  if (body.action === "toggle") {
    const { error } = await sb.from("workflow_rules")
      .update({ is_active: Boolean(body.is_active) })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  const parsed = validate(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await sb.from("workflow_rules").update(parsed.rule).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.from("workflow_rules").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

type Validated =
  | { error: string }
  | { rule: {
      name: string; priority: number; match_type: string;
      conditions: Condition[]; action: RuleAction; continue_on_match: boolean; is_active: boolean;
    } };

function validate(body: Record<string, unknown>): Validated {
  const name = String(body.name ?? "").trim();
  if (!name) return { error: "Give the rule a name." };

  const rawConditions = Array.isArray(body.conditions) ? body.conditions : [];
  if (rawConditions.length === 0) {
    // A rule with no conditions would either match everything or nothing. The
    // engine chooses nothing; saying so here is clearer than saving a rule that
    // silently never fires.
    return { error: "Add at least one condition — a rule with none never runs." };
  }
  if (rawConditions.length > 10) return { error: "Ten conditions is the limit for one rule." };

  const conditions: Condition[] = [];
  for (const raw of rawConditions) {
    const c = raw as Partial<Condition>;
    if (!c.field || !FIELDS.includes(c.field)) return { error: `Unknown field "${c.field}".` };
    if (!c.op || !OPERATORS.includes(c.op)) return { error: `Unknown operator "${c.op}".` };

    const needsValue = c.op !== "is_set" && c.op !== "is_empty";
    const value = String(c.value ?? "").trim();
    if (needsValue && !value) {
      return { error: `"${c.field}" needs a value to compare against.` };
    }
    if ((c.op === "gt" || c.op === "lt") && !Number.isFinite(Number(value))) {
      return { error: `"${value}" is not a number, so it can't be compared with more/less than.` };
    }
    conditions.push({ field: c.field, op: c.op, value: value.slice(0, 200) });
  }

  const rawAction = (body.action ?? {}) as Partial<RuleAction>;
  if (!rawAction.type || !ACTIONS.includes(rawAction.type)) {
    return { error: "Choose what the rule should do." };
  }
  if (rawAction.type === "reply" && !String(rawAction.message ?? "").trim()) {
    return { error: "A reply rule needs the message to send." };
  }
  if (rawAction.type === "assign_agent" && !rawAction.agent_id) {
    return { error: "Choose which person to assign to." };
  }
  if (rawAction.type === "assign_region" && !rawAction.region_id) {
    return { error: "Choose which desk to send to." };
  }

  const action: RuleAction = {
    type: rawAction.type,
    ...(rawAction.region_id ? { region_id: String(rawAction.region_id) } : {}),
    ...(rawAction.agent_id ? { agent_id: String(rawAction.agent_id) } : {}),
    ...(rawAction.message ? { message: String(rawAction.message).slice(0, 1000) } : {}),
    ...(rawAction.tag ? { tag: String(rawAction.tag).slice(0, 200) } : {}),
  };

  return {
    rule: {
      name: name.slice(0, 100),
      priority: clamp(Number(body.priority), 1, 999, 100),
      match_type: body.match_type === "any" ? "any" : "all",
      conditions,
      action,
      // Only a tag can fall through. Letting an assigning rule continue means
      // two rules racing to own the same chat.
      continue_on_match: action.type === "tag" ? Boolean(body.continue_on_match) : false,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  };
}

function clamp(n: number, lo: number, hi: number, dflt: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

function friendly(msg: string): string {
  return /row-level security/i.test(msg) ? "Only a supervisor can change rules." : msg;
}

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Requirements } from "@/lib/deepseek/extract";

/**
 * Operator-defined if/else, applied to every inbound message.
 *
 * Runs AFTER extraction, so a condition can read what the customer meant
 * ("intent is a complaint", "budget over 50,000", "city is Makkah") rather than
 * only what they typed. Runs BEFORE the bot decides how to answer, so a rule can
 * take the conversation away from the bot entirely.
 *
 * Everything here is deterministic. No model call, no network beyond the one
 * read of the rule list — a rule that behaves differently on two identical
 * messages is not a rule, and an operator debugging their own logic must be able
 * to predict it.
 */

export const FIELDS = [
  "intent", "message", "language", "country_code", "chat_type",
  "city", "pax", "rooms", "budget", "min_stars", "nights", "hour",
] as const;

export const OPERATORS = [
  "is", "is_not", "contains", "not_contains", "gt", "lt", "is_set", "is_empty",
] as const;

export const ACTIONS = [
  "handoff", "assign_region", "assign_agent", "reply", "pause_bot", "tag",
] as const;

export type Field = (typeof FIELDS)[number];
export type Operator = (typeof OPERATORS)[number];
export type ActionType = (typeof ACTIONS)[number];

export interface Condition {
  field: Field;
  op: Operator;
  value?: string;
}

export interface RuleAction {
  type: ActionType;
  region_id?: string;
  agent_id?: string;
  message?: string;
  tag?: string;
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  match_type: "all" | "any";
  conditions: Condition[];
  action: RuleAction;
  continue_on_match: boolean;
  is_active: boolean;
}

/** Everything a condition can be tested against, resolved once per message. */
export interface RuleContext {
  intent: string;
  message: string;
  language: string;
  country_code: string | null;
  chat_type: "direct" | "group";
  city: string | null;
  pax: number | null;
  rooms: number | null;
  budget: number | null;
  min_stars: number | null;
  nights: number | null;
  /** Local hour 0–23, for "outside office hours" rules. */
  hour: number;
}

export function buildContext(
  req: Requirements,
  extra: { message: string; countryCode: string | null; isGroup: boolean; timeZone?: string }
): RuleContext {
  const nights =
    req.check_in && req.check_out
      ? Math.round(
          (Date.parse(`${req.check_out}T00:00:00Z`) - Date.parse(`${req.check_in}T00:00:00Z`)) / 86_400_000
        )
      : null;

  return {
    intent: req.intent,
    message: extra.message,
    language: req.language,
    country_code: extra.countryCode,
    chat_type: extra.isGroup ? "group" : "direct",
    city: req.city,
    pax: req.pax,
    rooms: req.rooms,
    budget: req.max_price_per_night,
    min_stars: req.min_stars,
    nights: Number.isFinite(nights) ? nights : null,
    hour: Number(
      new Date().toLocaleString("en-GB", {
        timeZone: extra.timeZone ?? "Asia/Riyadh",
        hour: "2-digit",
        hour12: false,
      })
    ),
  };
}

export interface RuleMatch {
  rule: Rule;
  action: RuleAction;
}

/** Reads the workspace's active rules, cheapest-first. */
export async function loadRules(orgId: string): Promise<Rule[]> {
  try {
    const { data } = await supabaseAdmin()
      .from("workflow_rules")
      .select("id, name, priority, match_type, conditions, action, continue_on_match, is_active")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    return (data ?? []) as Rule[];
  } catch (err) {
    // A rules failure must never take the bot down. No rules means the shipped
    // defaults apply, which is exactly how the product behaved before this file.
    console.error("[rules] load failed", err);
    return [];
  }
}

/**
 * Returns every rule that fires, in order.
 *
 * Stops at the first match unless that rule sets `continue_on_match`, because
 * two rules both assigning the same chat is a race with no correct answer. A
 * tagging rule can opt to fall through to the next one.
 */
export function evaluate(rules: Rule[], ctx: RuleContext): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const rule of rules) {
    if (!matches(rule, ctx)) continue;
    out.push({ rule, action: rule.action });
    if (!rule.continue_on_match) break;
  }
  return out;
}

export function matches(rule: Rule, ctx: RuleContext): boolean {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  // A rule with no conditions matches nothing. The alternative — matching
  // everything — turns a half-finished rule into a workspace-wide outage the
  // moment someone saves it.
  if (conditions.length === 0) return false;

  const results = conditions.map((c) => test(c, ctx));
  return rule.match_type === "any" ? results.some(Boolean) : results.every(Boolean);
}

function test(condition: Condition, ctx: RuleContext): boolean {
  const actual = ctx[condition.field];
  const expected = condition.value ?? "";

  switch (condition.op) {
    case "is_set":
      return actual !== null && actual !== undefined && actual !== "";
    case "is_empty":
      return actual === null || actual === undefined || actual === "";

    case "gt":
    case "lt": {
      // Absence is checked BEFORE conversion, and that ordering is the whole
      // point: Number(null) is 0, not NaN, so a Number.isFinite() guard alone
      // lets a missing value through as zero — and "budget under 5000" then
      // fires on every customer who never mentioned a budget at all, routing
      // them somewhere nobody intended.
      if (actual === null || actual === undefined || actual === "") return false;

      const a = Number(actual);
      const b = Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return condition.op === "gt" ? a > b : a < b;
    }

    case "contains":
    case "not_contains": {
      const hit = String(actual ?? "").toLowerCase().includes(expected.toLowerCase().trim());
      return condition.op === "contains" ? hit : !hit;
    }

    case "is":
    case "is_not": {
      // Comma-separated values mean "any of these", so one row covers
      // "city is Makkah, Madinah" without needing an OR group.
      const options = expected.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
      const hit = options.includes(String(actual ?? "").toLowerCase());
      return condition.op === "is" ? hit : !hit;
    }

    default:
      return false;
  }
}

/** Fire-and-forget usage counter, so dead rules are visible in the UI. */
export async function recordMatch(ruleId: string): Promise<void> {
  try {
    await supabaseAdmin().rpc("record_rule_match", { p_rule_id: ruleId });
  } catch {
    /* a missed count is not worth a failed reply */
  }
}

/* ---------------------------------------------------------------------------
 * Human-readable rendering, shared by the UI and the test trace
 * ------------------------------------------------------------------------ */

export const FIELD_LABEL: Record<Field, string> = {
  intent: "What the customer wants",
  message: "Message text",
  language: "Language",
  country_code: "Country code",
  chat_type: "Chat type",
  city: "City",
  pax: "Number of people",
  rooms: "Number of rooms",
  budget: "Budget per night",
  min_stars: "Star rating",
  nights: "Nights",
  hour: "Hour of day (0–23)",
};

export const OPERATOR_LABEL: Record<Operator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  gt: "is more than",
  lt: "is less than",
  is_set: "is provided",
  is_empty: "is missing",
};

export const ACTION_LABEL: Record<ActionType, string> = {
  handoff: "Hand over to a human",
  assign_region: "Send to a specific desk",
  assign_agent: "Assign to a specific person",
  reply: "Send this exact reply",
  pause_bot: "Stop the AI on this chat",
  tag: "Add a note to the lead",
};

export function describeRule(rule: Rule): string {
  const conditions = (rule.conditions ?? [])
    .map((c) => {
      const field = FIELD_LABEL[c.field] ?? c.field;
      const op = OPERATOR_LABEL[c.op] ?? c.op;
      const needsValue = c.op !== "is_set" && c.op !== "is_empty";
      return `${field} ${op}${needsValue ? ` "${c.value ?? ""}"` : ""}`;
    })
    .join(rule.match_type === "any" ? " OR " : " AND ");

  return `IF ${conditions || "(no conditions)"} THEN ${ACTION_LABEL[rule.action?.type] ?? "do nothing"}`;
}

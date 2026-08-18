import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateBotSettingsCache } from "@/lib/bot/settings";

export const runtime = "nodejs";

/**
 * Settings → Coverage. Which slice of the workspace each person can see.
 *
 * The write side of the boundary 0033 enforces. Four dimensions: destination,
 * supplier, client and — behind an explicit workspace opt-in — customer country,
 * which keeps living in the routing screen because agent_regions was built for
 * routing first (0021) and only gained this second job in 0033.
 *
 * No role check in this file, deliberately, and for the reason the rest of the
 * API is written that way: the caller's own cookie-bound client is used, so the
 * supervisor-only policies on the coverage tables answer the question. An agent
 * POSTing here writes nothing and is told so. Re-implementing the policy in
 * TypeScript would give us two answers to keep in step, and PostgREST would
 * still be reachable around it.
 *
 * One rule worth stating because it is invisible in the data: an agent with no
 * rows in a dimension is UNRESTRICTED on it, not blind. Removing somebody's last
 * destination widens what they can see rather than narrowing it to nothing, and
 * the UI has to say so — an operator who reads it the other way will "revoke"
 * access and hand out more.
 */

type Dimension = "destination" | "supplier" | "client";

const TABLE: Record<Dimension, { catalog: string; join: string; fk: string }> = {
  destination: { catalog: "destinations", join: "agent_destinations", fk: "destination_id" },
  supplier:    { catalog: "suppliers",    join: "agent_suppliers",    fk: "supplier_id" },
  client:      { catalog: "clients",      join: "agent_clients",      fk: "client_id" },
};

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    { data: destinations },
    { data: suppliers },
    { data: clients },
    { data: agents },
    { data: agentDestinations },
    { data: agentSuppliers },
    { data: agentClients },
    { data: settings },
  ] = await Promise.all([
    sb.from("destinations").select("id, name, country, is_active, sort_order").order("sort_order").order("name"),
    sb.from("suppliers").select("id, name, kind, is_active").order("name"),
    sb.from("clients").select("id, name, kind, country, is_active").order("name"),
    sb.from("profiles").select("id, full_name, role, is_active").eq("is_active", true).order("full_name"),
    sb.from("agent_destinations").select("profile_id, destination_id"),
    sb.from("agent_suppliers").select("profile_id, supplier_id"),
    sb.from("agent_clients").select("profile_id, client_id"),
    sb.from("bot_settings").select("enforce_region_scope").maybeSingle(),
  ]);

  return NextResponse.json({
    destinations: destinations ?? [],
    suppliers: suppliers ?? [],
    clients: clients ?? [],
    agents: agents ?? [],
    coverage: {
      destination: agentDestinations ?? [],
      supplier: agentSuppliers ?? [],
      client: agentClients ?? [],
    },
    enforce_region_scope: settings?.enforce_region_scope ?? false,
  });
}

/** Create a destination, supplier or client. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    dimension?: Dimension;
    name?: string;
    country?: string;
    kind?: string;
  };

  const dimension = body.dimension;
  if (!dimension || !(dimension in TABLE)) {
    return NextResponse.json({ error: "Unknown dimension." }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const row: Record<string, unknown> = { org_id: me.org_id, name: name.slice(0, 120) };
  if (dimension === "destination") row.country = body.country?.trim() || null;
  if (dimension === "supplier") row.kind = body.kind ?? "dmc";
  if (dimension === "client") {
    row.kind = body.kind ?? "b2b";
    row.country = body.country?.trim() || null;
  }

  const { error } = await sb.from(TABLE[dimension].catalog).insert(row);
  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Assign or remove coverage, or flip the region opt-in. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "coverage" | "region_scope";
    dimension?: Dimension;
    profile_id?: string;
    target_id?: string;
    covered?: boolean;
    enabled?: boolean;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (body.action === "coverage") {
    const dimension = body.dimension;
    if (!dimension || !(dimension in TABLE)) {
      return NextResponse.json({ error: "Unknown dimension." }, { status: 400 });
    }
    if (!body.profile_id || !body.target_id) {
      return NextResponse.json({ error: "Missing agent or target." }, { status: 400 });
    }

    const { join, fk } = TABLE[dimension];

    if (body.covered) {
      const { error } = await sb
        .from(join)
        .upsert({ profile_id: body.profile_id, [fk]: body.target_id });
      if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    } else {
      const { error } = await sb
        .from(join)
        .delete()
        .eq("profile_id", body.profile_id)
        .eq(fk, body.target_id);
      if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "region_scope") {
    const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

    const { error } = await sb
      .from("bot_settings")
      .update({ enforce_region_scope: Boolean(body.enabled) })
      .eq("org_id", me.org_id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });

    // bot_settings is one of the 30s-TTL hot-path caches; a routing decision
    // must not keep using the old answer while the operator watches the toggle.
    invalidateBotSettingsCache(me.org_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/**
 * RLS denials arrive as a policy-violation string, and the honest translation is
 * about role, not about SQL. The unique-name case is the other one an operator
 * actually causes.
 */
function friendly(message: string): string {
  if (/row-level security/i.test(message)) {
    return "Only a supervisor can change coverage.";
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return "Something with that name already exists in this workspace.";
  }
  return message;
}

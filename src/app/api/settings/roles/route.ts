import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Settings → Roles & permissions. The write side of the matrix 0034/0035 built.
 *
 * No role check in this file, on purpose and for the same reason as the rest of
 * the API: the caller's own cookie-bound client is used, so the `team.manage`
 * policies on public.roles and public.role_permissions answer the question. A
 * member without that permission writes nothing and is told so in words.
 *
 * Two rules here are enforced by trigger rather than by policy, so this route
 * cannot weaken them even by accident (0034):
 *
 *   - the Owner role cannot be renamed, deleted, or have a grant removed
 *   - only somebody who is already an owner may hand out the Owner role
 *
 * Both surface as a raised exception, which `friendly()` turns into the sentence
 * the operator needs rather than a Postgres error code.
 */

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: permissions }, { data: roles }, { data: grants }, { data: members }] =
    await Promise.all([
      sb.from("permissions")
        .select("key, label, description, category, sort_order")
        .order("sort_order"),
      sb.from("roles")
        .select("id, name, description, is_system, legacy_role, created_at")
        .order("is_system", { ascending: false })
        .order("name"),
      sb.from("role_permissions").select("role_id, permission"),
      sb.from("profiles")
        .select("id, full_name, role, role_id, is_active")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  // What the CALLER may do, from the same tables the policies read (0036). The
  // page renders read-only rather than offering controls that will 403 — the
  // exact failure the whole gating pass exists to remove.
  const { data: mine } = await sb.rpc("my_permissions");
  const canManage = (mine as string[] | null)?.includes("team.manage") ?? false;

  return NextResponse.json({
    permissions: permissions ?? [],
    roles: roles ?? [],
    grants: grants ?? [],
    members: members ?? [],
    can_manage: canManage,
    my_permissions: (mine as string[] | null) ?? [],
  });
}

/** Create a role. It starts with no permissions — grants are a second step. */
export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; description?: string };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Give the role a name." }, { status: 400 });

  const { data, error } = await sb
    .from("roles")
    .insert({
      org_id: me.org_id,
      name: name.slice(0, 60),
      description: String(body.description ?? "").trim().slice(0, 300) || null,
      // Every new role sits at the bottom tier. legacy_role is the bridge to the
      // old app_role column, and a new role must not silently confer ownership.
      legacy_role: "sales_agent",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "grant" | "rename" | "assign";
    role_id?: string;
    permission?: string;
    granted?: boolean;
    name?: string;
    description?: string;
    profile_id?: string;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (body.action === "grant") {
    if (!body.role_id || !body.permission) {
      return NextResponse.json({ error: "Missing role or permission." }, { status: 400 });
    }
    const { error } = body.granted
      ? await sb.from("role_permissions")
          .upsert({ role_id: body.role_id, permission: body.permission })
      : await sb.from("role_permissions").delete()
          .eq("role_id", body.role_id).eq("permission", body.permission);

    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename") {
    if (!body.role_id) return NextResponse.json({ error: "Missing role." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 60);
    if (body.description !== undefined) {
      patch.description = String(body.description).trim().slice(0, 300) || null;
    }
    const { error } = await sb.from("roles").update(patch).eq("id", body.role_id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "assign") {
    if (!body.profile_id || !body.role_id) {
      return NextResponse.json({ error: "Missing member or role." }, { status: 400 });
    }
    // profiles.role (the old tier) is NOT set here. The sync trigger from 0034
    // derives it from the role, so a route that also wrote it could disagree
    // with the role it just assigned.
    const { error } = await sb
      .from("profiles")
      .update({ role_id: body.role_id })
      .eq("id", body.profile_id);
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/**
 * Delete a role.
 *
 * profiles.role_id is ON DELETE SET NULL, so anybody holding it falls back to
 * their old tier rather than losing access (0034). The count is returned so the
 * page can say who was affected instead of the deletion being silent.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { count } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id);

  const { data, error } = await sb.from("roles").delete().eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { error: "Not found, or you do not have permission to delete it." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true, released: count ?? 0 });
}

/**
 * The three failures an operator can actually cause, in words they can act on.
 * The trigger messages from 0034 are already written for a human, so they are
 * passed through rather than rewritten.
 */
function friendly(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You do not have permission to manage roles.";
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return "A role with that name already exists.";
  }
  return message;
}

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { invalidateLlmCache } from "@/lib/llm/resolve";
import { testConnection } from "@/lib/deepseek/client";
import { isSupervisor } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Settings → Model. Per-workspace provider, model and API key.
 *
 * The key is never returned by this route, at any point, in any shape. It goes
 * in through set_llm_key() into Vault and comes back only as a four-character
 * hint. A route that can echo a secret is one refactor away from a route that
 * leaks one, so the capability simply does not exist here.
 */

const MODELS: Record<string, string[]> = {
  deepseek: ["deepseek-chat"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-5"],
  custom: [],
};

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const { data: providers } = await sb
    .from("llm_providers")
    // secret_id is deliberately absent. It is only a pointer, but there is no
    // reason for it to reach a browser.
    .select("id, provider, label, model, base_url, key_hint, is_active, max_tokens, temperature, updated_at")
    .order("is_active", { ascending: false })
    .order("created_at");

  const workspace = (providers ?? []).map((p) => ({ ...p, source: "workspace" as const }));
  const workspaceActive = workspace.some((p) => p.is_active);

  /*
   * The environment-configured model, as a real entry.
   *
   * This used to be a boolean the page turned into "No workspace model
   * configured", under an empty list. That is accurate to the database and
   * wrong about reality: the agent was connected, answering customers, on a
   * working key — and the screen said it was not set up. Anyone shown that
   * screen concludes the product is broken.
   *
   * So the deployment key is listed like any other provider, marked active when
   * nothing overrides it, with the same four-character hint. It is read-only
   * here because it lives in the deployment's environment, not in this
   * workspace's settings.
   */
  const envKey = process.env.DEEPSEEK_API_KEY;
  const deployment =
    envKey && isSupervisor(me?.role)
      ? {
          id: "deployment",
          provider: "deepseek",
          label: "Deployment key",
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          base_url: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
          // Same masking rule as a Vault-stored key. Enough to tell two keys
          // apart, useless to anyone who copies it.
          key_hint: `...${envKey.slice(-4)}`,
          is_active: !workspaceActive,
          max_tokens: 700,
          temperature: 0.3,
          source: "environment" as const,
          updated_at: null,
        }
      : null;

  return NextResponse.json({
    providers: deployment ? [...workspace, deployment] : workspace,
    models: MODELS,
    envFallback: Boolean(envKey),
    /** True when SOMETHING will answer a customer — workspace key or env key. */
    connected: Boolean(workspaceActive || envKey),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    provider?: string; model?: string; label?: string; base_url?: string; api_key?: string;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const provider = String(body.provider ?? "");
  if (!(provider in MODELS)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const model = String(body.model ?? "").trim();
  if (!model) return NextResponse.json({ error: "Pick a model." }, { status: 400 });

  const { data: created, error } = await sb
    .from("llm_providers")
    .insert({
      org_id: me.org_id,
      provider,
      model: model.slice(0, 120),
      label: body.label ? String(body.label).slice(0, 80) : null,
      base_url: body.base_url ? String(body.base_url).slice(0, 300) : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: /row-level security/i.test(error?.message ?? "")
          ? "Only a supervisor can configure the model."
          : error?.message ?? "Could not save." },
      { status: 403 }
    );
  }

  if (body.api_key?.trim()) {
    const { error: keyErr } = await sb.rpc("set_llm_key", {
      p_provider_id: created.id,
      p_key: body.api_key.trim(),
    });
    if (keyErr) {
      // Without a key the row is useless and cannot be activated; leaving it
      // behind would show as a broken half-configured provider.
      await sb.from("llm_providers").delete().eq("id", created.id);
      return NextResponse.json({ error: keyErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "activate" | "update" | "key" | "test";
    id?: string;
    api_key?: string;
    model?: string;
    label?: string;
    base_url?: string;
    max_tokens?: number;
    temperature?: number;
  };

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Live check of whatever is actually resolving for this workspace. No id
  // needed — the question is "will a customer get an answer right now", and
  // that is decided by resolveLlm(), not by whichever row was clicked.
  if (body.action === "test") {
    const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });
    return NextResponse.json(await testConnection(me.org_id));
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // The deployment entry is a view of the environment, not a row. Editing it
  // here would silently do nothing, which is worse than saying so.
  if (body.id === "deployment") {
    return NextResponse.json(
      {
        error:
          "That's the deployment's own key from the server environment — it can't be edited here. Add a model above to use your own key for this workspace instead.",
      },
      { status: 400 }
    );
  }

  if (body.action === "key") {
    const { data, error } = await sb.rpc("set_llm_key", {
      p_provider_id: body.id,
      p_key: String(body.api_key ?? ""),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    invalidateLlmCache();
    return NextResponse.json({ ok: true, key_hint: (data as { key_hint?: string })?.key_hint });
  }

  if (body.action === "activate") {
    const { data: target } = await sb
      .from("llm_providers").select("id, key_hint").eq("id", body.id).maybeSingle();
    if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (!target.key_hint) {
      return NextResponse.json(
        { error: "Add an API key before making this the active model." },
        { status: 400 }
      );
    }

    // llm_providers_one_active is a partial unique index, so the old active row
    // must be stood down in a separate statement before this one is promoted.
    await sb.from("llm_providers").update({ is_active: false }).neq("id", body.id);
    const { error } = await sb.from("llm_providers").update({ is_active: true }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    invalidateLlmCache();
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update") {
    const { error } = await sb
      .from("llm_providers")
      .update({
        ...(body.model ? { model: String(body.model).slice(0, 120) } : {}),
        ...(body.label !== undefined ? { label: String(body.label).slice(0, 80) || null } : {}),
        ...(body.base_url !== undefined ? { base_url: String(body.base_url).slice(0, 300) || null } : {}),
        ...(body.max_tokens !== undefined ? { max_tokens: clamp(Number(body.max_tokens), 64, 8000, 700) } : {}),
        ...(body.temperature !== undefined
          ? { temperature: Math.min(2, Math.max(0, Number(body.temperature) || 0.3)) }
          : {}),
      })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    invalidateLlmCache();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === "deployment") {
    return NextResponse.json(
      { error: "The deployment key lives in the server environment and can't be removed from here." },
      { status: 400 }
    );
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("llm_providers").delete().eq("id", id).select("id, is_active").maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
  }
  invalidateLlmCache();
  // Deleting the active provider drops the workspace back to the deployment's
  // env key rather than to silence — resolveLlm() falls through by design.
  return NextResponse.json({ ok: true, wasActive: data.is_active });
}

function clamp(n: number, lo: number, hi: number, dflt: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

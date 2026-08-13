import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLlm, type ResolvedLlm } from "@/lib/llm/resolve";

/**
 * DeepSeek, OpenAI and any OpenAI-compatible endpoint all speak the same wire
 * format, so one SDK with the base URL overridden covers every provider the
 * settings page offers. No per-provider adapter, no separate library.
 *
 * Anthropic is the exception and is handled below — its Messages API differs
 * enough that pretending otherwise would fail at the first system prompt.
 *
 * Avoid reasoning models here (`deepseek-reasoner`, `o1`): they emit a long
 * trace before any answer and cannot meet the reply-path latency budget
 * (PRD v2 §4.1).
 */
function clientFor(llm: ResolvedLlm) {
  return new OpenAI({ apiKey: llm.apiKey, baseURL: llm.baseUrl });
}

/** @deprecated Kept so existing imports keep compiling; prefer resolveLlm(). */
export const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

/** A6: 20s ceiling, one retry, then the caller falls back to a human handoff. */
export const AI_TIMEOUT_MS = 20_000;

interface RunOpts {
  purpose: string;
  orgId?: string | null;
  chatId?: string | null;
  messages: OpenAI.ChatCompletionMessageParam[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Single entry point for every model call, so that latency, tokens and failures
 * always land in `ai_runs`. Without this table a DeepSeek outage is invisible
 * — the bot just goes quiet (A6).
 */
export async function runModel(opts: RunOpts): Promise<string | null> {
  const started = Date.now();
  let attempt = 0;
  let lastErr: unknown = null;

  const llm = await resolveLlm(opts.orgId);
  if (!llm) {
    await logRun(opts, Date.now() - started, false, "no model configured", {}, "unconfigured");
    return null;
  }

  // Per-call limits still win: the extractor needs temperature 0 whatever the
  // workspace prefers, because a creative JSON extractor is a broken one. The
  // workspace value is the DEFAULT, not an override.
  const temperature = opts.temperature ?? llm.temperature;
  const maxTokens = opts.maxTokens ?? llm.maxTokens;

  while (attempt < 2) {
    attempt++;
    try {
      const text =
        llm.provider === "anthropic"
          ? await runAnthropic(llm, opts, temperature, maxTokens)
          : await runOpenAiCompatible(llm, opts, temperature, maxTokens);

      await logRun(opts, Date.now() - started, true, null, text.usage, llm.model);
      return text.content;
    } catch (err) {
      lastErr = err;
      if (attempt >= 2) break;
    }
  }

  await logRun(opts, Date.now() - started, false, String(lastErr), {}, llm.model);
  return null;
}

interface ModelResult {
  content: string | null;
  usage: { prompt?: number; output?: number };
}

async function runOpenAiCompatible(
  llm: ResolvedLlm,
  opts: RunOpts,
  temperature: number,
  maxTokens: number
): Promise<ModelResult> {
  const res = await clientFor(llm).chat.completions.create(
    {
      model: llm.model,
      messages: opts.messages,
      temperature,
      max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    },
    { timeout: AI_TIMEOUT_MS }
  );

  return {
    content: res.choices[0]?.message?.content ?? null,
    usage: { prompt: res.usage?.prompt_tokens, output: res.usage?.completion_tokens },
  };
}

/**
 * Anthropic's Messages API, over fetch.
 *
 * Two differences that matter and cannot be papered over by a base-URL swap:
 * the system prompt is a top-level field rather than a message with
 * role:"system", and there is no response_format — JSON mode is requested by
 * prefilling the assistant turn with "{", which the model then completes. The
 * "{" has to be put back on the front of the response, because the model
 * continues from it rather than repeating it.
 */
async function runAnthropic(
  llm: ResolvedLlm,
  opts: RunOpts,
  temperature: number,
  maxTokens: number
): Promise<ModelResult> {
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n\n");

  const messages = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : "",
    }));

  if (opts.json) messages.push({ role: "assistant", content: "{" });

  const res = await fetch(`${llm.baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": llm.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: llm.model, system, messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: { text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const raw = json.content?.map((c) => c.text ?? "").join("") ?? "";

  return {
    content: opts.json ? `{${raw}` : raw,
    usage: { prompt: json.usage?.input_tokens, output: json.usage?.output_tokens },
  };
}

/**
 * Proves the configured model actually answers, rather than asserting it.
 *
 * A settings page that says "Connected" because a key is non-empty is a page
 * that says "Connected" while the key is revoked, the balance is zero, or the
 * base URL points at nothing. This makes the smallest real call the provider
 * accepts and reports what came back.
 */
export async function testConnection(orgId?: string | null): Promise<{
  ok: boolean;
  provider?: string;
  model?: string;
  source?: "workspace" | "deployment";
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  const llm = await resolveLlm(orgId);
  if (!llm) {
    return { ok: false, latencyMs: 0, error: "No model is configured." };
  }

  const meta = {
    provider: llm.provider,
    model: llm.model,
    source: llm.isFallback ? ("deployment" as const) : ("workspace" as const),
  };

  try {
    const opts: RunOpts = {
      purpose: "connection_test",
      orgId,
      // One token out of a one-word prompt: enough to exercise auth, the base
      // URL and the model name, cheap enough to run on every page load.
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      maxTokens: 5,
      temperature: 0,
    };

    const res =
      llm.provider === "anthropic"
        ? await runAnthropic(llm, opts, 0, 5)
        : await runOpenAiCompatible(llm, opts, 0, 5);

    return {
      ok: Boolean(res.content !== null),
      ...meta,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      ...meta,
      latencyMs: Date.now() - started,
      error: friendlyProviderError(err),
    };
  }
}

/** Provider errors are verbose and mostly JSON. Say the useful part. */
function friendlyProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/401|unauthor|invalid_api_key|authentication/i.test(raw)) {
    return "The API key was rejected. Check it hasn't been revoked or rotated.";
  }
  if (/402|insufficient|balance|quota|credit/i.test(raw)) {
    return "The provider reports no remaining balance or quota on this key.";
  }
  if (/404|model.*not.*found|unknown model/i.test(raw)) {
    return "The provider doesn't recognise that model name.";
  }
  if (/429|rate.?limit/i.test(raw)) {
    return "Rate limited by the provider — the key works, but it's being throttled.";
  }
  if (/timeout|aborted|ETIMEDOUT/i.test(raw)) {
    return "The provider didn't respond in time.";
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed/i.test(raw)) {
    return "Couldn't reach the provider — check the base URL and network access.";
  }
  return raw.slice(0, 200);
}

async function logRun(
  opts: RunOpts,
  latencyMs: number,
  ok: boolean,
  error: string | null,
  usage: { prompt?: number; output?: number },
  model = MODEL
) {
  try {
    await supabaseAdmin().from("ai_runs").insert({
      org_id: opts.orgId ?? null,
      chat_id: opts.chatId ?? null,
      // The model that actually ran, not the deployment default — otherwise a
      // workspace on GPT-4o has its failures logged as deepseek-chat and the
      // ai_runs table becomes useless for working out which provider is flaky.
      model,
      purpose: opts.purpose,
      latency_ms: latencyMs,
      prompt_tokens: usage.prompt ?? null,
      output_tokens: usage.output ?? null,
      succeeded: ok,
      error,
    });
  } catch {
    // Telemetry must never break the reply path.
  }
}

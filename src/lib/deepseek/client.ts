import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * DeepSeek is OpenAI-SDK compatible, so we reuse the official client with the
 * base URL overridden. No separate library needed.
 *
 * Always `deepseek-chat`. `deepseek-reasoner` emits a long reasoning trace
 * before any answer and cannot meet the reply-path latency budget (PRD v2 §4.1).
 */
export function deepseek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

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

  while (attempt < 2) {
    attempt++;
    try {
      const res = await deepseek().chat.completions.create(
        {
          model: MODEL,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 700,
          ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
        },
        { timeout: AI_TIMEOUT_MS }
      );

      const text = res.choices[0]?.message?.content ?? null;
      await logRun(opts, Date.now() - started, true, null, {
        prompt: res.usage?.prompt_tokens,
        output: res.usage?.completion_tokens,
      });
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt >= 2) break;
    }
  }

  await logRun(opts, Date.now() - started, false, String(lastErr), {});
  return null;
}

async function logRun(
  opts: RunOpts,
  latencyMs: number,
  ok: boolean,
  error: string | null,
  usage: { prompt?: number; output?: number }
) {
  try {
    await supabaseAdmin().from("ai_runs").insert({
      org_id: opts.orgId ?? null,
      chat_id: opts.chatId ?? null,
      model: MODEL,
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

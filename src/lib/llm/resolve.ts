import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Which model answers this workspace's customers, and with whose key.
 *
 * Until 0022 the provider was a property of the DEPLOYMENT — one env var, one
 * key, one bill shared by every tenant, and no way to change a model without a
 * redeploy. Now it is a property of the workspace, resolved per request.
 *
 * The env vars remain as the fallback, which matters more than it looks: an
 * existing workspace that never opens the new settings page keeps working
 * exactly as before. A migration that requires configuration before the product
 * functions again is an outage.
 */

export interface ResolvedLlm {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  /** True when this came from env rather than the workspace's own settings. */
  isFallback: boolean;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

/**
 * Cached briefly, keyed by org.
 *
 * This is on the reply path and would otherwise be a Vault decrypt on every
 * single model call — two or three per inbound message. Thirty seconds is short
 * enough that rotating a key takes effect while the operator is still looking
 * at the screen, and long enough that a busy workspace is not decrypting the
 * same secret hundreds of times a minute.
 *
 * A Map, not a single slot: the previous settings cache held one entry keyed by
 * orgId, so two active workspaces evicted each other on every message and the
 * cache had a hit rate close to zero.
 */
const cache = new Map<string, { value: ResolvedLlm; at: number }>();
const TTL_MS = 30_000;
/** Bounded so a long-lived server with many tenants cannot grow this forever. */
const MAX_ENTRIES = 200;

export function invalidateLlmCache(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}

export async function resolveLlm(orgId?: string | null): Promise<ResolvedLlm | null> {
  if (orgId) {
    const hit = cache.get(orgId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    try {
      const { data, error } = await supabaseAdmin().rpc("get_active_llm", {
        p_org_id: orgId,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row?.api_key) {
        const value: ResolvedLlm = {
          provider: row.provider,
          model: row.model,
          baseUrl: row.base_url || DEFAULT_BASE_URLS[row.provider] || DEFAULT_BASE_URLS.deepseek,
          apiKey: row.api_key,
          maxTokens: row.max_tokens ?? 700,
          temperature: Number(row.temperature ?? 0.3),
          isFallback: false,
        };
        if (cache.size >= MAX_ENTRIES) cache.clear();
        cache.set(orgId, { value, at: Date.now() });
        return value;
      }
    } catch (err) {
      // A Vault or RPC failure must not take the bot down when a perfectly good
      // env key exists. Fall through.
      console.error("[llm] resolve failed, falling back to env", err);
    }
  }

  const envKey = process.env.DEEPSEEK_API_KEY;
  if (!envKey) return null;

  return {
    provider: "deepseek",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URLS.deepseek,
    apiKey: envKey,
    maxTokens: 700,
    temperature: 0.3,
    isFallback: true,
  };
}

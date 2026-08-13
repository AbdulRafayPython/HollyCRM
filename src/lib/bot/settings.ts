import { supabaseAdmin } from "@/lib/supabase/admin";

/** Mirror of public.bot_settings with defaults applied. */
export interface BotSettings {
  enabled: boolean;
  bot_name: string;
  greeting_enabled: boolean;
  greeting_en: string | null;
  greeting_ar: string | null;
  custom_instructions: string;
  group_keywords: string[];
  handoff_keywords: string[];
  group_cooldown_seconds: number;
  group_daily_cap: number;
  /** Answer greetings and thanks at any point, not only on first contact (0018). */
  smalltalk_enabled: boolean;
  smalltalk_cooldown_seconds: number;
  /** Branch switches the workflow canvas toggles directly (0024). */
  knowledge_enabled: boolean;
  inventory_enabled: boolean;
  /** Routing (0021). */
  auto_assign_enabled: boolean;
  presence_timeout_seconds: number;
  assign_outside_region: boolean;
  fallback_message_en: string | null;
  fallback_message_ar: string | null;
}

export const BOT_DEFAULTS: BotSettings = {
  enabled: true,
  // Generic on purpose: the product is not one company's CRM. Each workspace
  // renames its assistant in Settings → AI.
  bot_name: "AI Assistant",
  greeting_enabled: true,
  greeting_en: null,
  greeting_ar: null,
  custom_instructions: "",
  group_keywords: [
    "hotel", "hotels", "room", "rooms", "rate", "rates", "price", "prices",
    "quote", "booking", "available", "availability", "makkah", "mecca",
    "madinah", "medina", "haram", "distance",
    "فندق", "فنادق", "غرفة", "غرف", "سعر", "أسعار", "حجز", "الحرم", "متاح",
  ],
  handoff_keywords: ["discount", "manager", "human", "خصم"],
  group_cooldown_seconds: 60,
  group_daily_cap: 10,
  smalltalk_enabled: true,
  smalltalk_cooldown_seconds: 45,
  knowledge_enabled: true,
  inventory_enabled: true,
  auto_assign_enabled: true,
  presence_timeout_seconds: 120,
  assign_outside_region: true,
  fallback_message_en: null,
  fallback_message_ar: null,
};

/**
 * Settings are read on every inbound message, so they're cached briefly.
 * The throttle values are ALSO read inside bot_gate() in SQL — this object
 * feeds the Node-side decisions (keywords, greeting, prompt), the SQL gate
 * feeds the atomic ones (cooldown, cap, kill switch).
 *
 * A Map, not a single slot. This used to be one `{ orgId, value, at }` object,
 * which is a cache of size one keyed by tenant: with two workspaces active at
 * once, every message evicted the other's entry and the hit rate collapsed to
 * roughly zero — the cache was costing a comparison and buying nothing. On a
 * single-tenant demo it looked like it worked, which is why it survived.
 */
const cache = new Map<string, { value: BotSettings; at: number }>();
const TTL_MS = 30_000;
/** Bounded, so a long-lived server serving many workspaces cannot grow this
 *  without limit. Clearing wholesale beats tracking an LRU for ~200 small rows. */
const MAX_ENTRIES = 200;

export async function getBotSettings(orgId: string): Promise<BotSettings> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const { data } = await supabaseAdmin()
      .from("bot_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    const value: BotSettings = data
      ? {
          ...BOT_DEFAULTS,
          ...data,
          group_keywords: data.group_keywords?.length ? data.group_keywords : BOT_DEFAULTS.group_keywords,
          handoff_keywords: data.handoff_keywords ?? BOT_DEFAULTS.handoff_keywords,
        }
      : BOT_DEFAULTS;
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(orgId, { value, at: Date.now() });
    return value;
  } catch {
    return BOT_DEFAULTS;
  }
}

/** Drop one workspace's cached settings, or all of them. */
export function invalidateBotSettingsCache(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}

/** Case-insensitive whole-ish word match for user-configured keyword lists. */
export function matchesKeyword(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}

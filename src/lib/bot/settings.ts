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
};

/**
 * Settings are read on every inbound message, so they're cached briefly.
 * The throttle values are ALSO read inside bot_gate() in SQL — this object
 * feeds the Node-side decisions (keywords, greeting, prompt), the SQL gate
 * feeds the atomic ones (cooldown, cap, kill switch).
 */
let cache: { orgId: string; value: BotSettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getBotSettings(orgId: string): Promise<BotSettings> {
  if (cache && cache.orgId === orgId && Date.now() - cache.at < TTL_MS) return cache.value;

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
    cache = { orgId, value, at: Date.now() };
    return value;
  } catch {
    return BOT_DEFAULTS;
  }
}

export function invalidateBotSettingsCache() {
  cache = null;
}

/** Case-insensitive whole-ish word match for user-configured keyword lists. */
export function matchesKeyword(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}

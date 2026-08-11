/**
 * Environment configuration checks.
 *
 * Missing config is a normal state during setup, not an exception — a bare
 * "URL and Key are required" stack trace from deep inside a Supabase client
 * tells you nothing about which variable to set. These helpers let the app
 * degrade into a setup screen instead.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isSet = (v: string | undefined) =>
  Boolean(v && v.trim() && !v.startsWith("<") && !v.includes("xxxxxxxx"));

/** True when the browser/server Supabase clients can actually be constructed. */
export function isSupabaseConfigured(): boolean {
  return isSet(SUPABASE_URL) && isSet(SUPABASE_ANON_KEY) && /^https?:\/\//.test(SUPABASE_URL!);
}

export interface EnvStatus {
  key: string;
  ok: boolean;
  required: "supabase" | "green" | "deepseek" | "demo";
  note: string;
}

/** Full picture for the /setup screen. */
export function envStatus(): EnvStatus[] {
  return [
    { key: "NEXT_PUBLIC_SUPABASE_URL", ok: isSet(SUPABASE_URL), required: "supabase",
      note: "Supabase → Project Settings → API → Project URL" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: isSet(SUPABASE_ANON_KEY), required: "supabase",
      note: "Same page → anon / public key" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", ok: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY), required: "supabase",
      note: "Same page → service_role key. Server-side only." },
    { key: "DEMO_ORG_ID", ok: isSet(process.env.DEMO_ORG_ID), required: "demo",
      note: "The org id printed by 0002_demo_seed.sql" },
    { key: "DEEPSEEK_API_KEY", ok: isSet(process.env.DEEPSEEK_API_KEY), required: "deepseek",
      note: "platform.deepseek.com → API keys" },
    { key: "GREEN_API_BASE_URL", ok: isSet(process.env.GREEN_API_BASE_URL), required: "green",
      note: "Console → apiUrl, e.g. https://7107.api.greenapi.com (per-instance host)" },
    { key: "GREEN_API_ID_INSTANCE", ok: isSet(process.env.GREEN_API_ID_INSTANCE), required: "green",
      note: "Green API console → idInstance" },
    { key: "GREEN_API_TOKEN", ok: isSet(process.env.GREEN_API_TOKEN), required: "green",
      note: "Green API console → API token" },
    { key: "GREEN_API_WEBHOOK_SECRET", ok: isSet(process.env.GREEN_API_WEBHOOK_SECRET), required: "green",
      note: "Any random string. Forms the webhook URL path." },
    { key: "GREEN_API_WEBHOOK_TOKEN", ok: isSet(process.env.GREEN_API_WEBHOOK_TOKEN), required: "green",
      note: "Must match webhookUrlToken in the Green API console." },
    { key: "GREEN_API_OWN_JID", ok: isSet(process.env.GREEN_API_OWN_JID), required: "green",
      note: "e.g. 9665XXXXXXXX@c.us — used to detect @mentions in groups" },
  ];
}

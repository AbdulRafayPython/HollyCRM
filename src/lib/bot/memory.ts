import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MemoryFact, Requirements } from "@/lib/deepseek/extract";

/**
 * Everything the bot durably knows about ONE person.
 *
 * The distinction that matters: booking slots (city, dates, party size) belong
 * to a lead and die with it, because next Ramadan's trip is a different trip.
 * What is here outlives every lead — a wheelchair user is still a wheelchair
 * user on their third booking, and asking again is how a CRM feels like a form.
 */
export interface PersonProfile {
  contactId: string | null;
  /** What to call them. Never a phone number — see displayName(). */
  name: string | null;
  language: Requirements["language"] | null;
  facts: MemoryFact[];
}

export const EMPTY_PROFILE: PersonProfile = {
  contactId: null,
  name: null,
  language: null,
  facts: [],
};

/** How many facts reach the prompt. Beyond this it stops being memory and
 *  starts being a dossier the model has to skim past to find the request. */
const MAX_FACTS_IN_PROMPT = 8;

export async function loadProfile(contactId: string | null): Promise<PersonProfile> {
  if (!contactId) return EMPTY_PROFILE;
  const db = supabaseAdmin();

  const [{ data: contact }, { data: facts }] = await Promise.all([
    db.from("contacts")
      .select("display_name, preferred_language")
      .eq("id", contactId)
      .maybeSingle(),
    db.from("contact_memory")
      .select("fact_key, fact_value")
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(MAX_FACTS_IN_PROMPT),
  ]);

  return {
    contactId,
    name: displayName(contact?.display_name ?? null),
    language: (contact?.preferred_language as PersonProfile["language"]) ?? null,
    facts: (facts ?? []).map((f) => ({ key: f.fact_key, value: f.fact_value })),
  };
}

/**
 * A name we can actually address someone by, or null.
 *
 * WhatsApp fills senderName with the raw number when a contact has no pushname,
 * and "Hello +966512345678" is worse than no name at all. Anything that is
 * mostly digits is not a name.
 */
export function displayName(raw: string | null): string | null {
  const name = raw?.trim();
  if (!name) return null;
  const digits = (name.match(/\d/g) ?? []).length;
  if (digits > name.length / 2) return null;
  if (/^\+?\d[\d\s()-]*$/.test(name)) return null;
  // First name only. "Onais Rahman Al-Sheikh" is who they are; "Onais" is how
  // you talk to them.
  return name.split(/\s+/)[0].slice(0, 40);
}

/**
 * Writes back what this turn taught us about the person.
 *
 * Never fails the reply path: memory is an enhancement, and a customer waiting
 * on a quote should not be held up — let alone dropped — because a preference
 * could not be filed. Every write here is best-effort by design.
 */
export async function rememberPerson(
  orgId: string,
  contactId: string | null,
  update: { language?: Requirements["language"] | null; facts?: MemoryFact[] }
): Promise<void> {
  if (!contactId) return;
  const db = supabaseAdmin();

  try {
    if (update.language && update.language !== "other") {
      await db
        .from("contacts")
        .update({ preferred_language: update.language })
        .eq("id", contactId);
    }

    const facts = (update.facts ?? []).filter(
      (f) => f.key.trim() && f.value.trim() && !isSlotLike(f.key)
    );
    if (facts.length === 0) return;

    // Upsert on (contact_id, fact_key): a preference the customer restates in
    // different words REPLACES the old one rather than accumulating a second,
    // contradictory copy the model then has to choose between.
    await db.from("contact_memory").upsert(
      facts.map((f) => ({
        org_id: orgId,
        contact_id: contactId,
        fact_key: f.key.trim().toLowerCase().slice(0, 60),
        fact_value: f.value.trim().slice(0, 400),
        source: "bot" as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "contact_id,fact_key" }
    );
  } catch (err) {
    console.error("[memory] write failed", err);
  }
}

/**
 * Rejects facts that duplicate a typed slot.
 *
 * The extractor is told not to produce these, and does so anyway often enough
 * to matter — usually a helpful-looking {"key":"city","value":"Makkah"}. Letting
 * one through creates a second copy of the city with no merge rule, no
 * correction path and its own update clock, so a customer who switches to
 * Madinah gets searched correctly and then addressed as if they had not.
 */
function isSlotLike(key: string): boolean {
  return /^(city|check[_\s-]?(in|out)|dates?|pax|people|guests?|rooms?|room[_\s-]?config\w*|budget|price|stars?|min[_\s-]?stars|distance|nights?)$/i.test(
    key.trim()
  );
}

/** The person block that goes into a prompt, or null when we know nothing. */
export function describeProfile(profile: PersonProfile): string | null {
  const lines: string[] = [];
  if (profile.name) lines.push(`Name: ${profile.name}`);
  for (const f of profile.facts.slice(0, MAX_FACTS_IN_PROMPT)) {
    lines.push(`${f.key}: ${f.value}`);
  }
  return lines.length ? lines.join("\n") : null;
}

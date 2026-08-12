import { supabaseAdmin } from "@/lib/supabase/admin";
import { GreenQuotaError, sendText } from "@/lib/green/client";
import {
  extractRequirements, isSocial, type Intent, type Requirements,
} from "@/lib/deepseek/extract";
import {
  composeKnowledgeReply, composeReply, composeSocialReply, greetBackReply,
  holdingReply, introReply, noKnowledgeReply, noMatchReply, stalledReply,
  thanksReply, type ComposeContext,
} from "@/lib/deepseek/compose";
import { displayName, loadProfile, rememberPerson } from "./memory";
import { searchKnowledge } from "@/lib/knowledge/retrieve";
import { getBotSettings, matchesKeyword } from "./settings";
import type { HotelResult, LeadStage } from "@/lib/types";
import type { IngestResult } from "./ingest";

/**
 * How much of the thread the extractor sees.
 *
 * This used to be 6, which was the proximate cause of a bot that asked for the
 * city twice: by the time the customer answered a third clarifying question, the
 * message where they said "Makkah" had scrolled out of the window. The window is
 * wider now, but it is no longer load-bearing — slots are merged from the lead
 * row (mergeSlots) so a value survives regardless of how far back it was said.
 */
const HISTORY_MESSAGES = 12;

/**
 * How many times the bot may ask for the same missing slot before a human takes
 * over: once plainly, once rephrased into an easier question, then stop. A third
 * attempt has never yet produced an answer that the second one would not have.
 */
const MAX_CLARIFY_ATTEMPTS = 2;

/** The slots search_hotels() filters on — the bot's durable memory of a request. */
type Slots = Pick<
  Requirements,
  | "city" | "check_in" | "check_out" | "pax" | "rooms"
  | "room_configuration" | "max_price_per_night" | "max_distance_m" | "min_stars"
>;

const EMPTY_SLOTS: Slots = {
  city: null, check_in: null, check_out: null, pax: null, rooms: null,
  room_configuration: null, max_price_per_night: null, max_distance_m: null,
  min_stars: null,
};

export type SkipReason =
  | "bot_paused" | "bot_disabled" | "duplicate" | "empty_body" | "group_not_triggered"
  | "group_cooldown" | "group_daily_cap" | "chat_not_found" | "gate_error";

/**
 * Gate before any model call. Every early return here is a DeepSeek call we
 * don't pay for and a message we don't spam into a customer's group.
 *
 * The stateful half (kill switch, pause, auto-resume, cooldown, daily cap) is
 * ONE atomic SQL call — public.bot_gate() — which reads its limits from
 * bot_settings, i.e. whatever the user configured in Settings → AI Agent.
 * Node handles the stateless half: the group trigger keywords, also from
 * settings.
 */
export async function shouldReply(
  ing: IngestResult,
  orgId: string
): Promise<{ reply: true } | { reply: false; reason: SkipReason }> {
  if (ing.duplicate) return { reply: false, reason: "duplicate" };
  if (!ing.body?.trim()) return { reply: false, reason: "empty_body" };

  // Groups are passive-monitoring by default (PRD v2 §4.4).
  if (ing.isGroup) {
    const settings = await getBotSettings(orgId);
    const triggered = ing.mentionsBot || matchesKeyword(ing.body, settings.group_keywords);
    if (!triggered) return { reply: false, reason: "group_not_triggered" };
  }

  const { data, error } = await supabaseAdmin().rpc("bot_gate", { p_chat_id: ing.chatId });
  if (error || !data) return { reply: false, reason: "gate_error" };

  const gate = data as { allowed: boolean; reason: string };
  if (!gate.allowed) return { reply: false, reason: gate.reason as SkipReason };
  return { reply: true };
}

/**
 * The full bot loop: extract -> search (exact SQL) -> compose -> send.
 * Runs after the webhook has already returned 200.
 */
export async function runBot(ing: IngestResult, orgId: string, chatJid: string) {
  const db = supabaseAdmin();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

  const settings = await getBotSettings(orgId);

  // ---- 0. who is this? ----
  // Loaded before anything else, because it changes how the message is READ, not
  // just how it is answered: the extractor needs to know whose turn this is to
  // avoid picking up another group member's city, and it needs the language this
  // person actually writes in to stop a one-word reply flipping it.
  const profile = await loadProfile(ing.senderContactId);
  const speakerName = profile.name ?? displayName(ing.senderName);
  const history = await loadHistory(ing.chatId);

  // ---- 1. extract, then merge with what this lead already told us ----
  const fresh = await extractRequirements(ing.body, {
    orgId,
    chatId: ing.chatId,
    recent: history,
    today,
    speaker: speakerName,
    knownLanguage: profile.language,
    knownFacts: profile.facts,
  });

  const { slots: stored, attempts: priorAttempts } = await loadSlots(ing.leadId);
  const merged = mergeSlots(stored, fresh);
  const progressed = addedSomething(stored, merged);

  const intent = resolveIntent(fresh, progressed, priorAttempts, ing, settings);
  const req: Requirements = { ...fresh, ...merged, intent };

  // Memory is written on EVERY turn, including social ones — someone who says
  // "salam, my mother is in a wheelchair by the way" has just told us the single
  // most important thing about their booking, in a message with no slots in it.
  await rememberPerson(orgId, ing.senderContactId, {
    language: fresh.language,
    facts: fresh.memory_facts,
  });

  const ctx: ComposeContext = {
    orgId,
    chatId: ing.chatId,
    customerMessage: ing.body,
    isGroup: ing.isGroup,
    settings,
    speaker: { ...profile, name: speakerName },
    history,
  };

  // ---- 2. route on what the message actually IS ----

  // User-configured handoff keywords escalate even if the model missed it.
  // Both signals read the LATEST message only — `fresh.wants_human` is scoped to
  // it by the extractor prompt, because a request for a human three messages ago
  // must not re-fire the hand-off notice on every message after it.
  if (
    intent === "human_request" ||
    fresh.wants_human ||
    matchesKeyword(ing.body, settings.handoff_keywords)
  ) {
    return handoff(ing, orgId, chatJid, req, "requested_human", holdingReply(req.language));
  }

  if (isSocial(intent)) {
    return social(ing, orgId, chatJid, req, ctx, { priorAttempts, stored, settings });
  }

  if (intent === "other_question") {
    return answerFromKnowledge(ing, orgId, chatJid, req, ctx);
  }

  // ---- 3. search: exact SQL, never similarity (A3) ----
  let hotels: HotelResult[] = [];
  if (req.city && req.check_in && req.check_out) {
    const { data, error } = await db.rpc("search_hotels", {
      p_city: req.city,
      p_check_in: req.check_in,
      p_check_out: req.check_out,
      p_pax: req.pax ?? 2,
      // Null, NOT 1: the SQL derives the rooms this party needs per room type.
      // Defaulting to one room made every enquiry larger than a quad — "5 people"
      // — return nothing and get quoted "no availability" against inventory that
      // fits them in two rooms. Only pass a number the customer actually gave.
      p_rooms: req.rooms,
      p_max_price_per_night: req.max_price_per_night,
      p_max_distance_m: req.max_distance_m,
      p_min_stars: req.min_stars,
      p_shuttle_ok: true,
      // p_query_embedding omitted -> pure structured filtering. Works with zero
      // embeddings in the table, which is why the demo needs no embedding step.
      p_limit: 5,
    });
    if (!error && data) hotels = data as HotelResult[];
  } else {
    /*
     * Not enough information to search — ask rather than guess.
     *
     * Whether this is progress decides how hard we push. If the customer just
     * told us something new, the counter resets and they get a fresh, plainly
     * worded question. If they did not ("Dont know", or an answer to a different
     * question), the counter climbs and the ask changes shape — asking for a
     * night count instead of a second calendar date, then giving up and fetching
     * a human. Re-sending a question the customer has already failed to answer
     * is the one thing that reliably reads as broken.
     */
    const missing = missingSlots(req);
    // Progress resets the budget: a customer who is answering, even partially,
    // has not stalled and should not be rushed to a human.
    const attempts = progressed ? 1 : priorAttempts + 1;

    await advanceStage(ing.leadId, "new_inquiry", req, attempts);

    if (attempts > MAX_CLARIFY_ATTEMPTS) {
      // Third unanswered ask: fetch a human rather than send it.
      return handoff(
        ing, orgId, chatJid, req, "clarification_stalled", stalledReply(req.language)
      );
    }

    await deliver(ing, orgId, chatJid, clarifyAsk(missing, attempts, req, speakerName));
    return { sent: true, reason: "asked_for_missing_fields", attempts };
  }

  if (hotels.length === 0) {
    // Persist first. This path used to return without writing, so a city the
    // customer had just given was thrown away — and the next message started the
    // "which city?" interrogation over on a lead that had already been quoted.
    await advanceStage(ing.leadId, "requirements_gathered", req, 0);
    return handoff(
      ing, orgId, chatJid, req, "no_inventory_match", noMatchReply(req.language, req)
    );
  }

  // ---- 4. compose ----
  const alreadyQuoted = await previouslyQuotedNames(ing.leadId);
  const reply =
    (await composeReply(req, hotels, { ...ctx, previouslyQuoted: alreadyQuoted })) ??
    holdingReply(req.language);

  await deliver(ing, orgId, chatJid, reply);
  // A quote went out, so nothing is outstanding — clear the clarify counter.
  await advanceStage(ing.leadId, "quotation_sent", req, 0);
  await recordQuotedHotels(ing.leadId, hotels);

  // Record what was quoted, so the agent sees exactly what the customer got.
  if (ing.leadId) {
    await db.from("quotes").insert({
      org_id: orgId,
      lead_id: ing.leadId,
      by_bot: true,
      total_amount: hotels[0]?.total_price ?? null,
      currency: hotels[0]?.currency ?? "SAR",
      payload: { requirements: req, options: hotels },
      sent_at: new Date().toISOString(),
    });
  }

  return { sent: true, reason: "quoted", options: hotels.length };
}

/* ---------------------------------------------------------------------------
 * Intent routing
 * ------------------------------------------------------------------------ */

/**
 * Reconciles what the model called the message with what the conversation
 * state says it must be.
 *
 * The model is right about most messages and systematically wrong about two
 * kinds, both of which cost us a booking:
 *
 *   "Makkah"  — read as a place name with no request in it, when it is the
 *               answer to the question we asked ninety seconds ago.
 *   "Dont know" / "hmm" — read as chatter, when it is a customer failing to
 *               answer us and quietly running down the clarify budget that
 *               eventually fetches them a human.
 *
 * Both are caught by state the model does not have: whether this message moved
 * a slot, and whether a question of ours is outstanding.
 */
function resolveIntent(
  fresh: Requirements,
  progressed: boolean,
  priorAttempts: number,
  ing: IngestResult,
  settings: { smalltalk_enabled?: boolean }
): Intent {
  // A new requirement is unambiguous evidence, whatever the message looked like.
  if (progressed) return "hotel_inquiry";

  // Being @-mentioned in a group is a direct address. Treating it as chatter is
  // how the bot ignores the one message in a group that was unmistakably for it.
  if (ing.mentionsBot && fresh.intent === "smalltalk") return "other_question";

  // A shrug while we are waiting on an answer is a non-answer, not small talk —
  // it belongs on the clarify path so the budget advances and the chat
  // eventually reaches a human instead of stalling politely forever.
  // Greetings and thanks are exempt: those are social even mid-negotiation, and
  // answering them is the entire point of this change.
  if (priorAttempts > 0 && fresh.intent === "smalltalk") return "hotel_inquiry";

  // With social replies switched off, a greeting falls back to the old
  // behaviour rather than to silence-plus-an-unused-code-path.
  if (settings.smalltalk_enabled === false && isSocial(fresh.intent)) {
    return "smalltalk";
  }

  return fresh.intent;
}

/**
 * Answers a greeting, a thank-you or a pleasantry — at any point in the
 * conversation, which is the whole fix.
 *
 * Three things keep this from becoming spam. The reply is claimed atomically
 * (claim_smalltalk_reply, 0018) so a rally of "ok"/"thanks"/"👍" produces one
 * reply and not four, and so two concurrent webhooks cannot both send one. The
 * lead is not advanced and the clarify counter is not touched — saying hello is
 * not progress and not a stall. And groups still require the bot to be
 * addressed, because a group is passive-monitored by default (PRD v2 §4.4) and
 * a bot that greets every hello in a fifty-person coordination group is worse
 * than one that never speaks.
 */
async function social(
  ing: IngestResult,
  orgId: string,
  chatJid: string,
  req: Requirements,
  ctx: ComposeContext,
  state: { priorAttempts: number; stored: Slots; settings: { smalltalk_enabled: boolean } }
) {
  if (ing.isGroup && !ing.mentionsBot) {
    return { sent: false, reason: "group_social_ignored" };
  }

  const db = supabaseAdmin();

  // First contact keeps the configured welcome, and is checked BEFORE the
  // small-talk switch. The two settings answer different questions — "do you
  // introduce yourself to a new customer?" and "do you answer hello from
  // someone you're already talking to?" — and a workspace that wants only the
  // first must not lose it by switching off the second.
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", ing.chatId)
    .eq("sender_type", "bot");
  const isFirstContact = (count ?? 0) === 0;

  if (isFirstContact && ctx.settings?.greeting_enabled) {
    const { data: claimedIntro } = await db.rpc("claim_smalltalk_reply", {
      p_chat_id: ing.chatId,
    });
    if (!claimedIntro) return { sent: false, reason: "smalltalk_cooldown" };
    await deliver(ing, orgId, chatJid, introReply(req.language, ctx.settings));
    return { sent: true, reason: "greeted_first_contact" };
  }

  if (!state.settings.smalltalk_enabled) {
    return { sent: false, reason: "smalltalk_disabled" };
  }

  const { data: claimed } = await db.rpc("claim_smalltalk_reply", { p_chat_id: ing.chatId });
  if (!claimed) return { sent: false, reason: "smalltalk_cooldown" };

  const reply =
    (await composeSocialReply(req, {
      ...ctx,
      // What the bot is still waiting on, so a greeting can carry the question
      // forward instead of resetting the conversation to nothing.
      outstandingQuestion:
        state.priorAttempts > 0 ? describeMissing(missingSlots(req), req) : null,
      openEnquiry: describeEnquiry(state.stored),
    })) ??
    (req.intent === "thanks"
      ? thanksReply(req.language)
      : greetBackReply(req.language, ctx.speaker?.name));

  await deliver(ing, orgId, chatJid, reply);
  return { sent: true, reason: `answered_${req.intent}` };
}

/**
 * Answers a non-booking question from the workspace's uploaded documents.
 *
 * Before the knowledge base existed, every one of these — visa, transport,
 * payment terms, cancellation — was either ignored or answered from the model's
 * own memory of Saudi travel rules, which is confidently out of date. Now it is
 * answered from what the agency actually uploaded, or handed to a human. There
 * is no third option, and that is the point.
 */
async function answerFromKnowledge(
  ing: IngestResult,
  orgId: string,
  chatJid: string,
  req: Requirements,
  ctx: ComposeContext
) {
  if (ing.isGroup && !ing.mentionsBot) {
    return { sent: false, reason: "group_question_ignored" };
  }

  const hits = await searchKnowledge(orgId, ing.body);
  if (hits.length === 0) {
    // Nothing documented. A human answers, and the customer is told so rather
    // than being left to wonder whether the message arrived.
    return handoff(
      ing, orgId, chatJid, req, "no_knowledge_match", noKnowledgeReply(req.language)
    );
  }

  const reply = await composeKnowledgeReply(req, { ...ctx, knowledge: hits });
  if (!reply) {
    return handoff(
      ing, orgId, chatJid, req, "knowledge_compose_failed", holdingReply(req.language)
    );
  }

  await deliver(ing, orgId, chatJid, reply);
  return { sent: true, reason: "answered_from_knowledge", sources: hits.length };
}

/* ---------------------------------------------------------------------------
 * Conversation history
 * ------------------------------------------------------------------------ */

/**
 * The recent thread, with every speaker named.
 *
 * This used to render as "Customer:" for everyone, which in a group meant five
 * people's requirements arrived at the extractor as one person changing their
 * mind repeatedly. Names are resolved in a second query rather than an embedded
 * join: the FK constraint name that PostgREST would need for the embed is not
 * something this code should be coupled to, and the id list is at most a dozen
 * entries.
 */
async function loadHistory(chatId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const { data: recent } = await db
    .from("messages")
    .select("sender_type, body, sender_contact_id")
    .eq("chat_id", chatId)
    .order("wa_timestamp", { ascending: false })
    .limit(HISTORY_MESSAGES);

  const rows = (recent ?? []).reverse().filter((m) => m.body);
  if (rows.length === 0) return [];

  const ids = [
    ...new Set(rows.map((m) => m.sender_contact_id).filter((id): id is string => Boolean(id))),
  ];

  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await db.from("contacts").select("id, display_name").in("id", ids);
    for (const c of data ?? []) {
      const n = displayName(c.display_name);
      if (n) names.set(c.id, n);
    }
  }

  return rows.map((m) => {
    const who =
      m.sender_type === "client"
        ? (m.sender_contact_id ? names.get(m.sender_contact_id) : null) ?? "Customer"
        : m.sender_type === "agent"
          ? "You (a colleague)"
          : "You";
    return `${who}: ${m.body}`;
  });
}

/** Hotels this lead has already been shown, newest first. */
async function previouslyQuotedNames(leadId: string | null): Promise<string[]> {
  if (!leadId) return [];
  const { data } = await supabaseAdmin()
    .from("leads")
    .select("quoted_hotel_ids")
    .eq("id", leadId)
    .maybeSingle();

  const ids = (data?.quoted_hotel_ids ?? []) as string[];
  if (ids.length === 0) return [];

  const { data: hotels } = await supabaseAdmin()
    .from("hotels")
    .select("name")
    .in("id", ids.slice(-8));
  return (hotels ?? []).map((h) => h.name);
}

/** Adds this turn's options to the lead's "already seen" set. */
async function recordQuotedHotels(leadId: string | null, hotels: HotelResult[]) {
  if (!leadId || hotels.length === 0) return;
  const db = supabaseAdmin();
  const { data } = await db
    .from("leads").select("quoted_hotel_ids").eq("id", leadId).maybeSingle();

  const merged = [
    ...new Set([...((data?.quoted_hotel_ids ?? []) as string[]), ...hotels.map((h) => h.hotel_id)]),
  ];
  // Capped: the list exists to stop repetition within one negotiation, and an
  // unbounded array on a long-running lead would eventually crowd the prompt.
  await db.from("leads").update({ quoted_hotel_ids: merged.slice(-20) }).eq("id", leadId);
}

/* ---------------------------------------------------------------------------
 * Slot memory
 *
 * The lead row is the only thing in this loop that outlives a single webhook, so
 * it is where "what the customer has told us" lives. Extraction proposes; the
 * lead remembers.
 * ------------------------------------------------------------------------ */

/** Reads the slots this lead has already accumulated. */
async function loadSlots(
  leadId: string | null
): Promise<{ slots: Slots; attempts: number }> {
  if (!leadId) return { slots: EMPTY_SLOTS, attempts: 0 };

  const { data } = await supabaseAdmin()
    .from("leads")
    // One string literal, not a concatenation: supabase-js infers the row type
    // from the select at the type level and gives up on anything it cannot read
    // statically.
    .select("city, min_stars, check_in_date, check_out_date, pax_count, rooms_count, room_configuration, budget_amount, max_distance_m, clarify_attempts")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return { slots: EMPTY_SLOTS, attempts: 0 };

  return {
    slots: {
      city: (data.city as Slots["city"]) ?? null,
      check_in: data.check_in_date ?? null,
      check_out: data.check_out_date ?? null,
      pax: data.pax_count ?? null,
      rooms: data.rooms_count ?? null,
      room_configuration: data.room_configuration ?? null,
      max_price_per_night: data.budget_amount ?? null,
      max_distance_m: data.max_distance_m ?? null,
      min_stars: data.min_stars ?? null,
    },
    attempts: data.clarify_attempts ?? 0,
  };
}

/**
 * Newly extracted values win; stored values fill the gaps.
 *
 * Correction has to work — "actually make it Madinah" must replace Makkah, not be
 * out-voted by memory — so a non-null fresh value always overwrites. A null fresh
 * value means "not mentioned in this message", never "cleared".
 */
function mergeSlots(stored: Slots, fresh: Slots): Slots {
  const out = { ...stored };
  for (const key of Object.keys(EMPTY_SLOTS) as Array<keyof Slots>) {
    if (fresh[key] !== null && fresh[key] !== undefined) {
      // Each key's fresh and stored types are identical; the loop erases that.
      (out[key] as Slots[keyof Slots]) = fresh[key];
    }
  }
  return out;
}

/** Did this message actually tell us something we did not already hold? */
function addedSomething(before: Slots, after: Slots): boolean {
  return (Object.keys(EMPTY_SLOTS) as Array<keyof Slots>).some(
    (key) => after[key] !== null && after[key] !== before[key]
  );
}

/** The three slots search_hotels() cannot run without. */
type RequiredSlot = "city" | "check_in" | "check_out";

function missingSlots(req: Requirements): RequiredSlot[] {
  const out: RequiredSlot[] = [];
  if (!req.city) out.push("city");
  if (!req.check_in) out.push("check_in");
  if (!req.check_out) out.push("check_out");
  return out;
}

const LABELS_EN: Record<RequiredSlot, string> = {
  city: "the city (Makkah or Madinah)",
  check_in: "your check-in date",
  check_out: "your check-out date",
};

const LABELS_AR: Record<RequiredSlot, string> = {
  city: "المدينة (مكة أو المدينة)",
  check_in: "تاريخ الوصول",
  check_out: "تاريخ المغادرة",
};

/** "a", "a and b", "a, b and c" — a list a person would actually say. */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The clarifying question, which must change every time it is asked.
 *
 * Attempt 1 asks plainly. Attempt 2 rephrases and, where it can, swaps the
 * question for an easier one: someone who cannot name a check-out date can
 * almost always say how many nights they are staying, and the extractor turns a
 * night count into a date. Attempt 3+ never reaches here — runBot hands the chat
 * to a human instead.
 */
function clarifyAsk(
  missing: RequiredSlot[],
  attempt: number,
  req: Requirements,
  name?: string | null
): string {
  const ar = req.language === "ar";
  const onlyCheckoutLeft =
    missing.length === 1 && missing[0] === "check_out" && Boolean(req.check_in);

  // In a group the question has to say who it is for, or four people read it and
  // three of them either ignore it or — worse — answer it.
  const who = name ? (ar ? `${name}، ` : `${name}, `) : "";

  if (attempt >= 2 && onlyCheckoutLeft) {
    return ar
      ? `${who}لا مشكلة — كم ليلة تنوون الإقامة؟ سأحسب تاريخ المغادرة من ذلك.`
      : `${who}no problem — how many nights are you staying? I'll work out the check-out date from that.`;
  }

  const labels = missing.map((k) => (ar ? LABELS_AR[k] : LABELS_EN[k]));

  if (attempt >= 2) {
    return ar
      ? `${who}لأتمكن من جلب الأسعار أحتاج ${labels.join("، ")}. مثال: «مكة، ١٢-١٥ سبتمبر».`
      : `${who}to pull live prices I just need ${joinAnd(labels)}. For example: "Makkah, 12–15 September".`;
  }

  return ar
    ? `${who}للتحقق من التوفر، نحتاج ${labels.join("، ")}.`
    : `${who}happy to check availability — could you confirm ${joinAnd(labels)}?`;
}

/** The outstanding question in plain words, for the social composer to carry. */
function describeMissing(missing: RequiredSlot[], req: Requirements): string | null {
  if (missing.length === 0) return null;
  const ar = req.language === "ar";
  return joinAnd(missing.map((k) => (ar ? LABELS_AR[k] : LABELS_EN[k])));
}

/**
 * "Makkah, 2026-09-12 → 2026-09-15, 5 people" — what this person has on the go.
 *
 * Given to the social composer so a greeting can be answered in context ("salam
 * Onais — your Makkah dates are with the team") rather than as if the customer
 * had just walked in. Nothing here is a price, so there is no risk in it.
 */
function describeEnquiry(slots: Slots): string | null {
  const parts = [
    slots.city,
    slots.check_in && slots.check_out ? `${slots.check_in} → ${slots.check_out}` : slots.check_in,
    slots.pax ? `${slots.pax} people` : null,
    slots.min_stars ? `${slots.min_stars}-star` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Sends via Green API, mirrors into messages, and updates the group throttle. */
async function deliver(ing: IngestResult, orgId: string, chatJid: string, text: string) {
  const db = supabaseAdmin();
  let waId: string | null = null;
  try {
    const res = await sendText(orgId, chatJid, text);
    waId = res?.idMessage ?? null;
  } catch (err) {
    await db.from("ai_runs").insert({
      org_id: orgId, chat_id: ing.chatId, model: "green-api",
      purpose: "send", succeeded: false, error: String(err),
    });

    // Quota exhaustion lasts the rest of the month. Pause the bot on this chat
    // so every further inbound message doesn't buy a DeepSeek round trip whose
    // reply can never be delivered — and leave a note so the team knows why the
    // bot went quiet instead of discovering it mid-conversation.
    if (err instanceof GreenQuotaError) {
      await db.from("chats")
        .update({ is_bot_paused: true, bot_resume_at: null })
        .eq("id", ing.chatId);
      await db.from("internal_notes").insert({
        org_id: orgId,
        chat_id: ing.chatId,
        lead_id: ing.leadId,
        body:
          `Bot paused automatically: Green API monthly quota is exhausted, so replies ` +
          `to this chat cannot be sent. Usable numbers this month: ` +
          `${err.allowedJids.join(", ") || "see Green API console"}. ` +
          `Upgrade the tariff to resume.`,
      });
    }
    return;
  }

  await db.from("messages").insert({
    org_id: orgId,
    chat_id: ing.chatId,
    lead_id: ing.leadId,
    wa_message_id: waId,
    direction: "out",
    sender_type: "bot",
    message_type: "text",
    body: text,
    wa_timestamp: new Date().toISOString(),
  });
  // Throttle counters were already reserved atomically by bot_gate() before the
  // model ran; chat rollups happen in the messages trigger. Nothing to update here.
}

/**
 * A6/§4.5: the bot never goes quiet without a human owning the chat.
 *
 * The pause is CLAIMED, not merely set, and the farewell message is sent only by
 * whoever wins the claim. Two messages arriving seconds apart are processed
 * concurrently — each in its own `after()` — so both can clear bot_gate() before
 * either one has finished its DeepSeek round trip and paused the chat. That is how
 * one customer got the same "we don't have options" notice twice in a row for two
 * different questions. Losing the claim means someone else already handed this
 * chat over: say nothing.
 */
async function handoff(
  ing: IngestResult, orgId: string, chatJid: string,
  req: Requirements, reason: string, message?: string
) {
  const db = supabaseAdmin();
  /*
   * bot_resume_at MUST be cleared, not just left alone. bot_gate() auto-resumes
   * any chat whose resume time has passed (0007), so pausing without clearing a
   * timer someone set earlier — the inbox's "pause for N hours" toggle writes
   * one — lets the bot wake up in a conversation a human has taken ownership of
   * and start re-asking its questions underneath them. The quota path and the
   * close route both clear it; this one did not.
   *
   * The `is_bot_paused = false` predicate is what makes this a claim: Postgres
   * returns a row only to the caller that performed the transition.
   */
  const { data: claimed } = await db
    .from("chats")
    .update({ is_bot_paused: true, bot_resume_at: null })
    .eq("id", ing.chatId)
    .eq("is_bot_paused", false)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { sent: false, reason: `${reason}_already_handed_off` };
  }

  if (ing.leadId) {
    // clarify_attempts resets here. A human owns the conversation now, so the
    // bot's outstanding question is void — and a non-zero counter left behind
    // would make the next message the bot ever sees (after a resume, possibly
    // days later) look like a live interrogation still in progress.
    await db
      .from("leads")
      .update({ stage: "under_negotiation", clarify_attempts: 0 })
      .eq("id", ing.leadId);
    // author_id stays null — this note has no human author.
    await db.from("internal_notes").insert({
      org_id: orgId,
      chat_id: ing.chatId,
      lead_id: ing.leadId,
      body: `Bot handed off to a human. Reason: ${reason}.`,
    });
  }

  if (message) await deliver(ing, orgId, chatJid, message);
  return { sent: Boolean(message), reason };
}

/**
 * Only ever moves a lead forward — never demotes on a stray message.
 *
 * Moves are applied one stage at a time, because the funnel report counts leads
 * that EVER REACHED each stage from lead_stage_events. A single jump from
 * new_inquiry to quotation_sent would skip the requirements_gathered event and
 * the funnel would show more quotes than qualified leads — an impossible chart
 * that an attentive buyer will spot in seconds.
 */
async function advanceStage(
  leadId: string | null,
  target: LeadStage,
  req: Requirements,
  clarifyAttempts?: number
) {
  if (!leadId) return;
  const db = supabaseAdmin();
  const order: LeadStage[] = [
    "new_inquiry", "requirements_gathered", "quotation_sent",
    "under_negotiation", "closed_won", "closed_lost",
  ];

  const { data: lead } = await db.from("leads").select("stage").eq("id", leadId).single();
  const current = (lead?.stage ?? "new_inquiry") as LeadStage;

  const hasRequirements = Boolean(req.city && req.check_in && req.check_out);
  const effective: LeadStage =
    target === "new_inquiry" && hasRequirements ? "requirements_gathered" : target;

  // First update carries the extracted requirement fields alongside the stage.
  // `undefined` is dropped from the JSON body, so a slot we have no value for is
  // left as-is rather than being nulled out — this write must never erase memory.
  // `city` is the slot the bot used to forget between turns; persisting it is what
  // makes the merge in runBot() work at all.
  const fields = {
    city: req.city ?? undefined,
    min_stars: req.min_stars ?? undefined,
    check_in_date: req.check_in ?? undefined,
    check_out_date: req.check_out ?? undefined,
    pax_count: req.pax ?? undefined,
    rooms_count: req.rooms ?? undefined,
    room_configuration: req.room_configuration ?? undefined,
    max_distance_m: req.max_distance_m ?? undefined,
    budget_amount: req.max_price_per_night ?? undefined,
    clarify_attempts: clarifyAttempts ?? undefined,
  };

  const from = order.indexOf(current);
  const to = order.indexOf(effective);
  if (to <= from) {
    // No forward movement — still persist any newly extracted requirements.
    await db.from("leads").update(fields).eq("id", leadId);
    return;
  }

  for (let i = from + 1; i <= to; i++) {
    await db.from("leads")
      .update({ stage: order[i], ...(i === from + 1 ? fields : {}) })
      .eq("id", leadId);
  }
}

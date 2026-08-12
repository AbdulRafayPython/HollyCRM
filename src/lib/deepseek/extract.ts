import { z } from "zod";
import { runModel } from "./client";
import type { RoomConfig } from "@/lib/types";

/**
 * Step 1 of the bot loop: turn a WhatsApp message into typed search parameters.
 *
 * JSON mode + schema validation rather than function calling — tool calls on
 * deepseek-chat are less reliable than OpenAI's, and a malformed tool call has
 * no repair path (A7). A deterministic regex fallback always exists underneath.
 */

/**
 * What the latest message IS, not merely whether it mentions a hotel.
 *
 * The old boolean had exactly two outcomes: quote, or say nothing. "Hello" an
 * hour into a live negotiation fell into `false` and the bot went silent, which
 * is the single most obvious way for it to read as broken — a person who has
 * been answering your questions all morning says salaam and gets ignored.
 *
 * Every value here has its own handler in the orchestrator. `other_question` is
 * the one that reaches the knowledge base: "do you arrange transport from
 * Jeddah?" is neither a booking slot nor small talk.
 */
export const INTENTS = [
  "hotel_inquiry",
  "greeting",
  "thanks",
  "smalltalk",
  "other_question",
  "human_request",
] as const;

export type Intent = (typeof INTENTS)[number];

/**
 * A durable fact worth remembering about this person, proposed by the extractor.
 *
 * Deliberately narrow: preferences and circumstances that change how we should
 * quote ("travelling with elderly parents", "wants walking distance"), never
 * booking slots. Slots have typed columns and a merge rule; duplicating them
 * here would create a second copy that immediately disagrees with the first.
 */
export const MemoryFactSchema = z.object({
  key: z.string().min(1).max(60),
  value: z.string().min(1).max(400),
});

export type MemoryFact = z.infer<typeof MemoryFactSchema>;

export const RequirementsSchema = z.object({
  intent: z.enum(INTENTS),
  city: z.enum(["Makkah", "Madinah"]).nullable(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  pax: z.number().int().positive().max(500).nullable(),
  rooms: z.number().int().positive().max(200).nullable(),
  room_configuration: z
    .enum(["single", "double", "triple", "quad", "sharing"])
    .nullable(),
  max_price_per_night: z.number().positive().max(100000).nullable(),
  max_distance_m: z.number().int().positive().max(20000).nullable(),
  min_stars: z.number().int().min(1).max(5).nullable(),
  wants_human: z.boolean(),
  language: z.enum(["en", "ar", "ur", "other"]),
  // `.catch([])` rather than `.default([])`: a model that returns a malformed
  // memory entry must not invalidate the whole extraction and drop us onto the
  // regex fallback, losing the dates it got right. Memory is a bonus; slots are
  // the job.
  memory_facts: z.array(MemoryFactSchema).max(4).catch([]),
});

export type Requirements = z.infer<typeof RequirementsSchema>;

/** Does this message continue a booking conversation, or start one? */
export function isInquiry(intent: Intent): boolean {
  return intent === "hotel_inquiry";
}

/** Messages that deserve a human reply but not a hotel search. */
export function isSocial(intent: Intent): boolean {
  return intent === "greeting" || intent === "thanks" || intent === "smalltalk";
}

const SYSTEM = `You extract structured booking requirements for an Umrah/Hajj hotel CRM.

Return ONLY a JSON object with exactly these keys:
  intent               one of "hotel_inquiry" | "greeting" | "thanks" | "smalltalk" | "other_question" | "human_request"
  city                 "Makkah" | "Madinah" | null
  check_in             "YYYY-MM-DD" | null
  check_out            "YYYY-MM-DD" | null
  pax                  integer | null   - total number of people
  rooms                integer | null   - number of rooms requested
  room_configuration   "single"|"double"|"triple"|"quad"|"sharing" | null
  max_price_per_night  number | null    - in SAR. Convert if the user states another currency.
  max_distance_m       integer | null   - max walking distance to the Haram, in metres
  min_stars            integer 1-5 | null
  wants_human          boolean  - true if asking for a discount, complaining, or asking for a person
  language             "en"|"ar"|"ur"|"other"
  memory_facts         array of {"key": "...", "value": "..."} — may be empty

Rules:
- Unknown values are null. Never guess a date, a price, or a party size.
- "riyal"/"SAR"/"﷼" is SAR. If the user says USD, multiply by 3.75 to get SAR.
- A stay of "N nights" from a check-in date means check_out = check_in + N days.
- Output raw JSON only. No markdown fences, no commentary.

Choosing the intent — it describes THE LATEST MESSAGE ONLY:
- "hotel_inquiry"  asking about hotels, rates, availability, OR responding to a
                   question we just asked ("Makkah", "30 sep", "6 people", "the
                   cheaper one") — INCLUDING declining to answer it ("don't know",
                   "not sure yet", "you tell me"). A non-answer to our question is
                   still part of the booking conversation, not small talk.
- "greeting"       hello, salam, assalamualaikum, good morning, "are you there?".
                   Use this whenever the message is a greeting, EVEN IF the
                   conversation has been running for hours and even if the person
                   has already booked. A greeting mid-conversation is still a
                   greeting and still expects a reply.
- "thanks"         thanks, jazakallah, appreciated, "ok great", 👍.
- "smalltalk"      pleasantries and chatter with no request in them.
- "other_question" a real question that is not about hotel prices or availability —
                   visa, transport, luggage, payment methods, cancellation, food,
                   office address, working hours.
- "human_request"  asking for a person, a manager, a discount, or complaining.

How to read the conversation you are given:
- The recent conversation is CONTEXT. Use it to fill slots the latest message only
  implies — "Makkah" after we asked which city, "the 20th" after a month was named,
  "make it 6" after a party size. Carry a value forward if it was stated earlier
  and nothing has replaced it.
- Speakers are named ("Onais: ..."). In a group several people negotiate at once.
  Extract ONLY what the person who sent the latest message has said. If Onais asks
  about Makkah and Bilal asks about Madinah, a message from Onais must not pick up
  Bilal's city.
- intent and wants_human describe the latest message only. A request for a human
  earlier in the conversation is history, not a standing instruction: if the latest
  message is "Makkah 12 sep", wants_human is false even though the customer asked
  for an agent two messages ago. Re-flagging it traps the chat in a loop of
  hand-off notices.
- If the latest message declines or defers a value ("don't know", "not sure",
  "you tell me"), leave that slot null. Do not invent one to fill the gap.

memory_facts — what a good colleague would still remember next week:
- Durable circumstances and preferences ONLY: {"key":"group_type","value":"family with elderly parents"},
  {"key":"accessibility","value":"needs wheelchair access"},
  {"key":"preference","value":"insists on walking distance to the Haram"},
  {"key":"relationship","value":"repeat customer, booked with us in Ramadan"}.
- NEVER put city, dates, party size, rooms, budget or star rating here. Those are
  slots above; a second copy would drift out of step with the first.
- Only facts stated in this conversation. Return [] rather than inferring one.
- Reuse the same key when updating a fact you have seen before.`;

export async function extractRequirements(
  message: string,
  ctx: {
    orgId?: string;
    chatId?: string;
    recent?: string[];
    today: string;
    /** Who sent this message, so the model can tell them apart in a group. */
    speaker?: string | null;
    /** What this person has been writing in so far — see stickyLanguage(). */
    knownLanguage?: Requirements["language"] | null;
    /** Durable facts already on file, so the model updates rather than repeats. */
    knownFacts?: MemoryFact[];
  }
): Promise<Requirements> {
  // No longer sliced to 6. The orchestrator decides how much thread is worth
  // reading; slicing it again here silently halved that window, which is how a
  // city stated four messages ago stopped being visible to the extractor.
  const history = (ctx.recent ?? []).join("\n");
  const facts = (ctx.knownFacts ?? [])
    .map((f) => `- ${f.key}: ${f.value}`)
    .join("\n");

  const raw = await runModel({
    purpose: "extract_requirements",
    orgId: ctx.orgId,
    chatId: ctx.chatId,
    json: true,
    maxTokens: 500,
    temperature: 0,
    messages: [
      { role: "system", content: `${SYSTEM}\n\nToday is ${ctx.today} (Asia/Riyadh).` },
      {
        role: "user",
        content: [
          history ? `Recent conversation:\n${history}` : null,
          facts ? `Already known about this person:\n${facts}` : null,
          `Latest message${ctx.speaker ? ` (from ${ctx.speaker})` : ""}:\n${message}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const parsed = raw ? tryParse(raw) : null;
  // A7: model unavailable or output unusable -> deterministic path, never a crash.
  const result = parsed ?? fallbackExtract(message);

  return { ...result, language: stickyLanguage(message, result.language, ctx.knownLanguage) };
}

/**
 * Which language to actually reply in.
 *
 * Detection runs per message, and most messages in a booking conversation are
 * one or two words. "Makkah", "30 sep", "ok" are Latin script in every language
 * a customer might be writing, so an Arabic conversation flipped to English the
 * moment someone answered a question tersely — and stayed there, because every
 * subsequent short answer confirmed the wrong guess.
 *
 * So a short reply is not evidence: it inherits whatever this person has been
 * writing in. A message long enough to carry real signal overrides it, which is
 * what lets someone genuinely switch language mid-conversation.
 */
export function stickyLanguage(
  message: string,
  detected: Requirements["language"],
  known?: Requirements["language"] | null
): Requirements["language"] {
  if (!known) return detected;

  // Script is unambiguous regardless of length — three Arabic characters are
  // proof, where three Latin ones are not.
  if (/[؀-ۿݐ-ݿ]/.test(message)) return detected;

  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return words >= 4 ? detected : known;
}

function tryParse(raw: string): Requirements | null {
  try {
    // Strip accidental ```json fences before parsing.
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    const result = RequirementsSchema.safeParse(JSON.parse(cleaned));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Keyword/regex fallback. Deliberately conservative: it is better to return
 * nulls and ask a clarifying question than to search on a hallucinated date.
 */
export function fallbackExtract(message: string): Requirements {
  const m = message.toLowerCase();
  const has = (...words: string[]) => words.some((w) => m.includes(w));

  const city =
    has("makkah", "mecca", "مكة") ? "Makkah"
    : has("madinah", "medina", "المدينة") ? "Madinah"
    : null;

  const starMatch = m.match(/(\d)\s*(?:star|\*|نجوم)/);
  const priceMatch = m.match(/(\d{2,6})\s*(?:sar|riyal|ريال|rs)/);
  const paxMatch = m.match(/(\d{1,3})\s*(?:pax|people|persons?|guests?|أشخاص)/);
  const roomsMatch = m.match(/(\d{1,3})\s*(?:rooms?|غرف)/);
  const distMatch = m.match(/(\d{2,5})\s*(?:m|meters?|metres?|متر)/);

  const config: RoomConfig | null =
    has("quad") ? "quad"
    : has("triple") ? "triple"
    : has("double") ? "double"
    : has("sharing") ? "sharing"
    : has("single") ? "single"
    : null;

  const wantsHuman = has("discount", "manager", "agent", "human", "خصم");
  const isInquiryText = has(
    "hotel", "room", "rate", "price", "available", "booking",
    "haram", "فندق", "سعر", "غرفة"
  );

  return {
    // Ordered by how costly it is to get wrong. A missed human_request strands a
    // complaining customer with a bot, so it wins outright. A greeting mistaken
    // for an inquiry produces a harmless clarifying question; an inquiry
    // mistaken for a greeting loses the booking, so inquiry beats greeting.
    intent: wantsHuman
      ? "human_request"
      : isInquiryText || city !== null
        ? "hotel_inquiry"
        : GREETING_RE.test(m)
          ? "greeting"
          : THANKS_RE.test(m)
            ? "thanks"
            : m.trim().endsWith("?") || m.includes("؟")
              ? "other_question"
              : "smalltalk",
    city,
    check_in: null,
    check_out: null,
    pax: paxMatch ? Number(paxMatch[1]) : null,
    rooms: roomsMatch ? Number(roomsMatch[1]) : null,
    room_configuration: config,
    max_price_per_night: priceMatch ? Number(priceMatch[1]) : null,
    max_distance_m: distMatch ? Number(distMatch[1]) : null,
    min_stars: starMatch ? Number(starMatch[1]) : null,
    wants_human: wantsHuman,
    language: /[؀-ۿ]/.test(message) ? "ar" : "en",
    // The fallback never proposes memory. It runs because the model is
    // unreachable, and a regex has no business deciding what is worth
    // remembering about a person for the next six months.
    memory_facts: [],
  };
}

/**
 * Greetings the bot must never ignore, in the three languages this product is
 * actually used in, plus the transliterations people type on a phone keyboard.
 *
 * Anchored, because "hi" is a substring of half the English language and a bot
 * that greets you for saying "this" is worse than one that stays quiet.
 *
 * The tail is `(?!\w)` and NOT `\b`. A word boundary needs a \w on one side of
 * it, and JS counts Arabic letters as non-word characters — so `\b` after
 * "السلام عليكم" is looking for a transition that cannot occur, and every
 * Arabic greeting failed to match while every English one passed. `(?!\w)`
 * asserts the same thing for Latin script ("hi" still refuses to match "high")
 * without demanding a boundary the alphabet cannot produce.
 */
const GREETING_RE =
  /^\s*(hi|hey|hello|helo|yo|salam|salaam|slm|assalam[ou]?\s*alaikum|as-?salamu\s*alaykum|السلام\s*عليكم|سلام|مرحبا|أهلا|اهلا|صباح\s*الخير|مساء\s*الخير|good\s*(morning|afternoon|evening|day)|are\s*you\s*(there|online))(?!\w)/i;

const THANKS_RE =
  /^\s*(thanks|thank\s*you|thx|ty|jazak\s*allah|jazakallah|shukran|شكرا|شكرًا|جزاك\s*الله|much\s*appreciated|appreciated|ok(ay)?\s*(thanks|great|good)|👍|🙏)/i;

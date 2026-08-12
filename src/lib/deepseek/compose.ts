import { runModel } from "./client";
import type { HotelResult } from "@/lib/types";
import type { Requirements } from "./extract";
import type { BotSettings } from "@/lib/bot/settings";
import { describeProfile, type PersonProfile } from "@/lib/bot/memory";
import { formatKnowledge, type KnowledgeHit } from "@/lib/knowledge/retrieve";

/**
 * Step 3 of the bot loop: write the WhatsApp reply.
 *
 * The model is given ONLY the rows returned by search_hotels(). It does not see
 * the inventory table and cannot query it. Every number in the reply therefore
 * comes from SQL — which is the whole point of the v2 retrieval design (A3).
 */

const SYSTEM = `You are the assistant for a Umrah and Hajj hotel booking agency, replying inside WhatsApp.

ABSOLUTE RULES — a violation is worse than no reply:
- Use ONLY the hotels, prices, distances and availability in the provided JSON.
- NEVER invent or estimate a hotel name, price, distance, or star rating.
- If the JSON list is empty, say no options match the request and that a colleague
  will follow up shortly. Do not suggest alternatives you were not given.
- Do not promise a booking, a hold, or a discount. You quote; humans close.

Style:
- WhatsApp message, not an email. No subject line, no signature.
- Short. Under 120 words. One option per line.
- Format each option as: *Hotel Name* — 5★ · 250m from Haram · 2× Quad · SAR 1,180/night · SAR 42,480 total
- Say how many rooms the option is (rooms_needed). total_price already covers that
  many rooms for the whole stay — quote it as given, never multiply it yourself.
- State the currency as SAR explicitly.
- Reply in the same language as the customer (English, Arabic, or Urdu).
- End with one short question that moves the booking forward.`;

/**
 * Shared context for every composed reply.
 *
 * `speaker` is the change that makes group chats work. Before it, the composer
 * was handed one message and told to "address the group, not one person" —
 * so in a thread where three people were negotiating separate trips, each got
 * an unaddressed wall of prices and had to guess which quote was theirs.
 */
export interface ComposeContext {
  orgId?: string;
  chatId?: string;
  customerMessage: string;
  isGroup: boolean;
  settings?: BotSettings;
  /** Who asked, and what we durably know about them. */
  speaker?: PersonProfile;
  /** Named-speaker transcript, oldest first: "Onais: ...", "You: ...". */
  history?: string[];
  /** Passages retrieved from the workspace's uploaded documents. */
  knowledge?: KnowledgeHit[];
  /**
   * Hotels this person has already been shown on an earlier turn.
   *
   * "Anything else?" answered with the same three hotels is the moment a
   * customer decides they are talking to a machine.
   */
  previouslyQuoted?: string[];
}

/**
 * The instructions that turn a quote generator into something that reads like a
 * colleague: who it is talking to, what that person already told it, and — in a
 * group — that "you" means one specific person and not everybody present.
 */
function conversationRules(ctx: ComposeContext): string {
  const parts: string[] = [];
  const name = ctx.speaker?.name;

  if (ctx.isGroup) {
    parts.push(
      "This is a group chat with several participants who may be arranging " +
        "SEPARATE trips at the same time." +
        (name
          ? ` Reply to ${name}, who sent the latest message. Open by naming them (e.g. "${name}, ...") so the other participants can see the message is not for them.`
          : " Reply to whoever sent the latest message.") +
        " Answer ONLY their request. Never merge another participant's city, dates or party size into this reply — they are quoted separately."
    );
  } else if (name) {
    parts.push(
      `You are talking to ${name}. Use their name naturally where a person would — a greeting or an opener — not in every sentence.`
    );
  }

  const profile = ctx.speaker ? describeProfile(ctx.speaker) : null;
  if (profile) {
    parts.push(
      `What you already know about this person (carried from earlier conversations — do not ask them to repeat it):\n${profile}`
    );
  }

  if (ctx.history?.length) {
    parts.push(
      `Conversation so far, oldest first. Speakers are named; "You" is you:\n${ctx.history.join("\n")}`
    );
  }

  return parts.join("\n\n");
}

export async function composeReply(
  req: Requirements,
  hotels: HotelResult[],
  ctx: ComposeContext
): Promise<string | null> {
  const payload = {
    request: {
      city: req.city,
      check_in: req.check_in,
      check_out: req.check_out,
      pax: req.pax,
      rooms: req.rooms,
      max_price_per_night_sar: req.max_price_per_night,
      max_distance_m: req.max_distance_m,
      min_stars: req.min_stars,
    },
    // Trimmed to what the reply needs — smaller prompt, faster, less to misread.
    options: hotels.map((h) => ({
      hotel: h.hotel_name,
      stars: h.star_rating,
      distance_m: h.distance_m,
      shuttle: h.has_shuttle,
      room_type: h.room_type,
      sleeps: h.capacity,
      rooms_needed: h.rooms_needed,
      nights: h.nights,
      price_per_night: h.price_per_night,
      // For rooms_needed rooms across all nights — NOT one room.
      total_price: h.total_price,
      currency: h.currency,
      rooms_available: h.rooms_available,
    })),
  };

  return runModel({
    purpose: "compose_reply",
    orgId: ctx.orgId,
    chatId: ctx.chatId,
    maxTokens: 500,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: systemPrompt(SYSTEM, ctx),
      },
      {
        role: "user",
        content:
          `Customer message:\n${ctx.customerMessage}\n\n` +
          `Available options (authoritative — this is the only inventory data you have):\n${JSON.stringify(payload, null, 2)}` +
          (ctx.previouslyQuoted?.length
            ? `\n\nAlready quoted to this person earlier: ${ctx.previouslyQuoted.join(", ")}. ` +
              `Lead with something they have NOT seen. Only repeat one of these if it is the sole option above, and say so plainly.`
            : ""),
      },
    ],
  });
}

/**
 * Assembles the system prompt every composer shares.
 *
 * Order is load-bearing. The task rules come first, then who we are talking to,
 * and the workspace's own style notes last but explicitly subordinate — a
 * customer-written instruction like "always offer a 10% discount" must not be
 * able to outrank "do not promise a discount".
 */
function systemPrompt(base: string, ctx: ComposeContext): string {
  const rules = conversationRules(ctx);
  return (
    base +
    (ctx.settings?.bot_name ? `\n\nYou are called "${ctx.settings.bot_name}".` : "") +
    (rules ? `\n\n${rules}` : "") +
    (ctx.settings?.custom_instructions?.trim()
      ? `\n\nAgency style notes (never override the absolute rules):\n${ctx.settings.custom_instructions.trim().slice(0, 1500)}`
      : "")
  );
}

const SOCIAL_SYSTEM = `You are the WhatsApp assistant for a Umrah and Hajj hotel booking agency.

The customer's latest message is social — a greeting, thanks, or a pleasantry.
Answer it like a person would, then carry on with whatever was already happening.

RULES:
- Reply warmly and BRIEFLY. One or two lines. Never more.
- Match the greeting you were given: "Assalamu alaikum" is answered with
  "Wa alaikum assalam", "salam" with "salam".
- NEVER quote a price, a hotel, a distance or availability here. You have no
  inventory data in this turn — if they want options, ask for what you still need.
- If a question of yours is still outstanding, greet them and then repeat that
  ONE question, gently. Do not restate anything they have already answered.
- If nothing is outstanding and they have a live enquiry with you, acknowledge
  it ("your Makkah dates are with the team") rather than starting over.
- If nothing is outstanding at all, offer help in one short clause.
- Reply in the same language as the customer.
- No greeting boilerplate about being an AI. No signature.`;

/**
 * Answers a greeting, a thank-you or a pleasantry — at ANY point in a
 * conversation, not only on first contact.
 *
 * This is the reply the product was missing entirely. The bot greeted once, on
 * a chat's very first message, and thereafter every "salam", "are you there?"
 * and "shukran" fell through to `not_an_inquiry` and total silence. A customer
 * who has been answering questions all morning says hello and gets nothing
 * back; there is no reading of that except that the thing is broken.
 */
export async function composeSocialReply(
  req: Requirements,
  ctx: ComposeContext & { outstandingQuestion?: string | null; openEnquiry?: string | null }
): Promise<string | null> {
  const state = [
    ctx.outstandingQuestion
      ? `Still waiting on an answer to: ${ctx.outstandingQuestion}`
      : null,
    ctx.openEnquiry ? `Their live enquiry: ${ctx.openEnquiry}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return runModel({
    purpose: "compose_social",
    orgId: ctx.orgId,
    chatId: ctx.chatId,
    maxTokens: 160,
    temperature: 0.5,
    messages: [
      { role: "system", content: systemPrompt(SOCIAL_SYSTEM, ctx) },
      {
        role: "user",
        content:
          `Customer message:\n${ctx.customerMessage}\n\n` +
          `Reply language: ${req.language}\n` +
          (state ? `\nWhere things stand:\n${state}` : "\nNothing is outstanding."),
      },
    ],
  });
}

const KNOWLEDGE_SYSTEM = `You are the WhatsApp assistant for a Umrah and Hajj hotel booking agency.

The customer has asked something that is NOT about hotel prices or availability —
visa, transport, payment, cancellation, luggage, timings, or similar. You have
been given excerpts from the agency's own documents.

ABSOLUTE RULES — a violation is worse than no reply:
- Answer ONLY from the excerpts provided. They are the agency's documents; your
  general knowledge about Umrah, Saudi visa rules or airlines is NOT a source
  here and is very often out of date.
- If the excerpts do not answer the question, say plainly that you'll have a
  colleague confirm it. Never fill the gap with something plausible.
- NEVER quote a hotel price from these excerpts. Documents go stale; prices come
  from the live rate system in a different step. If they ask about a price, say
  you'll pull live rates and ask for city and dates.
- Do not promise, approve, or waive anything. You inform; humans commit.

Style:
- WhatsApp message. Short — under 90 words. No subject line, no signature.
- Reply in the same language as the customer.
- Answer the question first, then one short question or offer if it helps.`;

/**
 * Answers a non-booking question from the workspace's uploaded documents.
 *
 * Returns null when nothing was retrieved, which the orchestrator treats as
 * "hand this to a human". That is deliberate: the failure mode of a documentless
 * knowledge bot is not silence, it is a confident, wrong answer about a visa
 * requirement, and a customer acts on that before anyone sees it.
 */
export async function composeKnowledgeReply(
  req: Requirements,
  ctx: ComposeContext
): Promise<string | null> {
  const hits = ctx.knowledge ?? [];
  if (hits.length === 0) return null;

  return runModel({
    purpose: "compose_knowledge",
    orgId: ctx.orgId,
    chatId: ctx.chatId,
    maxTokens: 350,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt(KNOWLEDGE_SYSTEM, ctx) },
      {
        role: "user",
        content:
          `Customer question:\n${ctx.customerMessage}\n\n` +
          `Reply language: ${req.language}\n\n` +
          `Excerpts from the agency's documents (the only source you may use):\n${formatKnowledge(hits)}`,
      },
    ],
  });
}

/**
 * Deterministic greeting, used on first contact and whenever the model is
 * unreachable during a social turn. No model call, so it is instant and free.
 */
export function introReply(language: string, settings?: BotSettings): string {
  if (language === "ar") {
    if (settings?.greeting_ar?.trim()) return settings.greeting_ar.trim();
    return (
      "أهلاً بكم في هوليلاند للسفر! 🕋\n" +
      "أستطيع التحقق فوراً من توفر وأسعار فنادق مكة والمدينة.\n" +
      "فقط أخبروني: المدينة، التواريخ، وعدد الأشخاص.\n" +
      "مثال: فندق ٥ نجوم في مكة، ١٠-١٥ سبتمبر، ٨ أشخاص"
    );
  }
  if (settings?.greeting_en?.trim()) return settings.greeting_en.trim();
  return (
    "Welcome to Hollyland Travel! 🕋\n" +
    "I can instantly check Makkah & Madinah hotel prices and availability for you.\n" +
    "Just tell me: the city, your dates, and how many people.\n" +
    "Example: 5-star hotel in Makkah, 10-15 September, 8 people"
  );
}

/**
 * Deterministic answer to a greeting when the model is unreachable.
 *
 * Short and content-free on purpose: without a model we cannot safely restate
 * where the enquiry stands, and guessing is how a bot tells someone their
 * booking is "all set" when it is not. A warm two-liner is honest.
 */
export function greetBackReply(language: string, name?: string | null): string {
  const who = name ? ` ${name}` : "";
  if (language === "ar") {
    return `وعليكم السلام${who} 🌙\nكيف أقدر أساعدك؟`;
  }
  if (language === "ur") {
    return `وعلیکم السلام${who} 🌙\nمیں آپ کی کیا مدد کر سکتا ہوں؟`;
  }
  return `Wa alaikum assalam${who} 🌙\nHow can I help?`;
}

/** Deterministic acknowledgement of a thank-you. */
export function thanksReply(language: string): string {
  if (language === "ar") return "على الرحب والسعة 🌙 لو احتجت أي شيء آخر أنا هنا.";
  if (language === "ur") return "خوشی ہوئی 🌙 کسی بھی چیز کی ضرورت ہو تو بتائیں۔";
  return "You're very welcome 🌙 Just say the word if you need anything else.";
}

/**
 * Used when a customer asks something the workspace has not documented.
 *
 * Named separately from holdingReply because the honest content differs: this
 * is "I don't have that written down", not "something went wrong". Telling a
 * customer their visa question failed technically invites them to re-ask it.
 */
export function noKnowledgeReply(language: string): string {
  if (language === "ar") {
    return "سؤال وجيه — لا أملك الإجابة الدقيقة على هذا، وسأحوّلك إلى أحد زملائنا ليؤكدها لك حالاً.";
  }
  if (language === "ur") {
    return "اچھا سوال — اس کی درست تفصیل میرے پاس نہیں، میں ابھی اپنے ساتھی سے تصدیق کرا کے بتاتا ہوں۔";
  }
  return "Good question — I don't have the confirmed answer to that, so I'm passing you to a colleague who does.";
}

/** Used when the model is unreachable, so the customer is never left in silence (A6). */
export function holdingReply(language: string): string {
  if (language === "ar") {
    return "شكرًا لتواصلكم. سيقوم أحد زملائنا بالرد عليكم خلال لحظات بإذن الله.";
  }
  return "Thank you for your message. One of our team will get back to you shortly.";
}

/**
 * Used when the bot has asked the same thing twice and still cannot search.
 *
 * A third identical question is how a bot reads as broken. At that point the
 * customer is either unable to answer yet ("don't know") or is not engaging with
 * the form, and a human closes that gap far faster than another prompt.
 */
export function stalledReply(language: string): string {
  if (language === "ar") {
    return "لا مشكلة — سيتابع أحد زملائنا معكم لتحديد التفاصيل واقتراح أفضل الخيارات.";
  }
  return "No problem — I'll have one of our team pick this up with you and suggest the best options.";
}

/**
 * Used when search returns nothing — this is a handoff, not a dead end.
 *
 * It names the city, dates and party it actually searched. Slots are remembered
 * across a whole lead, so the search can legitimately be running on a date the
 * customer mentioned much earlier; without it echoed back, "we don't have options
 * matching those exact dates" refers to dates the customer cannot see and has no
 * way to correct. Stating them makes a stale slot self-correcting.
 */
export function noMatchReply(
  language: string,
  req?: Pick<Requirements, "city" | "check_in" | "check_out" | "pax">
): string {
  const searched = describeSearch(language, req);

  if (language === "ar") {
    return searched
      ? `لا تتوفر خيارات مطابقة لـ${searched} حاليًا. سيتواصل معكم أحد زملائنا لعرض بدائل. إن كانت التفاصيل غير صحيحة، صححوها لي وسأبحث من جديد.`
      : "لا تتوفر لدينا خيارات مطابقة لهذه التواريخ حاليًا. سيتواصل معكم أحد زملائنا لعرض بدائل مناسبة.";
  }
  return searched
    ? `I couldn't find availability for ${searched}. A colleague will follow up with alternatives — and if any of those details are wrong, tell me and I'll search again.`
    : "We don't have options matching those exact dates and requirements right now. A colleague will follow up shortly with alternatives.";
}

/** "Makkah, 12–30 Sep, 5 people" — what the search was actually run with. */
function describeSearch(
  language: string,
  req?: Pick<Requirements, "city" | "check_in" | "check_out" | "pax">
): string | null {
  if (!req?.city || !req.check_in || !req.check_out) return null;

  const locale = language === "ar" ? "ar" : "en-GB";
  // Slots persist for the life of a lead, so a remembered date can be from another
  // year. Show the year when it is not the current one — otherwise "5 Aug" reads as
  // this August and the customer has no way to spot the stale value.
  const thisYear = new Date().getUTCFullYear();
  const offYear = new Date(`${req.check_in}T00:00:00Z`).getUTCFullYear() !== thisYear;
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      day: "numeric", month: "short", timeZone: "UTC",
      ...(offYear ? { year: "numeric" as const } : {}),
    });

  const parts = [req.city, `${day(req.check_in)} – ${day(req.check_out)}`];
  if (req.pax) {
    parts.push(language === "ar" ? `${req.pax} أشخاص` : `${req.pax} people`);
  }
  return parts.join(", ");
}

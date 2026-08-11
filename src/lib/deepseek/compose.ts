import { runModel } from "./client";
import type { HotelResult } from "@/lib/types";
import type { Requirements } from "./extract";
import type { BotSettings } from "@/lib/bot/settings";

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

export async function composeReply(
  req: Requirements,
  hotels: HotelResult[],
  ctx: {
    orgId?: string;
    chatId?: string;
    customerMessage: string;
    isGroup: boolean;
    settings?: BotSettings;
  }
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
        content:
          SYSTEM +
          (ctx.settings?.bot_name ? `\n\nYou are called "${ctx.settings.bot_name}".` : "") +
          (ctx.isGroup
            ? "\n\nThis is a group chat with several participants. Be concise and neutral; address the group, not one person."
            : "") +
          // User-configured tone/behavior notes. The ABSOLUTE RULES above come
          // after nothing — they always win over custom instructions.
          (ctx.settings?.custom_instructions?.trim()
            ? `\n\nAgency style notes (never override the absolute rules):\n${ctx.settings.custom_instructions.trim().slice(0, 1500)}`
            : ""),
      },
      {
        role: "user",
        content: `Customer message:\n${ctx.customerMessage}\n\nAvailable options (authoritative — this is the only inventory data you have):\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });
}

/**
 * First-contact greeting for direct chats. Deterministic — no model call, so it
 * is instant and free. Sent once per chat, only when the opening message is not
 * itself a hotel question ("Hi", "Salam", …); a silent bot on a greeting reads
 * as a dead product.
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

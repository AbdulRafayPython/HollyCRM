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

export const RequirementsSchema = z.object({
  is_hotel_inquiry: z.boolean(),
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
});

export type Requirements = z.infer<typeof RequirementsSchema>;

const SYSTEM = `You extract structured booking requirements for an Umrah/Hajj hotel CRM.

Return ONLY a JSON object with exactly these keys:
  is_hotel_inquiry     boolean  - true if the user is asking about hotels, rates, or availability
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

Rules:
- Unknown values are null. Never guess a date, a price, or a party size.
- "riyal"/"SAR"/"﷼" is SAR. If the user says USD, multiply by 3.75 to get SAR.
- A stay of "N nights" from a check-in date means check_out = check_in + N days.
- Output raw JSON only. No markdown fences, no commentary.

How to read the conversation you are given:
- The recent conversation is CONTEXT. Use it to fill slots the latest message only
  implies — "Makkah" after we asked which city, "the 20th" after a month was named,
  "make it 6" after a party size. Carry a value forward if it was stated earlier
  and nothing has replaced it.
- is_hotel_inquiry and wants_human describe THE LATEST MESSAGE ONLY. A request for
  a human earlier in the conversation is history, not a standing instruction: if
  the latest message is "Makkah 12 sep", wants_human is false even though the
  customer asked for an agent two messages ago. Re-flagging it traps the chat in a
  loop of hand-off notices.
- If the latest message declines or defers a value ("don't know", "not sure",
  "you tell me"), leave that slot null. Do not invent one to fill the gap.`;

export async function extractRequirements(
  message: string,
  ctx: { orgId?: string; chatId?: string; recent?: string[]; today: string }
): Promise<Requirements> {
  const history = (ctx.recent ?? []).slice(-6).join("\n");
  const raw = await runModel({
    purpose: "extract_requirements",
    orgId: ctx.orgId,
    chatId: ctx.chatId,
    json: true,
    maxTokens: 400,
    temperature: 0,
    messages: [
      { role: "system", content: `${SYSTEM}\n\nToday is ${ctx.today} (Asia/Riyadh).` },
      {
        role: "user",
        content: history
          ? `Recent conversation:\n${history}\n\nLatest message:\n${message}`
          : message,
      },
    ],
  });

  if (raw) {
    const parsed = tryParse(raw);
    if (parsed) return parsed;
  }
  // A7: model unavailable or output unusable -> deterministic path, never a crash.
  return fallbackExtract(message);
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

  return {
    is_hotel_inquiry: has(
      "hotel", "room", "rate", "price", "available", "booking",
      "haram", "فندق", "سعر", "غرفة"
    ),
    city,
    check_in: null,
    check_out: null,
    pax: paxMatch ? Number(paxMatch[1]) : null,
    rooms: roomsMatch ? Number(roomsMatch[1]) : null,
    room_configuration: config,
    max_price_per_night: priceMatch ? Number(priceMatch[1]) : null,
    max_distance_m: distMatch ? Number(distMatch[1]) : null,
    min_stars: starMatch ? Number(starMatch[1]) : null,
    wants_human: has("discount", "manager", "agent", "human", "خصم"),
    language: /[؀-ۿ]/.test(message) ? "ar" : "en",
  };
}

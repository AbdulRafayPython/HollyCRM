/**
 * Dialling code out of a WhatsApp number.
 *
 * This is the routing key for the whole assignment engine: it is the only thing
 * we know about a customer on their very first message, before they have told
 * us a city, a date, or their name. Getting it from the number costs nothing and
 * works on message one — which is the entire reason regions are keyed on it.
 *
 * Longest-prefix match against a real table, not `slice(0, 2)`. Codes are 1 to 4
 * digits and overlap constantly: 1 (US/Canada) vs 1868 (Trinidad), 7 (Russia) vs
 * 7 (Kazakhstan), 39 (Italy) vs 379 (Vatican). Taking the first two characters
 * files every US number under "1x" and every Egyptian +20 under "20" by luck
 * rather than by rule.
 */

/**
 * ITU dialling codes, longest first at lookup time.
 *
 * Not exhaustive — that is a maintained dataset, not a constant — but it covers
 * the markets an Umrah/Hajj agency actually sells into plus the major diaspora
 * countries. An unlisted number resolves to null and falls to the default
 * region, which is the correct behaviour for "we don't know": route it to
 * whoever catches everything rather than guess a desk.
 */
const DIALLING_CODES = [
  // Gulf & Middle East
  "966", "971", "973", "974", "975", "968", "965", "962", "961", "964", "963",
  "970", "972", "967", "20", "212", "213", "216", "218", "249", "252", "253",
  // South Asia — the largest Umrah markets
  "92", "91", "880", "94", "977", "960", "93",
  // South-East Asia
  "62", "60", "65", "66", "63", "84", "95", "673", "670",
  // Central Asia & Turkey
  "90", "7", "998", "996", "993", "992", "994", "995",
  // Africa
  "234", "27", "254", "255", "256", "251", "233", "225", "221", "220", "232",
  // Europe
  "44", "33", "49", "39", "34", "31", "32", "41", "43", "46", "47", "45", "358",
  "48", "351", "30", "353", "352", "377", "378", "379", "386", "385", "381",
  // Americas
  "1868", "1876", "1809", "1", "52", "55", "54", "57", "58", "51", "56",
  // Oceania & East Asia
  "61", "64", "86", "81", "82", "852", "853", "886",
].sort((a, b) => b.length - a.length);

/**
 * `+92 311 2929526` / `923112929526@c.us` -> `92`.
 *
 * Returns null rather than a guess when nothing matches. The router treats null
 * as "use the default region", so an unrecognised country reaches a human
 * instead of being filed under whichever desk happened to share a first digit.
 */
export function countryCode(phoneOrJid: string | null | undefined): string | null {
  if (!phoneOrJid) return null;
  const digits = phoneOrJid.split("@")[0].replace(/\D/g, "");
  // Shorter than any real international number: a local-format number with no
  // country code in it, which we cannot route and must not pretend to.
  if (digits.length < 8) return null;
  return DIALLING_CODES.find((code) => digits.startsWith(code)) ?? null;
}

/** Country codes offered in the regions UI, grouped so the list is navigable. */
export const CODE_SUGGESTIONS: { label: string; code: string }[] = [
  { label: "Saudi Arabia", code: "966" },
  { label: "Pakistan", code: "92" },
  { label: "India", code: "91" },
  { label: "Bangladesh", code: "880" },
  { label: "Indonesia", code: "62" },
  { label: "Malaysia", code: "60" },
  { label: "Turkey", code: "90" },
  { label: "Egypt", code: "20" },
  { label: "UAE", code: "971" },
  { label: "Qatar", code: "974" },
  { label: "Kuwait", code: "965" },
  { label: "Bahrain", code: "973" },
  { label: "Oman", code: "968" },
  { label: "Jordan", code: "962" },
  { label: "Nigeria", code: "234" },
  { label: "United Kingdom", code: "44" },
  { label: "United States / Canada", code: "1" },
  { label: "France", code: "33" },
  { label: "Germany", code: "49" },
  { label: "Australia", code: "61" },
];

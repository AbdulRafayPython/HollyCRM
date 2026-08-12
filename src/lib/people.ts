/**
 * How a person is named in the UI.
 *
 * Distinct from `displayName()` in lib/bot/memory.ts, which answers a different
 * question: that one gives the bot a first name it can *address* someone by and
 * returns null rather than say "Hello +966512345678". This one always returns
 * something printable, because a bubble with no label above it is worse than a
 * bubble labelled with a phone number — the agent at least recognises the number.
 */
export function contactLabel(
  name: string | null | undefined,
  phone?: string | null
): string {
  const trimmed = name?.trim();
  // WhatsApp puts the raw number in senderName when the sender has no pushname
  // or hides it, so a "name" that is really a number gets formatted like one
  // instead of being printed twice in two different shapes.
  if (trimmed && !looksLikeNumber(trimmed)) return trimmed;
  const p = phone?.trim() || trimmed;
  return p ? formatPhone(p) : "Unknown";
}

function looksLikeNumber(value: string): boolean {
  const digits = (value.match(/\d/g) ?? []).length;
  return digits > value.length / 2;
}

/** `923112929526` -> `+92 311 2929526`. Grouping is approximate on purpose:
 *  correct per-country segmentation needs a full numbering-plan table, and the
 *  point here is only that an agent can read the number at a glance. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return raw;
  const cc = digits.length > 11 ? digits.slice(0, digits.length - 10) : digits.slice(0, 2);
  const rest = digits.slice(cc.length);
  return `+${cc} ${rest.slice(0, 3)} ${rest.slice(3)}`.trim();
}

/**
 * Rewrites `@<digits>` mentions into names the reader recognises.
 *
 * WhatsApp sends mentions as the raw JID number — a group message reads
 * "@923112929526 Hey", which tells an agent nothing about who was being
 * addressed. Anyone we know is substituted; anyone we don't is left exactly as
 * it arrived, because a wrong name here misattributes a request.
 *
 * NOTE on what is NOT possible: when a customer mentions US, WhatsApp does not
 * transmit the name THEY saved our number under — that lives only in their
 * phone's address book. `selfLabel` is the workspace's own name for the number,
 * which is the closest honest substitute.
 */
export function renderMentions(
  body: string,
  namesByPhone: Record<string, string>,
  selfLabel?: string | null,
  selfPhone?: string | null
): string {
  return body.replace(/@(\d{6,20})/g, (match, digits: string) => {
    const self = selfPhone?.replace(/\D/g, "");
    if (self && digits === self && selfLabel) return `@${selfLabel}`;
    const known = namesByPhone[digits];
    return known ? `@${known}` : match;
  });
}

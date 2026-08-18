import { isOwner, isSupervisor } from "@/lib/types";

/**
 * Who may reach a given screen.
 *
 * One table, imported by both navigations and by the segment guards, because
 * the failure this replaces was two of them disagreeing: AppSidebar and
 * SettingsNav rendered every entry to everybody, and the only thing between a
 * sales agent and the Model & API keys page was that the page's queries came
 * back empty or errored.
 *
 * Since 0034/0035 the answer is a PERMISSION, not a role. A route names the
 * permission its policies require, and the caller's permission list — fetched
 * once by the shell via my_permissions() (0036) — decides. That is what lets a
 * custom role get correct navigation: "Rates Editor" is not a rung on any
 * ladder, so any check written against roles would have guessed wrong.
 *
 * This is presentation only. It is NOT the control: every permission below is
 * enforced by a policy in Postgres. Hiding a link stops an honest person taking
 * a wrong turn; the anon key ships to the browser, so it stops nobody else.
 */

/** `null` means every signed-in member, no permission required. */
export const ROUTE_PERMISSION: Record<string, string | null> = {
  "/home": null,
  "/pipeline": null,
  "/inbox": null,
  "/insights": null,
  "/settings": null,
  "/settings/notifications": null,

  // Read-only for an agent quoting a customer; the write controls inside each
  // page gate themselves. Taking the whole page away would remove numbers an
  // agent needs to do the job.
  "/settings/inventory": null,
  "/settings/knowledge": null,

  "/ai": "bot.configure",
  "/ai/workflow": "bot.configure",
  "/ai/rules": "bot.configure",
  "/settings/ai": "bot.configure",

  "/settings/routing": "coverage.manage",
  "/settings/whatsapp": "credentials.manage",
  "/settings/llm": "credentials.manage",
  "/settings/team": "team.manage",
  "/settings/roles": "team.manage",
  "/settings/data": "data.purge",
};

/**
 * May this person reach this route?
 *
 * `permissions` is the authority. `role` is the fallback for the moment before
 * the shell's first poll returns — without it every gated link would flicker
 * out and back in on each page load, which reads as a broken menu. The fallback
 * mirrors the pre-0034 ladder, which is what those roles still mean.
 */
export function canReach(
  permissions: string[] | null | undefined,
  href: string,
  role?: string | null,
): boolean {
  const needed = ROUTE_PERMISSION[href] ?? null;
  if (needed === null) return true;

  if (permissions && permissions.length > 0) return permissions.includes(needed);

  if (permissions && permissions.length === 0 && role !== undefined) {
    // A known-empty list is a real answer: this person holds nothing.
    return false;
  }

  return OWNER_ONLY.has(needed) ? isOwner(role) : isSupervisor(role);
}

/** Which permissions the old ladder reserved for owners, for the fallback above. */
const OWNER_ONLY = new Set(["credentials.manage", "team.manage", "logs.read", "data.purge"]);

/** Does this person hold a permission? The same question, without a route. */
export function hasPermission(
  permissions: string[] | null | undefined,
  key: string,
  role?: string | null,
): boolean {
  if (permissions && permissions.length > 0) return permissions.includes(key);
  if (permissions && permissions.length === 0) return false;
  return OWNER_ONLY.has(key) ? isOwner(role) : isSupervisor(role);
}

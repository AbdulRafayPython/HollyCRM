import { cache } from "react";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { ROUTE_PERMISSION } from "@/lib/access";

/**
 * The signed-in person's permissions, read once per request.
 *
 * cache()-wrapped for the same reason getAuthUser() is: several gated segments
 * can render in one request and each would otherwise repeat the round trip.
 * my_permissions() (0036) reads the same tables the policies read, so the guard
 * and the boundary cannot disagree.
 */
export const getMyPermissions = cache(async (): Promise<string[]> => {
  const user = await getAuthUser();
  if (!user) return [];

  const sb = await supabaseServer();
  const { data } = await sb.rpc("my_permissions");
  return (data as string[] | null) ?? [];
});

/**
 * May the signed-in person open this route?
 *
 * Used by the segment layouts, which is what makes one guard cover both the
 * server pages and the "use client" ones — several gated screens (Model & API
 * keys, Integrations) are client components and cannot check this themselves.
 *
 * Still not the security boundary. Postgres is. A layout that forgot to call
 * this leaks a screen, not the data behind it.
 */
export async function checkRouteAccess(
  href: string,
): Promise<{ allowed: boolean; needed: string | null }> {
  const needed = ROUTE_PERMISSION[href] ?? null;
  if (needed === null) return { allowed: true, needed };

  const mine = await getMyPermissions();
  return { allowed: mine.includes(needed), needed };
}

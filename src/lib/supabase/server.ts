import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Cookie-bound client for server components and route handlers. Subject to RLS.
 * Wrapped in cache() so layout + page share one client per request instead of
 * constructing (and cookie-parsing) it repeatedly.
 */
export const supabaseServer = cache(async () => {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart `npm run dev`. See /setup."
    );
  }
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: CookieToSet[]) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options })
            );
          } catch {
            // Called from a Server Component — refresh is handled by middleware.
          }
        },
      },
    }
  );
});

/**
 * auth.getUser() is a network round trip to the Supabase auth server, not a
 * cookie read. Layout and page both need the user, so without this cache()
 * every navigation paid for the same validation twice.
 */
export const getAuthUser = cache(async () => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return user;
});

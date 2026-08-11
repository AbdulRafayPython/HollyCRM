import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Keeps the Supabase auth cookie fresh for server components. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before .env.local is filled in there is no session to refresh. Pass the
  // request through so the app can render its setup screen instead of throwing
  // an opaque client-construction error on every route.
  if (!isSupabaseConfigured()) return response;

  // Router prefetches only fetch the loading boundary of dynamic routes; they
  // don't need a token refresh, and each getUser() below is a network round
  // trip. The real navigation that follows still refreshes.
  if (
    request.headers.get("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return response;
  }

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set({ name, value, ...options })
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Everything except static assets and the Green API webhook (which authenticates
  // with its own Bearer token and must never be redirected to a login page).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhook).*)"],
};

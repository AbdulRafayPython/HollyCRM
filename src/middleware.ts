import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Keeps the Supabase auth cookie fresh and protects app workstation routes. */
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

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/landing" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/setup" ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/invite");

  // Protect workstation routes against unauthenticated access via clean HTTP redirect
  if (!user && !isPublicRoute) {
    // `request.nextUrl`, not `request.url`: Next resolves nextUrl against the
    // forwarded host, so behind Vercel's proxy the redirect stays on the domain
    // the visitor is actually using instead of jumping to the internal one.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Everything except static assets and the Green API webhook (which authenticates
  // with its own Bearer token and must never be redirected to a login page).
  //
  // Files served straight out of public/ (landing imagery, banners, fonts) do
  // NOT live under _next/static, so without the extension guard below every one
  // of them 307s a logged-out visitor to /login and the landing page renders
  // with empty image frames. Signed-in developers never see it locally because
  // their session cookie makes the redirect branch unreachable.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|mp4|webm|woff|woff2|ttf|otf|txt|xml|json|pdf|zip)$).*)",
  ],
};

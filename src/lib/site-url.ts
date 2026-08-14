/**
 * The public origin of the current request.
 *
 * Route handlers must not build redirects from `new URL(req.url).origin`.
 * Behind Vercel's proxy `req.url` carries the *internal* host the function was
 * invoked on, not the domain the visitor typed — so after Google OAuth the
 * callback would bounce the user to a deployment URL instead of the site. The
 * session cookies are scoped to the real domain, so the user lands signed-out
 * on a URL they have never seen.
 *
 * `x-forwarded-host` is the header the proxy sets to the host the browser
 * actually asked for, which is what a redirect has to be built from. It also
 * keeps preview deployments self-consistent: a preview redirects back to
 * itself rather than to production, which a hardcoded domain would not do.
 *
 * Falls back to the request's own origin so local development, where no proxy
 * headers exist, behaves exactly as before.
 */
export function siteOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  if (!host) return new URL(req.url).origin;

  // Locally there is no `x-forwarded-proto` and the request really is http,
  // so read the scheme off the request rather than assuming https.
  const proto =
    req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");

  return `${proto}://${host}`;
}

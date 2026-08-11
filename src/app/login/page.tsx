"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";

// Inlined into the browser bundle when the dev server STARTS. Editing .env.local
// while `npm run dev` is running does not change what the browser already has.
const CLIENT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLIENT_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const looksUnset = (v?: string) =>
  !v || !v.trim() || v.includes("xxxxxxxx") || v.startsWith("<");

/** Official multi-color Google G. Inline SVG — no external asset, CSP-safe. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const stale = looksUnset(CLIENT_URL) || looksUnset(CLIENT_KEY);

  // Errors bounced back from /auth/callback (cancelled Google screen, expired
  // recovery link) arrive as ?error=. Surface them, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromCallback = params.get("error");
    if (fromCallback) {
      setError(fromCallback);
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        if (/fetch/i.test(error.message)) {
          setHint(
            `The browser tried to reach ${CLIENT_URL ?? "(no URL configured)"} and got no response. ` +
              `If that is not your Supabase URL, stop the dev server and run npm run dev again.`
          );
        }
      } else {
        router.push("/inbox");
        router.refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/inbox`,
          queryParams: { prompt: "select_account" },
        },
      });
      // On success the browser navigates away; only an error leaves us here.
      if (error) {
        setError(
          /provider is not enabled/i.test(error.message)
            ? "Google sign-in is not switched on yet in Supabase (Authentication → Providers → Google)."
            : error.message
        );
        setGoogleBusy(false);
      }
    } catch (err) {
      setError(String(err));
      setGoogleBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex h-16 shrink-0 items-center px-8">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-body font-bold text-wa">
            H
          </span>
          <span className="text-h3 tracking-tight text-ink">HollyCRM</span>
        </span>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        <form onSubmit={signIn} className="w-full max-w-[420px]">
          <h1 className="mb-8 text-center text-[40px] font-semibold leading-tight tracking-tight text-ink">
            Log in
          </h1>

          {stale && (
            <div className="mb-5 rounded-lg border border-bot/30 bg-bot-soft p-3 text-caption text-bot-dark">
              This page was built without valid Supabase credentials. Stop the dev server
              and run <code className="font-mono">npm run dev</code> again —{" "}
              <code className="font-mono">NEXT_PUBLIC_*</code> values are baked into the
              browser bundle at startup.
            </div>
          )}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={googleBusy}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-edge bg-card text-body font-medium text-ink transition-colors duration-150 ease-swift hover:bg-surface disabled:opacity-60"
          >
            <GoogleG />
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="my-5 flex items-center gap-3 text-caption text-subtle">
            <span className="h-px flex-1 bg-edge" />
            or
            <span className="h-px flex-1 bg-edge" />
          </div>

          <div className="relative mb-3">
            <Icon
              name="mail"
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              className="field h-14 rounded-lg pl-12 text-body"
              placeholder="Email"
              type="email"
              value={email}
              required
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative mb-2">
            <Icon
              name="lock"
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              className="field h-14 rounded-lg pl-12 pr-20 text-body"
              placeholder="Password"
              type={reveal ? "text" : "password"}
              value={password}
              required
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-meta font-medium text-muted transition-colors duration-150 ease-swift hover:text-ink"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>

          <div className="mb-6 text-right">
            <Link
              href="/forgot-password"
              className="text-meta font-medium text-brand transition-colors duration-150 ease-swift hover:text-ink"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px" />
              <span>{error}</span>
            </p>
          )}
          {hint && <p className="mb-4 text-caption text-bot-dark">{hint}</p>}

          <button disabled={busy} className="btn-primary h-14 w-full rounded-lg text-body">
            {busy ? "Signing in…" : "Log in"}
          </button>

          <p className="mt-4 text-center text-meta text-muted">
            No workspace yet?{" "}
            <Link
              href="/signup"
              className="font-medium text-brand transition-colors duration-150 ease-swift hover:text-ink"
            >
              Create one
            </Link>
          </p>

          <div className="my-6 border-t border-edge" />

          <p className="text-center text-meta text-muted">
            New team members can join with their Google account.
          </p>

          <p className="mt-6 break-all text-center text-caption text-subtle">
            Connecting to {CLIENT_URL ?? "(not configured)"}
          </p>
        </form>
      </div>
    </div>
  );
}

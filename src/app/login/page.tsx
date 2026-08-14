"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import AuthShell from "@/components/auth/AuthShell";
import {
  AuthError,
  AuthInput,
  GoogleButton,
  MobileHero,
  OrDivider,
  PasswordInput,
} from "@/components/auth/AuthBits";

// Inlined into the browser bundle when the dev server STARTS. Editing .env.local
// while `npm run dev` is running does not change what the browser already has.
const CLIENT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLIENT_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const looksUnset = (v?: string) =>
  !v || !v.trim() || v.includes("xxxxxxxx") || v.startsWith("<");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <AuthShell>
      <form onSubmit={signIn}>
        <MobileHero />

        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
          Welcome back to HollyCRM
        </h1>
        <p className="mt-1.5 text-body text-muted">Sign in to your workspace</p>

        {stale && (
          <div className="mt-5 rounded-xl border border-bot/30 bg-bot-soft p-3 text-caption text-bot-dark">
            This page was built without valid Supabase credentials. Stop the dev server and run{" "}
            <code className="font-mono">npm run dev</code> again —{" "}
            <code className="font-mono">NEXT_PUBLIC_*</code> values are baked into the browser
            bundle at startup.
          </div>
        )}

        <div className="mt-6">
          <GoogleButton onClick={signInWithGoogle} busy={googleBusy} label="Continue with Google" />
        </div>

        <OrDivider />

        <div className="space-y-3">
          <AuthInput
            icon="mail"
            label="Email"
            placeholder="Email"
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordInput
            label="Password"
            placeholder="Password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="mb-6 mt-3 text-right">
          <Link
            href="/forgot-password"
            className="rounded text-meta font-medium text-brand transition-colors duration-150 ease-swift hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Forgot password?
          </Link>
        </div>

        {error && <AuthError>{error}</AuthError>}
        {hint && <p className="mb-4 text-caption text-bot-dark">{hint}</p>}

        <button
          disabled={busy}
          className="btn-primary h-14 w-full rounded-xl text-body shadow-pop shadow-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {busy ? "Signing in…" : "Log in"}
        </button>

        <p className="mt-5 text-center text-meta text-muted">
          No workspace yet?{" "}
          <Link
            href="/signup"
            className="rounded font-semibold text-brand transition-colors duration-150 ease-swift hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Create one
          </Link>
        </p>

        <p className="mt-2 text-center text-caption text-subtle">
          New team members can join with their Google account.
        </p>

        {/*
          This prints the project's Supabase URL. Useful while wiring the app up,
          not something to put on screen in front of a customer — so it is
          development-only rather than deleted outright.
        */}
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-6 break-all text-center text-caption text-subtle">
            Connecting to {CLIENT_URL ?? "(not configured)"}
          </p>
        )}
      </form>
    </AuthShell>
  );
}

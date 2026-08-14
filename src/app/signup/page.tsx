"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";
import AuthShell from "@/components/auth/AuthShell";
import {
  AuthError,
  AuthInput,
  GoogleButton,
  MobileHero,
  OrDivider,
  PasswordInput,
} from "@/components/auth/AuthBits";

/**
 * Creating a workspace.
 *
 * Signing up here makes you the OWNER of a brand new workspace with its own
 * WhatsApp connection, its own conversations and its own team — nothing is
 * shared with any other account. People who join an existing workspace do not
 * come through this page; they use an invite link, which carries the token that
 * puts them in the right place.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: signUpError } = await supabaseBrowser().auth.signUp({
      email,
      password,
      // handle_new_user() reads these: the workspace is created and owned in
      // the same transaction as the account.
      options: { data: { full_name: fullName, workspace_name: workspace.trim() } },
    });

    if (signUpError) {
      setBusy(false);
      setError(
        /already registered/i.test(signUpError.message)
          ? "That address already has an account. Sign in instead."
          : signUpError.message
      );
      return;
    }

    if (!data.session) {
      setBusy(false);
      setCheck(true);
      return;
    }

    router.push("/settings/whatsapp");
    router.refresh();
  }

  /**
   * Signing up with Google carries no workspace name, so handle_new_user() falls
   * back to "<name>'s workspace" — the account still lands in a workspace it
   * owns, which is exactly what this page promises.
   */
  async function signUpWithGoogle() {
    setGoogleBusy(true);
    setError(null);
    try {
      const { error: oauthError } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings/whatsapp`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) {
        setError(
          /provider is not enabled/i.test(oauthError.message)
            ? "Google sign-in is not switched on yet in Supabase (Authentication → Providers → Google)."
            : oauthError.message
        );
        setGoogleBusy(false);
      }
    } catch (err) {
      setError(String(err));
      setGoogleBusy(false);
    }
  }

  if (check) {
    return (
      <AuthShell>
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            <Icon name="mail" size={22} className="text-brand" />
          </span>
          <h1 className="text-h2 text-ink">Confirm your email</h1>
          <p className="mt-2 text-body text-muted">
            We sent a link to {email}. Open it and your workspace is ready.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded text-meta font-semibold text-brand hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={create}>
        <MobileHero />

        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
          Create your HolyCRM workspace
        </h1>
        <p className="mt-1.5 text-body text-muted">
          Your own CRM, your own WhatsApp number, your own team.
        </p>

        <div className="mt-6">
          <GoogleButton onClick={signUpWithGoogle} busy={googleBusy} label="Continue with Google" />
        </div>

        <OrDivider />

        <div className="space-y-3">
          <AuthInput
            icon="hub"
            label="Company or team name"
            placeholder="Holyland Hospitality"
            value={workspace}
            required
            onChange={(e) => setWorkspace(e.target.value)}
          />

          <AuthInput
            icon="user"
            label="Your name"
            placeholder="Full name"
            value={fullName}
            required
            autoComplete="name"
            onChange={(e) => setFullName(e.target.value)}
          />

          <AuthInput
            icon="mail"
            label="Work email"
            placeholder="you@company.com"
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordInput
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            required
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="mt-4"><AuthError>{error}</AuthError></div>}

        <button
          disabled={busy}
          className="btn-primary mt-5 h-14 w-full rounded-xl text-body shadow-pop shadow-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {busy ? "Creating…" : "Create workspace"}
        </button>

        <p className="mt-5 text-center text-meta text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="rounded font-semibold text-brand transition-colors duration-150 ease-swift hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Log in
          </Link>
        </p>

        <p className="mt-2 text-center text-caption text-subtle">
          Joining a team? Use the invite link your owner sent you.
        </p>
      </form>
    </AuthShell>
  );
}

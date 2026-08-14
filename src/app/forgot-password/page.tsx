"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) setError(error.message);
      // Standard practice: show the same confirmation whether or not the account
      // exists, so this form cannot be used to probe for registered emails.
      else setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex h-16 shrink-0 items-center px-8">
        <Link href="/login" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-body font-bold text-wa">
            H
          </span>
          <span className="text-h3 tracking-tight text-ink">HolyCRM</span>
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[420px]">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-wa-soft text-wa">
                <Icon name="mail" size={26} />
              </span>
              <h1 className="text-h1 text-ink">Check your email</h1>
              <p className="mx-auto mt-3 max-w-sm text-body text-muted">
                If an account exists for <strong className="text-ink">{email}</strong>, a
                password-reset link is on its way. Open it in this browser to choose a new
                password. The link expires after one hour.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-block text-meta font-medium text-brand hover:text-ink"
              >
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={requestReset}>
              <h1 className="mb-2 text-center text-[40px] font-semibold leading-tight tracking-tight text-ink">
                Reset password
              </h1>
              <p className="mb-8 text-center text-body text-muted">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <div className="relative mb-6">
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

              {error && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
                  <Icon name="alert" size={15} className="mt-px" />
                  <span>{error}</span>
                </p>
              )}

              <button disabled={busy} className="btn-primary h-14 w-full rounded-lg text-body">
                {busy ? "Sending…" : "Send reset link"}
              </button>

              <p className="mt-6 text-center">
                <Link href="/login" className="text-meta font-medium text-brand hover:text-ink">
                  Back to log in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

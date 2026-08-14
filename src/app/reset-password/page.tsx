"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";

/**
 * Landing page for the recovery link. The /auth/callback route has already
 * exchanged the emailed token for a session, so by the time the user is here
 * they are signed in — this page only sets the new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data: { user } }) => {
        setHasSession(Boolean(user));
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      router.push("/inbox");
      router.refresh();
    } catch (err) {
      setError(String(err));
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
          {checking ? (
            <p className="text-center text-body text-muted">Checking your link…</p>
          ) : !hasSession ? (
            <div className="text-center">
              <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
                <Icon name="alert" size={26} />
              </span>
              <h1 className="text-h1 text-ink">Link invalid or expired</h1>
              <p className="mx-auto mt-3 max-w-sm text-body text-muted">
                Reset links work once and expire after an hour. Request a fresh one and
                open it in this same browser.
              </p>
              <Link
                href="/forgot-password"
                className="btn-primary mt-8 inline-block rounded-lg px-6 py-3 text-body"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={save}>
              <h1 className="mb-2 text-center text-[40px] font-semibold leading-tight tracking-tight text-ink">
                New password
              </h1>
              <p className="mb-8 text-center text-body text-muted">
                Choose a new password for your account.
              </p>

              <div className="relative mb-3">
                <Icon
                  name="lock"
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  className="field h-14 rounded-lg pl-12 pr-20 text-body"
                  placeholder="New password (min 8 characters)"
                  type={reveal ? "text" : "password"}
                  value={password}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-meta font-medium text-muted hover:text-ink"
                >
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>

              <div className="relative mb-6">
                <Icon
                  name="lock"
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  className="field h-14 rounded-lg pl-12 text-body"
                  placeholder="Repeat new password"
                  type={reveal ? "text" : "password"}
                  value={confirm}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              {error && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
                  <Icon name="alert" size={15} className="mt-px" />
                  <span>{error}</span>
                </p>
              )}

              <button disabled={busy} className="btn-primary h-14 w-full rounded-lg text-body">
                {busy ? "Saving…" : "Save and log in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

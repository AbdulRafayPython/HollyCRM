"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "./ui/Icon";

/**
 * Joining a workspace from an invite link.
 *
 * The token rides along in the signup metadata, and app.handle_new_user() is
 * what actually reads it, places the profile in that workspace and marks the
 * invitation consumed — in the same transaction that creates the user. Doing it
 * here in the client would leave a window where an account exists with no
 * workspace, which is the state that produces an empty app and no error.
 */
export default function AcceptInvite({
  token,
  workspace,
  email,
}: {
  token: string;
  workspace: string;
  email: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Two steps, and no email anywhere: the server creates the account
   * pre-confirmed against the invited address, then we sign in with the
   * password just chosen. Going through auth.signUp() here would trigger a
   * confirmation email and run into Supabase's built-in SMTP rate limit.
   */
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fullName, password }),
    }).catch(() => null);
    const json = await res?.json().catch(() => ({}));

    if (!res?.ok) {
      setBusy(false);
      setError(json?.error ?? "Could not join the workspace.");
      return;
    }

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: json.email,
      password,
    });
    setBusy(false);

    if (signInError) {
      // The account exists either way, so send them to sign in rather than
      // leaving them staring at a form that would now fail as "already registered".
      setError(`Your account was created. Sign in at /login with ${json.email}.`);
      return;
    }

    router.push("/inbox");
    router.refresh();
  }

  return (
    <form onSubmit={join} className="panel space-y-4 p-6">
      <div>
        <p className="text-h3 text-ink">Join {workspace}</p>
        <p className="mt-1 text-meta text-muted">
          You will be added as a sales agent and see this workspace&apos;s conversations.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-meta font-medium text-ink">Your name</span>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="field"
        />
      </label>

      {/* Fixed, not editable: the account is created already confirmed, so it
          may only ever be the address the owner actually invited. */}
      <label className="block">
        <span className="mb-1 block text-meta font-medium text-ink">Email</span>
        <input value={email} readOnly disabled className="field bg-surface text-muted" />
        <span className="mt-1 block text-caption text-subtle">
          Set by the invitation. Ask the owner to re-invite a different address if this is wrong.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-meta font-medium text-ink">Password</span>
        <span className="relative block">
          <input
            required
            minLength={8}
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="field pr-16"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-caption text-muted hover:bg-surface"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </span>
      </label>

      {error && (
        <p className="flex items-start gap-2 text-meta text-danger">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button disabled={busy} className="btn-primary w-full py-2.5">
        {busy ? "Joining…" : `Join ${workspace}`}
      </button>
    </form>
  );
}

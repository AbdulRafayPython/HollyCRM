"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";

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
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
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

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex h-16 shrink-0 items-center justify-between px-8">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-body font-bold text-wa">
            H
          </span>
          <span className="text-h3 tracking-tight text-ink">HollyCRM</span>
        </span>
        <Link href="/login" className="text-body text-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        {check ? (
          <div className="panel max-w-[420px] p-6 text-center">
            <Icon name="mail" size={24} className="mx-auto mb-3 text-brand" />
            <p className="text-h3 text-ink">Confirm your email</p>
            <p className="mt-1 text-body text-muted">
              We sent a link to {email}. Open it and your workspace is ready.
            </p>
          </div>
        ) : (
          <form onSubmit={create} className="w-full max-w-[420px] space-y-4">
            <div className="mb-2 text-center">
              <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink">
                Create your workspace
              </h1>
              <p className="mt-1 text-body text-muted">
                Your own CRM, your own WhatsApp number, your own team.
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Company or team name</span>
              <input
                required
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="Acme Sales"
                className="field"
              />
            </label>

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

            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Work email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="field"
              />
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
              {busy ? "Creating…" : "Create workspace"}
            </button>

            <p className="text-center text-meta text-muted">
              Joining a team? Use the invite link your owner sent you.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

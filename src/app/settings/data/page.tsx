"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";

interface Preview {
  total: number;
  archived: number;
  no_value: number;
  protected: number;
  messages: number;
}

type Scope = "archived" | "no_value" | "all";

/**
 * Settings → Data cleanup.
 *
 * Scoped bulk delete rather than a single "clear everything" button: the count
 * is previewed before anything happens, conversations that produced a quote or
 * a won deal are structurally excluded from the safe scopes, and the full reset
 * is clearly marked as the destructive one.
 */
export default function DataSettingsPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [scope, setScope] = useState<Scope>("no_value");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings/cleanup");
    if (res.ok) setPreview((await res.json()).preview);
    else setError("Could not load counts");
  }
  useEffect(() => { load(); }, []);

  const counts: Record<Scope, number> = {
    archived: preview?.archived ?? 0,
    no_value: preview?.no_value ?? 0,
    all: preview?.total ?? 0,
  };

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await fetch("/api/settings/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, confirm: confirmText }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Cleanup failed");
      return;
    }
    setDone(
      `${json.deleted} conversation${json.deleted === 1 ? "" : "s"} deleted` +
        (json.filesRemoved ? ` · ${json.filesRemoved} files removed` : "")
    );
    setConfirmText("");
    await load();
    router.refresh();
  }

  const OPTIONS: { key: Scope; label: string; hint: string; danger?: boolean }[] = [
    {
      key: "archived",
      label: "Archived conversations only",
      hint: "Chats your team already closed out. The safest option.",
    },
    {
      key: "no_value",
      label: "Test & idle conversations",
      hint: "Chats that never produced a quote and never closed won — test messages and small talk. Quoted and won conversations are kept.",
    },
    {
      key: "all",
      label: "Everything — full reset",
      hint: "All conversations, messages, leads, quotes, contacts and logs. Hotels, staff accounts and settings are kept.",
      danger: true,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/settings" className="btn-ghost rounded-full p-1.5" title="Back to settings">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-h1 text-ink">Data cleanup</h1>
        {preview && (
          <span className="text-meta text-muted">
            {preview.total} conversations · {preview.messages} messages
          </span>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <section className="panel p-5">
            <h2 className="text-h3 text-ink">Before you clean up</h2>
            <p className="mt-1.5 text-body text-muted">
              Disconnecting a WhatsApp number never deletes conversations — that is
              deliberate, and it matches how Kommo and HubSpot behave. Your history is a
              business record: it survives the connection so a returning customer keeps
              their context, and an accidental disconnect can&apos;t wipe your pipeline.
            </p>
            {preview && preview.protected > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-wa/25 bg-wa-soft p-3 text-meta text-ink">
                <Icon name="check" size={15} className="mt-px text-wa" />
                <span>
                  <strong className="font-medium">{preview.protected}</strong> conversation
                  {preview.protected === 1 ? " has" : "s have"} a quote or a won deal. The first
                  two options below never touch those.
                </span>
              </p>
            )}
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="text-h3 text-ink">What should be deleted?</h2>

            {OPTIONS.map((o) => (
              <label
                key={o.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition duration-150 ease-swift ${
                  scope === o.key
                    ? o.danger
                      ? "border-danger bg-danger-soft"
                      : "border-brand bg-brand-soft"
                    : "border-edge hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  className="mt-1"
                  checked={scope === o.key}
                  onChange={() => { setScope(o.key); setConfirmText(""); setError(null); }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-body font-medium text-ink">
                    {o.label}
                    <Chip tone={o.danger ? "danger" : "neutral"}>
                      {counts[o.key]} chat{counts[o.key] === 1 ? "" : "s"}
                    </Chip>
                  </span>
                  <span className="mt-0.5 block text-caption text-muted">{o.hint}</span>
                </span>
              </label>
            ))}
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-h3 text-danger">
              <Icon name="alert" size={16} />
              This cannot be undone
            </h2>
            <p className="text-meta text-muted">
              {counts[scope]} conversation{counts[scope] === 1 ? "" : "s"} and everything attached
              to {counts[scope] === 1 ? "it" : "them"} — messages, leads, notes, quotes and uploaded
              files — will be permanently deleted.
            </p>

            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="field rounded-lg py-2.5 text-meta"
            />

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
                <Icon name="alert" size={15} className="mt-px" />
                {error}
              </p>
            )}
            {done && (
              <p className="flex items-start gap-2 rounded-lg border border-wa/25 bg-wa-soft p-3 text-meta text-ink">
                <Icon name="check" size={15} className="mt-px text-wa" />
                {done}
              </p>
            )}

            <button
              disabled={busy || confirmText !== "DELETE" || counts[scope] === 0}
              onClick={run}
              className="w-full rounded-lg bg-danger px-4 py-2.5 text-meta font-medium text-white transition duration-150 ease-swift hover:opacity-90 disabled:opacity-40"
            >
              {busy
                ? "Deleting…"
                : counts[scope] === 0
                  ? "Nothing to delete in this scope"
                  : `Delete ${counts[scope]} conversation${counts[scope] === 1 ? "" : "s"}`}
            </button>
            <p className="text-center text-caption text-subtle">Supervisors only.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

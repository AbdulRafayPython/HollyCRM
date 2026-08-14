"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import SettingsNav from "@/components/settings/SettingsNav";

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
      hint: "Chats your team already closed out and archived. The safest cleanup option.",
    },
    {
      key: "no_value",
      label: "Test & idle conversations",
      hint: "Chats that never produced a quote and never converted — test inquiries and small talk. Quoted and won deals are permanently preserved.",
    },
    {
      key: "all",
      label: "Everything — full workspace reset",
      hint: "All conversations, messages, leads, quotes, contacts and logs. Hotel rates, team members and settings are preserved.",
      danger: true,
    },
  ];

  return (
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">Workspace Data Cleanup</h1>
            <p className="text-xs text-subtle">Scoped bulk data cleanup and message pruning controls</p>
          </div>
          {preview && (
            <span className="rounded-full bg-chalk px-3 py-1 text-xs font-semibold text-muted">
              {preview.total} chats · {preview.messages} messages
            </span>
          )}
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-surface">
          <div className="max-w-4xl mx-auto space-y-6">
            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-ink">About Data Retention</h2>
              <p className="text-xs text-muted leading-relaxed">
                Disconnecting a WhatsApp number never deletes customer conversations. Your message history serves as a permanent agency record so returning pilgrims keep their booking context.
              </p>
              {preview && preview.protected > 0 && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-wa-soft bg-wa-soft p-3.5 text-xs text-wa-dark">
                  <Icon name="check" size={16} className="mt-0.5 text-wa-dark shrink-0" />
                  <span>
                    <strong className="font-bold">{preview.protected}</strong> conversation
                    {preview.protected === 1 ? " has" : "s have"} an active quotation or won booking deal. Safe cleanup scopes will strictly protect these records.
                  </span>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-ink">Select Cleanup Scope</h2>

              <div className="space-y-3">
                {OPTIONS.map((o) => (
                  <label
                    key={o.key}
                    className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all duration-150 ${
                      scope === o.key
                        ? o.danger
                          ? "border-danger bg-danger-soft/70 ring-1 ring-danger/20"
                          : "border-brand bg-brand-soft/70 ring-1 ring-brand/20"
                        : "border-edge bg-white hover:border-edge-strong hover:bg-surface/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scope"
                      className="mt-1"
                      checked={scope === o.key}
                      onChange={() => { setScope(o.key); setConfirmText(""); setError(null); }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">{o.label}</span>
                        <Chip tone={o.danger ? "danger" : "neutral"}>
                          {counts[o.key]} chat{counts[o.key] === 1 ? "" : "s"}
                        </Chip>
                      </div>
                      <span className="mt-1 block text-xs text-muted leading-relaxed">{o.hint}</span>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-danger-soft bg-danger-soft/30 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-danger-dark">
                <Icon name="alert" size={18} />
                <h2 className="text-sm font-bold">Confirmation Required</h2>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {counts[scope]} conversation{counts[scope] === 1 ? "" : "s"} and all associated data in this scope will be permanently removed.
              </p>

              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full rounded-xl border border-edge bg-white px-3.5 py-2 text-xs text-ink focus:border-danger focus:outline-none transition"
              />

              {error && (
                <p className="flex items-start gap-2 rounded-2xl border border-danger-soft bg-danger-soft p-3 text-xs font-medium text-danger-dark">
                  <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
              {done && (
                <p className="flex items-start gap-2 rounded-2xl border border-wa-soft bg-wa-soft p-3 text-xs font-medium text-wa-dark">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-wa-dark" />
                  <span>{done}</span>
                </p>
              )}

              <button
                disabled={busy || confirmText !== "DELETE" || counts[scope] === 0}
                onClick={run}
                className="w-full rounded-xl bg-danger px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-danger-dark transition disabled:opacity-40"
              >
                {busy
                  ? "Deleting…"
                  : counts[scope] === 0
                    ? "Nothing to delete in this scope"
                    : `Permanently Delete ${counts[scope]} Conversation${counts[scope] === 1 ? "" : "s"}`}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

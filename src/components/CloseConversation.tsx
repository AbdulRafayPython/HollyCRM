"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";

const DROP_PRESETS = ["Price too high", "Dates unavailable", "Went with competitor", "No response"];

/**
 * "Close conversation" wraps up without destroying anything: the lead is marked
 * won/lost (or left open), the bot is paused, the chat is archived. Permanent
 * deletion is a separate supervisor-only act inside the dialog's danger zone,
 * intended for spam and test chats — it requires typing DELETE because the
 * cascade takes messages, leads, quotes and analytics history with it.
 */
export default function CloseConversation({
  chatId,
  chatTitle,
  isSupervisor,
}: {
  chatId: string;
  chatTitle: string;
  isSupervisor: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"close" | "delete">("close");
  const [outcome, setOutcome] = useState<"won" | "lost" | "archive_only">("won");
  const [dropReason, setDropReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setMode("close");
    setOutcome("won");
    setDropReason("");
    setConfirmText("");
    setError(null);
  }

  async function closeConversation() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/chats/${chatId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome,
        ...(outcome === "lost" ? { dropReason } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to close");
      return;
    }
    reset();
    router.refresh();
  }

  async function deleteConversation() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to delete");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Close this conversation"
        className="flex items-center gap-1.5 rounded-lg border border-edge bg-card px-3 py-2 text-meta font-medium text-ink transition duration-150 ease-swift hover:bg-surface"
      >
        <Icon name="check" size={15} className="text-wa" />
        Close
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={reset}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-card p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "close" ? (
              <>
                <h2 className="text-h3 text-ink">Close this conversation?</h2>
                <p className="mt-1 text-meta text-muted">
                  The chat is archived and the AI pauses. Nothing is deleted — messages,
                  quotes and history stay available, and the customer can always come back.
                </p>

                <div className="mt-4 space-y-2">
                  {(
                    [
                      { key: "won", label: "Deal won", hint: "Voucher issued — mark the lead as won", icon: "check", tone: "text-wa" },
                      { key: "lost", label: "Deal lost", hint: "Archive with a reason for the report", icon: "close", tone: "text-danger" },
                      { key: "archive_only", label: "Just archive", hint: "No deal outcome — tidy the inbox only", icon: "archive", tone: "text-muted" },
                    ] as const
                  ).map((o) => (
                    <label
                      key={o.key}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition duration-150 ease-swift ${
                        outcome === o.key ? "border-brand bg-brand-soft" : "border-edge hover:bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        name="outcome"
                        className="mt-1"
                        checked={outcome === o.key}
                        onChange={() => setOutcome(o.key)}
                      />
                      <span className="min-w-0">
                        <span className={`flex items-center gap-1.5 text-body font-medium text-ink`}>
                          <Icon name={o.icon} size={14} className={o.tone} />
                          {o.label}
                        </span>
                        <span className="text-caption text-muted">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {outcome === "lost" && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {DROP_PRESETS.map((p) => (
                        <button
                          key={p}
                          onClick={() => setDropReason(p)}
                          className={`rounded-full px-2.5 py-1 text-caption transition duration-150 ease-swift ${
                            dropReason === p
                              ? "bg-danger text-white"
                              : "border border-edge bg-card text-muted hover:bg-surface hover:text-ink"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <input
                      value={dropReason}
                      onChange={(e) => setDropReason(e.target.value)}
                      placeholder="Reason (required)"
                      className="field mt-2 rounded-lg py-2.5 text-meta"
                    />
                  </div>
                )}

                {error && <p className="mt-3 text-meta text-danger-dark">{error}</p>}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={reset} className="btn-ghost rounded-lg px-4 py-2 text-meta">
                    Cancel
                  </button>
                  <button
                    disabled={busy || (outcome === "lost" && !dropReason.trim())}
                    onClick={closeConversation}
                    className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
                  >
                    {busy ? "Closing…" : "Close conversation"}
                  </button>
                </div>

                {isSupervisor && (
                  <div className="mt-5 border-t border-edge pt-3">
                    <button
                      onClick={() => setMode("delete")}
                      className="text-caption font-medium text-danger hover:underline"
                    >
                      Delete this conversation permanently…
                    </button>
                    <span className="ml-2 text-caption text-subtle">
                      for spam or test chats only
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="flex items-center gap-2 text-h3 text-danger">
                  <Icon name="alert" size={16} />
                  Delete permanently?
                </h2>
                <p className="mt-2 text-meta text-muted">
                  This erases <strong className="text-ink">{chatTitle}</strong> completely:
                  all messages, the lead, its quotes, documents and analytics history.
                  There is no undo. Real customer conversations should be{" "}
                  <strong className="text-ink">closed</strong>, never deleted.
                </p>

                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type DELETE to confirm'
                  autoFocus
                  className="field mt-4 rounded-lg py-2.5 text-meta"
                />

                {error && <p className="mt-3 text-meta text-danger-dark">{error}</p>}

                <div className="mt-5 flex items-center justify-between">
                  <button
                    onClick={() => { setMode("close"); setConfirmText(""); setError(null); }}
                    className="btn-ghost rounded-lg px-4 py-2 text-meta"
                  >
                    Back
                  </button>
                  <button
                    disabled={busy || confirmText !== "DELETE"}
                    onClick={deleteConversation}
                    className="rounded-lg bg-danger px-4 py-2 text-meta font-medium text-white transition duration-150 ease-swift hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

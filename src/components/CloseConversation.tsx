"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";

const DROP_PRESETS = ["Price too high", "Dates unavailable", "Went with competitor", "No response"];

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
        type="button"
        title="Close this conversation"
        className="flex items-center gap-1 rounded-xl border border-edge bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition shadow-2xs shrink-0"
      >
        <Icon name="check" size={13} className="text-wa-dark" />
        <span>Close</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-4 animate-fade-in"
          onClick={reset}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-edge bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "close" ? (
              <>
                <div className="flex items-center justify-between border-b border-edge pb-3">
                  <h2 className="text-base font-bold text-ink">Close this conversation?</h2>
                  <button onClick={reset} className="text-subtle hover:text-ink-soft">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  The chat will be archived and the AI will pause. All message history and analytics are preserved.
                </p>

                {error && (
                  <p className="rounded-xl border border-danger-soft bg-danger-soft p-2.5 text-xs text-danger-dark font-medium">
                    {error}
                  </p>
                )}

                <div className="space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-subtle">
                    Lead Outcome
                  </span>
                  <div className="space-y-1.5">
                    {[
                      { key: "won", label: "Mark as Won (Voucher Issued)", desc: "Deal converted successfully" },
                      { key: "lost", label: "Mark as Lost", desc: "Customer did not convert" },
                      { key: "archive_only", label: "Leave lead stage unchanged", desc: "Just archive the thread" },
                    ].map((opt) => (
                      <label
                        key={opt.key}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                          outcome === opt.key
                            ? "border-brand bg-brand-soft/50"
                            : "border-edge hover:bg-surface"
                        }`}
                      >
                        <input
                          type="radio"
                          name="outcome"
                          value={opt.key}
                          checked={outcome === opt.key}
                          onChange={() => setOutcome(opt.key as typeof outcome)}
                          className="mt-0.5 text-brand focus:ring-brand"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-ink">{opt.label}</p>
                          <p className="text-[11px] text-muted">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {outcome === "lost" && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-ink-soft">
                      Reason for closing as lost
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {DROP_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDropReason(p)}
                          className={`rounded-lg px-2.5 py-1 text-xs transition ${
                            dropReason === p
                              ? "bg-danger-soft text-danger-dark font-semibold"
                              : "border border-edge bg-surface text-muted hover:bg-chalk"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Or enter a custom reason…"
                      value={dropReason}
                      onChange={(e) => setDropReason(e.target.value)}
                      className="w-full rounded-xl border border-edge px-3 py-2 text-xs focus:border-brand focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-edge">
                  {isSupervisor ? (
                    <button
                      type="button"
                      onClick={() => setMode("delete")}
                      className="text-xs font-semibold text-danger hover:underline"
                    >
                      Delete chat…
                    </button>
                  ) : <span />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="rounded-xl px-3.5 py-2 text-xs font-semibold text-muted hover:bg-chalk"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || (outcome === "lost" && !dropReason.trim())}
                      onClick={closeConversation}
                      className="btn-primary rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy ? "Closing…" : "Confirm Close"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Danger Zone: Permanent Delete */
              <>
                <div className="flex items-center justify-between border-b border-danger-soft pb-3">
                  <h2 className="text-base font-bold text-danger-dark">Delete Conversation?</h2>
                  <button onClick={reset} className="text-subtle hover:text-ink-soft">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  This permanently removes the conversation, all messages, and quotes for <span className="font-semibold text-ink">{chatTitle}</span>.
                </p>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink-soft">
                    Type <code className="font-mono font-bold text-danger">DELETE</code> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-xl border border-danger px-3.5 py-2 text-xs font-mono focus:border-danger focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge">
                  <button
                    type="button"
                    onClick={() => setMode("close")}
                    className="rounded-xl px-3.5 py-2 text-xs font-semibold text-muted hover:bg-chalk"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy || confirmText !== "DELETE"}
                    onClick={deleteConversation}
                    className="rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-danger-dark disabled:opacity-50 transition"
                  >
                    {busy ? "Deleting…" : "Permanently Delete"}
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

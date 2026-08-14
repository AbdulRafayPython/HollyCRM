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
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs shrink-0"
      >
        <Icon name="check" size={13} className="text-emerald-600" />
        <span>Close</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in"
          onClick={reset}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "close" ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">Close this conversation?</h2>
                  <button onClick={reset} className="text-slate-400 hover:text-slate-700">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  The chat will be archived and the AI will pause. All message history and analytics are preserved.
                </p>

                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 font-medium">
                    {error}
                  </p>
                )}

                <div className="space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
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
                            ? "border-purple-600 bg-purple-50/50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="outcome"
                          value={opt.key}
                          checked={outcome === opt.key}
                          onChange={() => setOutcome(opt.key as typeof outcome)}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                          <p className="text-[11px] text-slate-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {outcome === "lost" && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-700">
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
                              ? "bg-rose-100 text-rose-800 font-semibold"
                              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
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
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {isSupervisor ? (
                    <button
                      type="button"
                      onClick={() => setMode("delete")}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Delete chat…
                    </button>
                  ) : <span />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={reset}
                      className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
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
                <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                  <h2 className="text-base font-bold text-rose-700">Delete Conversation?</h2>
                  <button onClick={reset} className="text-slate-400 hover:text-slate-700">
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  This permanently removes the conversation, all messages, and quotes for <span className="font-semibold text-slate-900">{chatTitle}</span>.
                </p>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Type <code className="font-mono font-bold text-rose-600">DELETE</code> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-xl border border-rose-300 px-3.5 py-2 text-xs font-mono focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setMode("close")}
                    className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy || confirmText !== "DELETE"}
                    onClick={deleteConversation}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 transition"
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

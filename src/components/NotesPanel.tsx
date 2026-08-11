"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./ui/Avatar";
import Icon from "./ui/Icon";

export interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author?: { full_name: string | null } | null;
}

/** Module 2.2 — team-only notes. Nothing here is ever sent to WhatsApp. */
export default function NotesPanel({
  chatId,
  leadId,
  notes,
}: {
  chatId: string;
  leadId: string | null;
  notes: NoteRow[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/chats/${chatId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, leadId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Amber ground is the signal that this text stays inside the team. */}
      <form onSubmit={add} className="shrink-0 space-y-2 border-b border-edge bg-bot-soft p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Internal note… use @Name to mention a colleague"
          className="field resize-none py-2 text-meta"
        />
        {error && <p className="text-caption text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-caption text-bot-dark">
            <Icon name="lock" size={12} />
            Team only — never sent to WhatsApp
          </p>
          <button disabled={busy || !body.trim()} className="btn-primary px-3 py-1.5 text-caption">
            {busy ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {notes.length === 0 && <p className="text-meta text-muted">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border border-edge bg-card p-2.5 shadow-card">
            <div className="mb-1.5 flex items-center gap-2">
              <Avatar name={n.author?.full_name} size={22} />
              <span className="text-caption font-medium text-ink">
                {n.author?.full_name ?? "System"}
              </span>
              <span className="ml-auto text-caption text-subtle">{stamp(n.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-meta text-ink">{highlight(n.body)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function highlight(text: string) {
  return text.split(/(@[\w.\-]+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="rounded bg-brand-soft px-1 font-medium text-brand">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function stamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

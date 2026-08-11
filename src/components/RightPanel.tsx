"use client";

import { useState } from "react";
import LeadPanel from "./LeadPanel";
import NotesPanel, { type NoteRow } from "./NotesPanel";
import DocumentsPanel from "./DocumentsPanel";
import QuotesPanel, { type QuoteRow } from "./QuotesPanel";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import Icon from "./ui/Icon";
import type { Chat, Lead } from "@/lib/types";

export interface Participant {
  contact_id: string;
  is_admin: boolean;
  display_name: string | null;
  phone: string | null;
}

type Tab = "lead" | "notes" | "docs" | "quotes" | "people";

export default function RightPanel({
  chat,
  lead,
  notes,
  quotes,
  participants,
}: {
  chat: Chat;
  lead: Lead | null;
  notes: NoteRow[];
  quotes: QuoteRow[];
  participants: Participant[];
}) {
  const [tab, setTab] = useState<Tab>("lead");
  const [open, setOpen] = useState(true);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "lead", label: "Lead" },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "docs", label: "Files" },
    { key: "quotes", label: "Quotes", count: quotes.length },
    ...(chat.chat_type === "group"
      ? [{ key: "people" as Tab, label: "People", count: participants.length }]
      : []),
  ];

  // The component that owns the collapse state must own the width. When the
  // 340px lived on a wrapper <aside> in the page, collapsing only emptied the
  // inside and left a 340px blank strip.
  if (!open) {
    return (
      <aside className="z-30 flex h-full w-12 shrink-0 flex-col items-center gap-3 border-l border-edge bg-card py-4">
        <button onClick={() => setOpen(true)} className="btn-ghost p-2" title="Show lead details">
          <Icon name="collapse" size={18} />
        </button>
        <span
          className="mt-1 text-caption font-medium text-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          Lead details
        </span>
      </aside>
    );
  }

  return (
    <aside className="z-30 flex h-full w-[340px] shrink-0 flex-col border-l border-edge bg-card shadow-drawer">
      <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="flex items-center gap-2 text-h3 text-ink">
          <Icon name="contacts" size={18} className="text-brand" />
          Lead details
        </h2>
        <button onClick={() => setOpen(false)} className="btn-ghost p-1.5" title="Collapse panel">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex shrink-0 gap-0.5 border-b border-edge px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-2.5 py-2.5 text-caption font-medium transition-colors duration-150 ease-swift ${
              tab === t.key ? "text-brand" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count ? <span className="ml-1 text-subtle">{t.count}</span> : ""}
            {tab === t.key && (
              <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-t bg-brand" />
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "lead" && <LeadPanel lead={lead} chat={chat} quotes={quotes} />}
        {tab === "notes" && (
          <NotesPanel chatId={chat.id} leadId={lead?.id ?? null} notes={notes} />
        )}
        {tab === "docs" && (
          <DocumentsPanel chatId={chat.id} leadId={lead?.id ?? null} />
        )}
        {tab === "quotes" && <QuotesPanel quotes={quotes} />}
        {tab === "people" && <People participants={participants} />}
      </div>
    </aside>
  );
}

function People({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) {
    return (
      <p className="p-4 text-meta text-muted">
        No participants recorded yet. They are captured as members send messages.
      </p>
    );
  }

  return (
    <div className="scroll-thin h-full space-y-1 overflow-y-auto p-3">
      {participants.map((p) => (
        <div
          key={p.contact_id}
          className="flex items-center gap-2.5 rounded-lg border border-edge bg-card px-2.5 py-2"
        >
          <Avatar name={p.display_name} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta font-medium text-ink">{p.display_name ?? "Unknown"}</p>
            <p className="truncate text-caption text-muted">{p.phone ?? "—"}</p>
          </div>
          {p.is_admin && <Chip tone="brand">admin</Chip>}
        </div>
      ))}
    </div>
  );
}

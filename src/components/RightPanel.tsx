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
      ? [{ key: "people" as Tab, label: "Members", count: participants.length }]
      : []),
  ];

  if (!open) {
    return (
      <aside className="z-30 flex h-full w-11 shrink-0 flex-col items-center gap-3 border-l border-edge/80 bg-white py-4">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-subtle hover:bg-chalk hover:text-ink-soft transition"
          title="Show lead details"
        >
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </button>
        <span
          className="mt-2 text-[10px] font-bold uppercase tracking-wider text-subtle"
          style={{ writingMode: "vertical-rl" }}
        >
          Lead Details
        </span>
      </aside>
    );
  }

  return (
    <aside className="z-30 flex h-full w-[280px] xl:w-[310px] shrink-0 flex-col border-l border-edge/80 bg-white shadow-2xs">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
        <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink">
          <Icon name="contacts" size={15} className="text-wa-dark" />
          <span>Lead Details</span>
        </h2>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-subtle hover:bg-chalk hover:text-ink-soft transition"
          title="Collapse panel"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b border-edge px-3 bg-surface/50">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-2.5 py-2.5 text-xs font-semibold transition-colors duration-150 ${
              tab === t.key
                ? "text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1 rounded-full bg-edge/70 px-1.5 py-0.2 text-[9px] font-bold text-muted">
                {t.count}
              </span>
            ) : null}
            {tab === t.key && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-t bg-wa-dark" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
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
      <div className="p-6 text-center text-xs text-subtle">
        No participants recorded yet. Captured automatically as members post messages.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-3">
      {participants.map((p) => (
        <div
          key={p.contact_id}
          className="flex items-center gap-2.5 rounded-xl border border-edge/70 bg-white p-2.5 shadow-2xs hover:border-edge-strong transition"
        >
          <Avatar name={p.display_name || p.phone} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-ink">{p.display_name ?? "Member"}</p>
            <p className="truncate text-[11px] text-subtle font-mono">{p.phone ?? "—"}</p>
          </div>
          {p.is_admin && (
            <span className="rounded-md bg-wa-soft px-1.5 py-0.5 text-[9px] font-bold text-wa-dark ring-1 ring-wa-dark/20">
              Admin
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

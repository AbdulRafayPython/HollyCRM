"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import Icon from "./ui/Icon";
import { useAssistantName } from "./WorkspaceContext";
import { useLiveRefresh } from "@/lib/realtime/useLiveRefresh";
import type { Chat } from "@/lib/types";

export interface ChatRow extends Chat {
  snippet: { body: string | null; sender_type: string; message_type: string } | null;
}

type Filter = "all" | "mine" | "groups" | "unassigned" | "archived";

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "groups", label: "Groups" },
  { key: "unassigned", label: "Unassigned" },
  { key: "archived", label: "Archived" },
];

export default function ChatList({
  chats,
  currentUserId,
}: {
  chats: ChatRow[];
  currentUserId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const params = useParams<{ chatId?: string }>();

  // Live from database events, with polling only as a fallback — this used to
  // be a bare 30s interval, which is why inbound messages arrived long after
  // the notification announcing them.
  useLiveRefresh();

  const counts = useMemo(() => {
    return {
      all: chats.filter((c) => !c.is_archived).length,
      mine: chats.filter((c) => !c.is_archived && c.assigned_agent_id === currentUserId).length,
      groups: chats.filter((c) => !c.is_archived && c.chat_type === "group").length,
      unassigned: chats.filter((c) => !c.is_archived && c.assigned_agent_id === null).length,
      archived: chats.filter((c) => c.is_archived).length,
    };
  }, [chats, currentUserId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (filter === "archived" ? !c.is_archived : c.is_archived) return false;
      if (filter === "mine" && c.assigned_agent_id !== currentUserId) return false;
      if (filter === "unassigned" && c.assigned_agent_id !== null) return false;
      if (filter === "groups" && c.chat_type !== "group") return false;
      if (q && !`${c.title ?? ""} ${c.chat_jid}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [chats, filter, query, currentUserId]);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header & Search */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold tracking-tight text-slate-900">Conversations</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {counts[filter]}
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, phone…"
            className="w-full rounded-xl border border-slate-200/80 bg-slate-50/70 py-2 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none transition"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills without ugly scrollbars */}
        <div
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          className="flex gap-1 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ${
                  active
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{t.label}</span>
                {counts[t.key] > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {counts[t.key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List Scroll Area */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100/60">
        {visible.length === 0 && (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Icon name="chat" size={18} />
            </div>
            <p className="mt-3 text-xs font-bold text-slate-700">No conversations</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Incoming WhatsApp inquiries will automatically appear here.
            </p>
          </div>
        )}

        {visible.map((c) => (
          <Row key={c.id} chat={c} active={params?.chatId === c.id} />
        ))}
      </div>
    </div>
  );
}

function Row({ chat, active }: { chat: ChatRow; active: boolean }) {
  const assistant = useAssistantName();
  const isGroup = chat.chat_type === "group";
  const name = chat.title ?? phoneOf(chat.chat_jid);
  const snippet = previewOf(chat.snippet, assistant);

  return (
    <Link
      href={`/inbox/${chat.id}`}
      className={`group relative flex gap-3 px-3.5 py-3 transition-colors duration-150 ${
        active
          ? "bg-slate-100/80 shadow-xs"
          : "hover:bg-slate-50/80"
      }`}
    >
      {/* Active Left Indicator Bar */}
      {active && (
        <span className="absolute left-0 inset-y-1.5 w-1 rounded-r-md bg-emerald-500" />
      )}

      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar name={chat.title || name} type={isGroup ? "group" : "direct"} size={40} />
        {isGroup && (
          <span
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] text-white ring-2 ring-white"
            title="WhatsApp Group"
          >
            👥
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1.5">
          <span
            className={`truncate text-xs font-bold ${
              active ? "text-slate-900" : "text-slate-800 group-hover:text-slate-900"
            }`}
          >
            {name}
          </span>
          <span className="shrink-0 text-[10px] font-medium text-slate-400">
            {shortTime(chat.last_message_at)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {snippet}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {isGroup ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
              Group {chat.participant_count ? `(${chat.participant_count})` : ""}
            </span>
          ) : (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-600/10">
              WhatsApp
            </span>
          )}

          {!chat.is_bot_paused ? (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
              ⚡ AI Live
            </span>
          ) : (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
              ⏸ AI Paused
            </span>
          )}

          {!chat.assigned_agent_id && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
              Unassigned
            </span>
          )}

          {chat.unread_count > 0 && (
            <span className="ml-auto inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-extrabold text-white shadow-xs">
              {chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function phoneOf(jid: string) {
  const n = jid.split("@")[0];
  return n.startsWith("+") ? n : `+${n}`;
}

const MEDIA_PREVIEW: Record<string, string> = {
  audio: "🎤 Voice note",
  image: "📷 Photo",
  video: "🎬 Video",
  document: "📄 Document",
  location: "📍 Location",
  contact: "👤 Contact",
  sticker: "🙂 Sticker",
};

function previewOf(s: ChatRow["snippet"], assistant: string) {
  if (!s) return "No messages yet";
  const prefix =
    s.sender_type === "bot" ? `${assistant}: ` : s.sender_type === "agent" ? "You: " : "";
  if (s.message_type !== "text") {
    const label = MEDIA_PREVIEW[s.message_type] ?? "📎 Attachment";
    return `${prefix}${label}${s.body?.trim() ? ` · ${s.body.trim()}` : ""}`;
  }
  return `${prefix}${s.body ?? ""}`.trim() || "—";
}

function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }),
  });
}

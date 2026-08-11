"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import Icon from "./ui/Icon";
import { useAssistantName } from "./WorkspaceContext";
import type { Chat } from "@/lib/types";

export interface ChatRow extends Chat {
  snippet: { body: string | null; sender_type: string; message_type: string } | null;
}

type Filter = "all" | "mine" | "unassigned" | "groups" | "archived";

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "groups", label: "Groups" },
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
  const router = useRouter();

  // The thread itself is pushed over Realtime Broadcast; the list only needs to
  // stay roughly current, so a periodic refresh is cheaper than a second channel.
  // router.refresh() re-runs EVERY server component on the route (layout queries
  // included), so it must be cheap: 30s, never while the tab is hidden, and one
  // catch-up refresh when the user comes back.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const id = setInterval(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

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
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-edge p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h2">Inbox</h2>
          <span className="text-caption text-muted">{visible.length} conversations</span>
        </div>

        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats, groups, phone…"
            className="field bg-surface py-2 pl-9 text-meta"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-2.5 py-1 text-caption transition duration-150 ease-swift ${
                filter === t.key
                  ? "bg-brand text-white shadow-card"
                  : "border border-edge bg-card text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-body text-muted">Nothing here yet.</p>
            <p className="mt-1 text-meta text-subtle">
              New WhatsApp messages appear the moment they arrive.
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
      className={`flex gap-3 border-b border-edge px-4 py-3 transition-colors duration-150 ease-swift ${
        active
          ? "border-l-2 border-l-brand bg-brand-soft pl-[14px]"
          : "border-l-2 border-l-transparent pl-[14px] hover:bg-surface"
      }`}
    >
      <Avatar name={chat.title} type={isGroup ? "group" : "direct"} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-body font-medium text-ink">{name}</span>
          <span className="shrink-0 text-caption text-subtle">{shortTime(chat.last_message_at)}</span>
        </div>

        <p className="mt-0.5 truncate text-meta text-muted">{snippet}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {isGroup ? (
            <Chip tone="group">GROUP{chat.participant_count ? ` · ${chat.participant_count}` : ""}</Chip>
          ) : (
            <Chip tone="wa">WhatsApp</Chip>
          )}
          {chat.is_bot_paused && <Chip tone="bot">AI paused</Chip>}
          {!chat.assigned_agent_id && <Chip tone="neutral">Unassigned</Chip>}
          {chat.unread_count > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-wa px-1.5 text-caption font-semibold text-white">
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

/** "📎 audio" told an agent nothing; a voice note and a passport scan are not
 *  the same kind of thing to walk back to. */
const MEDIA_PREVIEW: Record<string, string> = {
  audio: "🎤 Voice message",
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
    // A caption is what the customer actually wrote — show it after the marker.
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

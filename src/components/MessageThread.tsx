"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./ui/Icon";
import AudioMessage from "./media/AudioMessage";
import FileMessage from "./media/FileMessage";
import ImageMessage from "./media/ImageMessage";
import VoiceRecorder from "./media/VoiceRecorder";
import { useAssistantName } from "./WorkspaceContext";
import { displayName, MEDIA_URL_TTL_S } from "@/lib/media";
import { renderMentions } from "@/lib/people";
import type { Message } from "@/lib/types";

export default function MessageThread({
  chatId,
  leadId = null,
  initialMessages,
  senderNames: initialSenderNames = {},
  namesByPhone = {},
  ownPhone = null,
}: {
  chatId: string;
  leadId?: string | null;
  initialMessages: Message[];
  senderNames?: Record<string, string>;
  namesByPhone?: Record<string, string>;
  ownPhone?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [senderNames, setSenderNames] = useState(initialSenderNames);
  useEffect(() => {
    setSenderNames((prev) => ({ ...initialSenderNames, ...prev }));
  }, [initialSenderNames]);

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Preserve optimistic bubbles
  useEffect(() => {
    setMessages((prev) => {
      const pending = prev.filter((m) => String(m.id).startsWith("temp-"));
      if (pending.length === 0) return initialMessages;
      const landed = new Set(
        initialMessages.filter((m) => m.direction === "out").map((m) => m.body)
      );
      return [...initialMessages, ...pending.filter((m) => !landed.has(m.body))];
    });
  }, [initialMessages]);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Opening the conversation clears unread badge
  useEffect(() => {
    fetch(`/api/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
  }, [chatId]);

  const asked = useRef<Set<string>>(new Set());

  const signMedia = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      ids.forEach((id) => asked.current.add(id));

      const res = await fetch(`/api/chats/${chatId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: ids }),
      }).catch(() => null);
      if (!res?.ok) return;

      const json = (await res.json().catch(() => ({}))) as {
        urls?: Record<string, string>;
      };
      const urls = json.urls ?? {};
      if (Object.keys(urls).length === 0) return;

      setMessages((prev) =>
        prev.map((m) => (urls[String(m.id)] ? { ...m, media_url: urls[String(m.id)] } : m))
      );
    },
    [chatId]
  );

  // Sign any media that arrived unsigned
  useEffect(() => {
    const unsigned = messages
      .filter((m) => m.media_path && !m.media_url && !asked.current.has(String(m.id)))
      .map((m) => String(m.id));
    if (unsigned.length > 0) void signMedia(unsigned);
  }, [messages, signMedia]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;

    setText("");
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      chat_id: chatId,
      lead_id: leadId,
      wa_message_id: null,
      direction: "out",
      sender_type: "agent",
      sender_contact_id: null,
      message_type: "text",
      body,
      media_path: null,
      media_mime: null,
      media_name: null,
      reply_to_wa_message_id: null,
      wa_timestamp: new Date().toISOString(),
      delivery_status: "pending",
    };

    setMessages((prev) => [...prev, optimistic]);

    const res = await fetch(`/api/chats/${chatId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, leadId }),
    }).catch(() => null);

    if (!res?.ok) {
      setError("Could not deliver message to WhatsApp.");
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, delivery_status: "failed" } : m))
      );
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, delivery_status: "sent" } : m))
    );
  }

  async function sendVoice(blob: Blob, mime: string, seconds: number) {
    setError(null);

    const form = new FormData();
    form.append("audio", new File([blob], "voice-message", { type: mime }));
    form.append("seconds", String(seconds));
    if (leadId) form.append("leadId", leadId);

    const res = await fetch(`/api/chats/${chatId}/voice`, { method: "POST", body: form }).catch(
      () => null
    );
    const json = (await res?.json().catch(() => ({}))) as { error?: string; message?: Message };

    if (!res?.ok) {
      setError(json?.error ?? "Could not send the voice message.");
      return;
    }
    const row = json.message;
    if (!row) return;

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = [...prev];
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }

  let lastDay = "";

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-surface">
      {/* Scrollable Conversation Stream */}
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="pt-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-subtle shadow-xs border border-edge">
              <Icon name="chat" size={22} />
            </div>
            <p className="mt-3 text-xs font-bold text-ink-soft">No messages in this chat yet</p>
            <p className="mt-0.5 text-[11px] text-subtle">
              Send a greeting or waiting for customer inbound reply.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.wa_timestamp);
          const divider = day !== lastDay ? day : null;
          lastDay = day;
          return (
            <div key={m.id} className="space-y-4">
              {divider && (
                <div className="flex justify-center">
                  <span className="rounded-full border border-edge/70 bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted shadow-2xs">
                    {divider}
                  </span>
                </div>
              )}
              <Bubble
                m={m}
                senderName={m.sender_contact_id ? senderNames[m.sender_contact_id] : null}
                namesByPhone={namesByPhone}
                ownPhone={ownPhone}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer Section */}
      <form onSubmit={send} className="shrink-0 border-t border-edge/80 bg-white p-3.5">
        {error && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-danger font-medium">
            <Icon name="alert" size={14} />
            {error}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-edge bg-surface/70 p-2 transition focus-within:border-wa focus-within:bg-white focus-within:ring-2 focus-within:ring-wa/10 shadow-xs">
          {!recording && (
            <button
              type="button"
              className="rounded-xl p-2 text-subtle hover:bg-chalk hover:text-ink-soft transition"
              title="Attach documents or photos via the Files tab"
            >
              <Icon name="paperclip" size={17} />
            </button>
          )}

          <VoiceRecorder onSend={sendVoice} onActiveChange={setRecording} />

          {!recording && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
                rows={1}
                placeholder="Type a message to WhatsApp…"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-xs text-ink outline-none placeholder:text-subtle leading-relaxed"
              />
              <button
                disabled={!text.trim()}
                className="rounded-xl bg-wa-dark px-3.5 py-2 text-white shadow-xs hover:bg-wa-dark disabled:opacity-40 transition shrink-0"
                title="Send message"
              >
                <Icon name="send" size={15} />
              </button>
            </>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-subtle font-medium">
          {recording
            ? "Recording audio · delete with trash or send with arrow"
            : "Enter sends message · Shift+Enter for new line · Live Green API sync"}
        </p>
      </form>
    </div>
  );
}

function Bubble({
  m,
  senderName,
  namesByPhone = {},
  ownPhone = null,
}: {
  m: Message;
  senderName?: string | null;
  namesByPhone?: Record<string, string>;
  ownPhone?: string | null;
}) {
  const assistant = useAssistantName();
  if (m.sender_type === "system") {
    return (
      <div className="flex animate-rise-in justify-center">
        <span className="rounded-full border border-edge bg-white/90 px-3 py-1 text-[10px] font-semibold text-muted shadow-2xs">
          {m.body}
        </span>
      </div>
    );
  }

  const mine = m.direction === "out";
  const isBot = m.sender_type === "bot";
  const rtl = isArabic(m.body);

  const who = isBot ? assistant : mine ? "You" : senderName || "Customer";
  const body = m.body ? renderMentions(m.body, namesByPhone, assistant, ownPhone) : m.body;

  // Visual bubble styles: Outgoing is WhatsApp light emerald green, Inbound is crisp white, Bot is warm amber
  const bubbleStyle = isBot
    ? "bg-gradient-to-br from-bot-soft/90 to-white border-bot-soft/90 text-ink rounded-2xl rounded-tr-xs"
    : mine
    ? "bg-[#D9FDD3] border-[#BFF1B3] text-ink rounded-2xl rounded-tr-xs"
    : "bg-white border-edge/90 text-ink rounded-2xl rounded-tl-xs";

  const hasMedia = Boolean(m.media_path);
  const isImage = m.message_type === "image";

  return (
    <div className={`flex animate-rise-in flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      {/* Sender & Timestamp Info */}
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-subtle">
        {isBot && (
          <span className="flex items-center gap-1 font-semibold text-bot-dark">
            <Icon name="bot" size={13} />
            <span>AI Concierge</span>
          </span>
        )}
        {!isBot && (
          <span className={senderName && !mine ? "font-bold text-wa-dark" : "font-medium text-muted"}>
            {who}
          </span>
        )}
        <span>·</span>
        <span>{clock(m.wa_timestamp)}</span>
      </div>

      {/* Bubble Container */}
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={`max-w-[80%] border text-xs shadow-2xs leading-relaxed transition-all ${bubbleStyle} ${
          isImage && hasMedia ? "p-1.5" : "px-3.5 py-2.5"
        }`}
      >
        {hasMedia && <Attachment m={m} onBrand={false} />}

        {body && (
          <p
            className={`whitespace-pre-wrap ${
              hasMedia ? (isImage ? "px-2.5 pb-1.5 pt-2" : "mt-2") : ""
            }`}
          >
            {body}
          </p>
        )}

        {!hasMedia && !m.body && m.message_type !== "text" && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <Icon name="alert" size={13} />
            {m.message_type === "location" ? "Location shared" : `Unsupported ${m.message_type} message`}
          </p>
        )}
      </div>

      {/* Delivery Receipt */}
      {mine && <Receipt status={m.delivery_status} />}
    </div>
  );
}

function Attachment({ m, onBrand }: { m: Message; onBrand: boolean }) {
  const url = m.media_url ?? (m.media_path?.startsWith("http") ? m.media_path : null);
  const name = displayName(m.media_name, m.media_path, m.media_mime, m.message_type);

  if (!url) {
    return (
      <span className="flex items-center gap-2 text-xs text-subtle">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-edge-strong" />
        Loading attachment…
      </span>
    );
  }

  if (m.message_type === "audio") {
    return <AudioMessage messageId={String(m.id)} url={url} onBrand={false} />;
  }
  if (m.message_type === "image") {
    return <ImageMessage url={url} name={name} onBrand={false} />;
  }
  return <FileMessage url={url} name={name} mime={m.media_mime} onBrand={false} />;
}

function Receipt({ status }: { status: string }) {
  if (!status) return null;
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 px-1 text-[10px] font-semibold text-danger">
        <Icon name="alert" size={11} /> failed to deliver
      </span>
    );
  }
  const read = status === "read";
  return (
    <span className={`flex items-center gap-1 px-1 text-[10px] font-medium ${read ? "text-wa-dark font-bold" : "text-subtle"}`}>
      <Icon name={status === "pending" || status === "sent" ? "check" : "checkDouble"} size={12} />
      {status === "read" ? "Read" : status}
    </span>
  );
}

function isArabic(text: string | null) {
  return Boolean(text && /[؀-ۿ]/.test(text));
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "short",
  });
}

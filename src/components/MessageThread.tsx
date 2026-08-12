"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Icon from "./ui/Icon";
import AudioMessage from "./media/AudioMessage";
import FileMessage from "./media/FileMessage";
import ImageMessage from "./media/ImageMessage";
import VoiceRecorder from "./media/VoiceRecorder";
import { useAssistantName } from "./WorkspaceContext";
import { displayName, MEDIA_URL_TTL_S } from "@/lib/media";
import { contactLabel, renderMentions } from "@/lib/people";
import type { Message } from "@/lib/types";

/** Re-sign a little before the URLs actually die, so playback never breaks mid-thread. */
const RESIGN_EVERY_MS = (MEDIA_URL_TTL_S - 300) * 1000;

/**
 * Live message thread.
 *
 * Uses Realtime **Broadcast** on a private per-chat channel rather than
 * postgres_changes — no WAL parsing, and subscription is authorized by the RLS
 * policy on realtime.messages (see 0001 §10). The broadcast itself is emitted by
 * the AFTER INSERT trigger on public.messages.
 */
export default function MessageThread({
  chatId,
  leadId = null,
  initialMessages,
  senderNames: initialSenderNames = {},
  namesByPhone = {},
  ownPhone = null,
}: {
  chatId: string;
  /** Stamped onto voice notes so they hang off the same lead as the rest. */
  leadId?: string | null;
  initialMessages: Message[];
  /** contact id -> the name to print above their bubbles. */
  senderNames?: Record<string, string>;
  /** digits-only phone -> name, for rewriting @mentions in the body. */
  namesByPhone?: Record<string, string>;
  /** Our own WhatsApp number, so a mention of us isn't shown as raw digits. */
  ownPhone?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Starts from the server's map and grows as live messages arrive from senders
  // that map has never seen — someone who joins the group and speaks while the
  // page is open would otherwise stay "Client" until a reload.
  const [senderNames, setSenderNames] = useState(initialSenderNames);
  useEffect(() => { setSenderNames((prev) => ({ ...initialSenderNames, ...prev })); },
    [initialSenderNames]);
  /** Sender ids already being looked up, so a burst of messages from one new
   *  participant issues one query instead of one per message. */
  const resolvingNames = useRef(new Set<string>());
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Server refreshes replace the list but must not wipe optimistic bubbles
  // whose DB row hasn't landed yet.
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

  // Opening the conversation clears its unread badge.
  useEffect(() => {
    fetch(`/api/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
  }, [chatId]);

  /* ---------------------------------------------------------------------- *
   * Attachment URLs
   *
   * `wa-media` is private, so a message row carries a storage path and nothing
   * playable. The server signs the initial page; anything that arrives over
   * Realtime afterwards has to be signed here. `asked` keeps a message from
   * being re-requested every render when it cannot be signed — an un-mirrored
   * row, or one whose object is missing — which would otherwise spin.
   * ---------------------------------------------------------------------- */
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

      const { urls } = (await res.json().catch(() => ({ urls: {} }))) as {
        urls: Record<string, string>;
      };
      if (Object.keys(urls).length === 0) return;

      setMessages((prev) =>
        prev.map((m) => (urls[m.id] ? { ...m, media_url: urls[m.id] } : m))
      );
    },
    [chatId]
  );

  useEffect(() => {
    const pending = messages
      .filter(
        (m) =>
          m.media_path &&
          !m.media_url &&
          !m.media_path.startsWith("http") &&
          !String(m.id).startsWith("temp-") &&
          !asked.current.has(m.id)
      )
      .map((m) => m.id);
    void signMedia(pending);
  }, [messages, signMedia]);

  // Signed links expire. An agent who leaves a conversation open all afternoon
  // should still be able to replay the voice note from the morning.
  useEffect(() => {
    const id = setInterval(() => {
      asked.current.clear();
      setMessages((prev) => prev.map((m) => (m.media_path ? { ...m, media_url: null } : m)));
    }, RESIGN_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;

    (async () => {
      // Required before joining a private channel — passes the user's JWT so
      // the realtime.messages policy can authorize the topic.
      await sb.realtime.setAuth();

      channel = sb
        .channel(`chat:${chatId}`, { config: { private: true } })
        .on("broadcast", { event: "new_message" }, (payload) => {
          const row = (payload.payload?.record ?? payload.payload) as Partial<Message>;
          if (!row?.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // The trigger payload omits direction/delivery_status — derive them,
            // otherwise agent/bot rows pushed live render as client bubbles.
            const full = {
              direction: row.sender_type === "client" ? "in" : "out",
              delivery_status: "sent",
              ...row,
            } as Message;
            // If this is the DB row for an optimistic bubble, adopt its real id
            // instead of appending a duplicate.
            const tempIdx =
              full.sender_type === "agent"
                ? prev.findIndex(
                    (m) => String(m.id).startsWith("temp-") && m.body === full.body
                  )
                : -1;
            if (tempIdx !== -1) {
              const next = [...prev];
              next[tempIdx] = { ...next[tempIdx], id: full.id };
              return next;
            }
            return [...prev, full];
          });

          // A sender the server render never saw — someone who joined the group
          // and spoke while this page was open. Resolve the name once, in the
          // background: the bubble paints immediately rather than waiting on a
          // round trip to say anything at all.
          //
          // The guard is a ref, not the state map. A state updater must be pure,
          // and firing the fetch from inside one runs it twice under StrictMode.
          const senderId = row.sender_contact_id;
          if (senderId && !resolvingNames.current.has(senderId)) {
            resolvingNames.current.add(senderId);
            void (async () => {
              const { data } = await sb
                .from("contacts")
                .select("display_name, phone_e164")
                .eq("id", senderId)
                .maybeSingle();
              if (data) {
                setSenderNames((p) => ({
                  ...p,
                  [senderId]: contactLabel(data.display_name, data.phone_e164),
                }));
              }
            })();
          }
        })
        .subscribe();
    })();

    return () => {
      if (channel) sb.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: { preventDefault: () => void }) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);

    // Optimistic: paint the bubble and clear the composer immediately. The
    // Green API round trip (~600ms) happens behind a "pending" receipt.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: tempId,
      chat_id: chatId,
      lead_id: null,
      wa_message_id: null,
      direction: "out",
      sender_type: "agent",
      message_type: "text",
      body,
      media_path: null,
      reply_to_wa_message_id: null,
      wa_timestamp: new Date().toISOString(),
      delivery_status: "pending",
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    const res = await fetch(`/api/chats/${chatId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    }).catch(() => null);

    if (!res?.ok) {
      setError(
        res ? ((await res.json().catch(() => ({}))).error ?? "Send failed") : "Send failed"
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, delivery_status: "failed" } : m))
      );
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, delivery_status: "sent" } : m))
    );
  }

  /**
   * Voice note. No optimistic bubble: unlike text, the recording only exists
   * once the upload succeeds, and a bubble that might have to be withdrawn is
   * worse than a second of "Sending…" on a control the agent is already
   * watching. The row comes back from the route already signed for playback.
   */
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
      // The insert trigger may have broadcast this row already — that copy has
      // no signed URL, so adopt ours rather than skipping it.
      const idx = prev.findIndex((m) => m.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = [...prev];
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }

  let lastDay = "";

  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface px-6 py-5">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-body text-muted">No messages in this conversation.</p>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.wa_timestamp);
          const divider = day !== lastDay ? day : null;
          lastDay = day;
          return (
            <div key={m.id} className="space-y-4">
              {divider && (
                <div className="flex justify-center">
                  <span className="rounded-full border border-edge bg-card px-3 py-1 text-caption text-muted">
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

      <form onSubmit={send} className="shrink-0 border-t border-edge bg-card p-4">
        {error && (
          <p className="mb-2 flex items-center gap-1.5 text-meta text-danger">
            <Icon name="alert" size={14} />
            {error}
          </p>
        )}
        <div className="flex items-end gap-1 rounded-xl border border-edge bg-surface p-2 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          {/* One instance, never swapped out — remounting the recorder mid-take
              would drop the MediaRecorder and the audio with it. It widens into
              the row itself while recording. */}
          {!recording && (
            <button
              type="button"
              className="btn-ghost p-2"
              title="Attach — use the Files tab to send a document"
            >
              <Icon name="paperclip" size={18} />
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
                placeholder="Type a message…"
                className="max-h-32 flex-1 resize-none bg-transparent px-1 py-2 text-body text-ink outline-none placeholder:text-subtle"
              />
              <button
                disabled={!text.trim()}
                className="btn-primary px-3 py-2"
                title="Send to WhatsApp"
              >
                <Icon name="send" size={16} />
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-caption text-subtle">
          {recording
            ? "Recording · discard with the bin, send with the arrow"
            : "Enter sends · Shift+Enter adds a line · replies go to WhatsApp immediately"}
        </p>
      </form>
    </>
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
        <span className="rounded-full border border-edge bg-card px-3 py-1 text-caption text-muted">
          {m.body}
        </span>
      </div>
    );
  }

  const mine = m.direction === "out";
  const isBot = m.sender_type === "bot";
  const rtl = isArabic(m.body);

  // "Client" was a placeholder that shipped. In a group it made five people
  // indistinguishable; in a direct chat it told an agent nothing they didn't
  // already know from the header. It survives only as the last-resort fallback
  // for an inbound message whose sender we genuinely could not resolve.
  const who = isBot ? assistant : mine ? "You" : senderName || "Client";
  // The assistant name is passed unconditionally: it is the CLIENT's message
  // that mentions our number ("@923112929526 Hey"), so gating it on the message
  // being ours would leave the one case that actually occurs unrewritten.
  const body = m.body ? renderMentions(m.body, namesByPhone, assistant, ownPhone) : m.body;

  const tone = isBot
    ? "bg-bot-soft border-bot/40 text-bot-dark rounded-tr-sm"
    : mine
      ? "bg-brand border-brand text-white rounded-tr-sm"
      : "bg-card border-edge text-ink rounded-tl-sm";

  // Only the agent's own bubble is a saturated violet; the bot's is a pale
  // amber, so media inside it keeps the normal light palette.
  const onBrand = mine && !isBot;
  const hasMedia = Boolean(m.media_path);
  const isImage = m.message_type === "image";

  return (
    <div className={`flex animate-rise-in flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 px-1 text-caption text-muted">
        {isBot && <Icon name="bot" size={12} className="text-bot" />}
        <span className={senderName && !mine && !isBot ? "font-medium text-ink" : ""}>{who}</span>
        <span aria-hidden>·</span>
        <span>{clock(m.wa_timestamp)}</span>
      </div>

      <div
        dir={rtl ? "rtl" : "ltr"}
        className={`max-w-[75%] rounded-xl border text-body shadow-card ${tone} ${
          // A photo fills its bubble edge to edge; everything else keeps the
          // text padding so a file card doesn't sit flush against the border.
          isImage && hasMedia ? "p-1" : "px-4 py-3"
        }`}
      >
        {hasMedia && <Attachment m={m} onBrand={onBrand} />}

        {body && (
          <p
            className={`whitespace-pre-wrap leading-relaxed ${
              hasMedia ? (isImage ? "px-3 pb-2 pt-2" : "mt-2") : ""
            }`}
          >
            {body}
          </p>
        )}

        {!hasMedia && !m.body && m.message_type !== "text" && (
          <p className={`flex items-center gap-1.5 text-caption ${onBrand ? "text-white/80" : "text-muted"}`}>
            <Icon name="alert" size={12} />
            {m.message_type === "location" ? "Location shared" : `Unsupported ${m.message_type} message`}
          </p>
        )}
      </div>

      {mine && <Receipt status={m.delivery_status} />}
    </div>
  );
}

/**
 * Picks the renderer for one attachment.
 *
 * `media_path` holds Green API's temporary download URL for the few seconds
 * between the webhook landing and mirrorInboundMedia copying the object into
 * our bucket. Using it directly during that window is what keeps a voice note
 * playable the instant it arrives instead of after the next refresh.
 */
function Attachment({ m, onBrand }: { m: Message; onBrand: boolean }) {
  const url = m.media_url ?? (m.media_path?.startsWith("http") ? m.media_path : null);
  const name = displayName(m.media_name, m.media_path, m.media_mime, m.message_type);

  if (!url) {
    return (
      <span
        className={`flex items-center gap-2 text-caption ${onBrand ? "text-white/70" : "text-muted"}`}
      >
        <span
          className={`h-3 w-3 animate-pulse rounded-full ${onBrand ? "bg-white/40" : "bg-edge-strong"}`}
        />
        Loading attachment…
      </span>
    );
  }

  if (m.message_type === "audio") {
    return <AudioMessage messageId={String(m.id)} url={url} onBrand={onBrand} />;
  }
  if (m.message_type === "image") {
    return <ImageMessage url={url} name={name} onBrand={onBrand} />;
  }
  return <FileMessage url={url} name={name} mime={m.media_mime} onBrand={onBrand} />;
}

function Receipt({ status }: { status: string }) {
  if (!status) return null;
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 px-1 text-caption text-danger">
        <Icon name="alert" size={12} /> failed
      </span>
    );
  }
  const read = status === "read";
  return (
    <span className={`flex items-center gap-1 px-1 text-caption ${read ? "text-wa" : "text-subtle"}`}>
      <Icon name={status === "pending" || status === "sent" ? "check" : "checkDouble"} size={12} />
      {status}
    </span>
  );
}

/** Client messages arrive in Arabic far more often than not — render them RTL. */
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
    month: "long",
    year: "numeric",
  });
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { useNotifications, type FeedItem } from "./NotificationContext";

/**
 * The bell.
 *
 * Placed in the sidebar footer beside the profile card rather than in a top
 * bar, because on desktop this app has no top bar — the rail is the only chrome
 * present on every workstation route, so it is the only place a bell cannot
 * disappear from. Sitting next to presence and the account menu also groups it
 * with the other things that are about *you*, which is exactly what an
 * assignment is. The mobile top bar already occupies the conventional
 * top-right, so the bell appears there too on small screens.
 *
 * Assignment rows are the reason this exists: sound can be muted and a toast
 * lasts six seconds, but "this conversation is yours now" has to survive being
 * missed. The bell is the durable-enough surface for that.
 */
export default function NotificationBell({
  collapsed = false,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  variant?: "sidebar" | "bar";
}) {
  const { feed, unreadCount, markAllRead, markRead, clearFeed } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape. Both, because a popover that only closes one way
  // strands people who reach for the other.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) markAllRead();
        }}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={
          variant === "bar"
            ? "relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100"
            : // w-full in both states: the rail's other bottom rows are flex
              // children that stretch, so a content-width button here sat left
              // of the icon column instead of centring with them when collapsed.
              `group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors
               ${open ? "bg-purple-50 text-purple-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}
               ${collapsed ? "justify-center px-0" : ""}`
        }
      >
        {/* The badge anchors to the glyph, not the button. On a full-width
            collapsed button, anchoring to the button parked it against the far
            edge of the rail instead of on the bell. */}
        <span
          className={`relative ${variant === "bar" ? "" : "text-slate-400 group-hover:text-slate-600"}`}
        >
          <Icon name="bell" size={16} />

          {unreadCount > 0 && (variant === "bar" || collapsed) && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {badge}
            </span>
          )}
        </span>

        {variant === "sidebar" && !collapsed && (
          <>
            <span className="flex-1 truncate text-left">Notifications</span>
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                {badge}
              </span>
            )}
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`absolute z-50 w-80 animate-rise-in overflow-hidden rounded-xl border border-edge bg-card shadow-pop ${
            variant === "bar" ? "right-0 top-full mt-2" : "bottom-0 left-full ml-2"
          }`}
        >
          <header className="flex items-center gap-2 border-b border-edge px-3 py-2">
            <h2 className="text-meta font-semibold text-ink">Notifications</h2>
            {feed.length > 0 && (
              <button
                type="button"
                onClick={clearFeed}
                className="ml-auto rounded px-1.5 py-0.5 text-caption font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                Clear
              </button>
            )}
          </header>

          <div className="scroll-thin max-h-96 overflow-y-auto">
            {feed.length === 0 ? (
              <p className="px-3 py-8 text-center text-caption leading-relaxed text-subtle">
                Nothing yet. New messages and conversations assigned to you show up here.
              </p>
            ) : (
              <ul>
                {feed.map((item) => (
                  <li key={item.id}>
                    <Row item={item} onOpen={() => { markRead(item.id); setOpen(false); }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ item, onOpen }: { item: FeedItem; onOpen: () => void }) {
  const isAssignment = item.kind === "assignment";

  return (
    <Link
      href={`/inbox/${item.chatId}`}
      onClick={onOpen}
      className="flex gap-2.5 border-b border-edge/60 px-3 py-2.5 transition-colors last:border-0 hover:bg-surface"
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
          isAssignment ? "bg-brand-soft text-brand" : "bg-wa-soft text-wa-dark"
        }`}
      >
        <Icon name={isAssignment ? "user" : "whatsapp"} size={13} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-caption font-semibold text-ink">
            {item.title}
          </span>
          <span className="shrink-0 text-caption tabular-nums text-subtle">{ago(item.at)}</span>
          {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-caption leading-snug text-muted">
          {item.body}
        </span>
      </span>
    </Link>
  );
}

function ago(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

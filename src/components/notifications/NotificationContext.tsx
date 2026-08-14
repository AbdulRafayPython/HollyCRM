"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { playWhatsAppChime } from "@/lib/notifications/sound";

export interface NotificationSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 100
  inAppToastEnabled: boolean;
  browserPushEnabled: boolean;
  notifyScope: "all" | "direct" | "mine";
  toastDuration: number; // in milliseconds (e.g. 6000)
  /** Alert me when a conversation is handed to me. Separate from message
   *  alerts on purpose: an agent who mutes chatter still has to hear that a
   *  chat is now theirs and waiting. */
  assignmentAlertsEnabled: boolean;
}

export interface InAppToast {
  id: string;
  chatId: string;
  title: string;
  body: string;
  chatType?: "direct" | "group";
  time?: string;
  kind?: FeedKind;
}

export type FeedKind = "message" | "assignment";

/** One row in the bell's panel. */
export interface FeedItem {
  id: string;
  kind: FeedKind;
  chatId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
}

interface NotificationContextValue extends NotificationSettings {
  browserPermission: NotificationPermission | "unsupported";
  activeToasts: InAppToast[];
  feed: FeedItem[];
  unreadCount: number;
  playTestChime: () => void;
  sendTestNotification: () => void;
  sendTestAssignment: () => void;
  requestBrowserPermission: () => Promise<NotificationPermission | "unsupported">;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearFeed: () => void;
}

const STORAGE_KEY = "holycrm_notification_prefs_v1";

/** The bell holds a session's worth of activity, not a mailbox. Chats are the
 *  durable record; this list only has to answer "what happened while I was
 *  looking elsewhere", so it lives in memory and never goes stale on disk. */
const FEED_LIMIT = 40;

/** Dedupe window. The checkpoint moves forward every poll, so ids only need to
 *  survive long enough to absorb an overlapping retry. */
const SEEN_LIMIT = 400;

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundVolume: 80,
  inAppToastEnabled: true,
  browserPushEnabled: true,
  notifyScope: "all",
  toastDuration: 6000,
  assignmentAlertsEnabled: true,
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");
  const [activeToasts, setActiveToasts] = useState<InAppToast[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const lastCheckTimeRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  /*
   * The poll loop reads settings and pathname through refs.
   *
   * They used to be effect dependencies, so every preference change and every
   * navigation tore the loop down and rebuilt it — restarting the timer, and
   * re-running the "no checkpoint yet" branch more often than it should. The
   * loop is now created once and reads current values when it fires.
   */
  const settingsRef = useRef(settings);
  const pathnameRef = useRef(pathname);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {
      // Ignore JSON parse errors
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    } else {
      setBrowserPermission("unsupported");
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore quota errors
      }
      return updated;
    });
  }, []);

  const playTestChime = useCallback(() => {
    playWhatsAppChime(settings.soundVolume / 100);
  }, [settings.soundVolume]);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    try {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
      return result;
    } catch {
      return "denied";
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setFeed((prev) => (prev.some((f) => !f.read) ? prev.map((f) => ({ ...f, read: true })) : prev));
  }, []);

  const markRead = useCallback((id: string) => {
    setFeed((prev) => prev.map((f) => (f.id === id ? { ...f, read: true } : f)));
  }, []);

  const clearFeed = useCallback(() => setFeed([]), []);

  /** Sound, desktop push, toast, and the bell — reads settings from the ref so
   *  it stays stable and never churns the poll loop. */
  const triggerNotification = useCallback(
    (toast: InAppToast) => {
      const s = settingsRef.current;
      const kind: FeedKind = toast.kind ?? "message";

      // The bell records everything, regardless of how loud the rest is. It is
      // the quiet fallback for someone who muted sound and toasts.
      setFeed((prev) =>
        [
          {
            id: toast.id,
            kind,
            chatId: toast.chatId,
            title: toast.title,
            body: toast.body,
            at: new Date().toISOString(),
            read: false,
          },
          ...prev.filter((f) => f.id !== toast.id),
        ].slice(0, FEED_LIMIT)
      );

      if (s.soundEnabled) playWhatsAppChime(s.soundVolume / 100);

      if (
        s.browserPushEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification(toast.title, {
            body: toast.body,
            icon: "/favicon.ico",
            tag: `chat-${toast.chatId}`,
          });
          n.onclick = () => {
            window.focus();
            router.push(`/inbox/${toast.chatId}`);
            n.close();
          };
        } catch {
          // Native notification error fallback
        }
      }

      if (s.inAppToastEnabled) {
        setActiveToasts((prev) => [toast, ...prev.filter((t) => t.id !== toast.id)].slice(0, 4));
        if (s.toastDuration > 0) {
          setTimeout(() => dismissToast(toast.id), s.toastDuration);
        }
      }
    },
    [router, dismissToast]
  );

  const sendTestNotification = useCallback(() => {
    triggerNotification({
      id: `test-${Date.now()}`,
      chatId: "test-chat",
      title: "+966 54 123 4567 (Ahmed Al-Mansoor)",
      body: "Assalamu Alaikum! Could you please share the current quad room rates for Makkah Clock Tower?",
      chatType: "direct",
      time: "Just now",
      kind: "message",
    });
  }, [triggerNotification]);

  const sendTestAssignment = useCallback(() => {
    triggerNotification({
      id: `test-assign-${Date.now()}`,
      chatId: "test-chat",
      title: "Assigned to you",
      body: "Al-Mansoor Family — 8 Pax is now yours. The bot has paused on this chat.",
      chatType: "group",
      time: "Just now",
      kind: "assignment",
    });
  }, [triggerNotification]);

  /*
   * Polling loop. Created once; everything variable is read through a ref.
   */
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!active) return;
      try {
        const checkpoint = lastCheckTimeRef.current;
        const url = checkpoint
          ? `/api/notifications/poll?since=${encodeURIComponent(checkpoint)}`
          : `/api/notifications/poll`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || !active) return;

        const data = await res.json();
        if (!active) return;

        // First run only establishes the checkpoint — otherwise a newly opened
        // tab would announce every message already in the backlog.
        if (!checkpoint) {
          if (data.serverTime) lastCheckTimeRef.current = data.serverTime;
          return;
        }

        const s = settingsRef.current;
        const here = pathnameRef.current;

        // Assignments first: being handed a conversation outranks chatter in it.
        for (const a of (data.assignments ?? []) as {
          id: string; chatId: string; title: string; chatType?: string;
        }[]) {
          if (seenIdsRef.current.has(a.id)) continue;
          seenIdsRef.current.add(a.id);
          if (!s.assignmentAlertsEnabled) continue;

          triggerNotification({
            id: a.id,
            chatId: a.chatId,
            title: "Assigned to you",
            body: `${a.title} is now yours. The bot has paused on this chat.`,
            chatType: a.chatType === "group" ? "group" : "direct",
            time: "Just now",
            kind: "assignment",
          });
        }

        for (const msg of (data.messages ?? []) as {
          id: string; chatId: string; title: string; body: string;
          chatType?: string; assignedToMe?: boolean; isUnassigned?: boolean;
        }[]) {
          if (seenIdsRef.current.has(msg.id)) continue;
          seenIdsRef.current.add(msg.id);

          // Already reading this thread with the tab in front of you.
          if (here.startsWith(`/inbox/${msg.chatId}`) && !document.hidden) continue;

          if (s.notifyScope === "direct" && msg.chatType === "group") continue;
          if (s.notifyScope === "mine" && !msg.assignedToMe && !msg.isUnassigned) continue;

          triggerNotification({
            id: msg.id,
            chatId: msg.chatId,
            title: msg.title,
            body: msg.body,
            chatType: msg.chatType === "group" ? "group" : "direct",
            time: "Just now",
            kind: "message",
          });
        }

        // Only now. Advancing before the loop meant a throw anywhere inside it
        // skipped the rest of the batch permanently — the checkpoint had
        // already moved past rows that were never shown.
        if (data.serverTime) lastCheckTimeRef.current = data.serverTime;

        if (seenIdsRef.current.size > SEEN_LIMIT) seenIdsRef.current = new Set();
      } catch {
        // Leave the checkpoint where it is; the next tick retries the window.
      }
    };

    /*
     * Self-scheduling rather than setInterval: the delay is re-read every
     * cycle, so backgrounding the tab actually slows the loop down. The old
     * `setInterval(poll, document.hidden ? 12000 : 3500)` evaluated
     * document.hidden once, at mount, and then never again.
     */
    const cycle = async () => {
      await poll();
      if (!active) return;
      timer = setTimeout(cycle, document.hidden ? 12000 : 3500);
    };

    // Coming back to the tab should feel instant, not up to 12s stale.
    const onVisible = () => {
      if (document.hidden || !active) return;
      if (timer) clearTimeout(timer);
      void cycle();
    };

    void cycle();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [triggerNotification]);

  const unreadCount = useMemo(() => feed.filter((f) => !f.read).length, [feed]);

  return (
    <NotificationContext.Provider
      value={{
        ...settings,
        browserPermission,
        activeToasts,
        feed,
        unreadCount,
        playTestChime,
        sendTestNotification,
        sendTestAssignment,
        requestBrowserPermission,
        updateSettings,
        dismissToast,
        markAllRead,
        markRead,
        clearFeed,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { playWhatsAppChime } from "@/lib/notifications/sound";

export interface NotificationSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 100
  inAppToastEnabled: boolean;
  browserPushEnabled: boolean;
  notifyScope: "all" | "direct" | "mine";
  toastDuration: number; // in milliseconds (e.g. 6000)
}

export interface InAppToast {
  id: string;
  chatId: string;
  title: string;
  body: string;
  chatType?: "direct" | "group";
  time?: string;
}

interface NotificationContextValue extends NotificationSettings {
  browserPermission: NotificationPermission | "unsupported";
  activeToasts: InAppToast[];
  playTestChime: () => void;
  sendTestNotification: () => void;
  requestBrowserPermission: () => Promise<NotificationPermission | "unsupported">;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  dismissToast: (id: string) => void;
}

const STORAGE_KEY = "holycrm_notification_prefs_v1";

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundVolume: 80,
  inAppToastEnabled: true,
  browserPushEnabled: true,
  notifyScope: "all",
  toastDuration: 6000,
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");
  const [activeToasts, setActiveToasts] = useState<InAppToast[]>([]);
  const lastCheckTimeRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
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
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
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

  const triggerNotification = useCallback(
    (toast: InAppToast) => {
      // 1. Play Sound
      if (settings.soundEnabled) {
        playWhatsAppChime(settings.soundVolume / 100);
      }

      // 2. Native Browser Desktop Push Notification (when window is hidden or enabled)
      if (
        settings.browserPushEnabled &&
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

      // 3. In-App WhatsApp Web Toast (displayed if user is outside this specific chat)
      if (settings.inAppToastEnabled) {
        setActiveToasts((prev) => {
          const filtered = prev.filter((t) => t.id !== toast.id);
          return [toast, ...filtered].slice(0, 4); // Show up to 4 toasts
        });

        // Auto dismiss
        if (settings.toastDuration > 0) {
          setTimeout(() => {
            dismissToast(toast.id);
          }, settings.toastDuration);
        }
      }
    },
    [settings, router, dismissToast]
  );

  const sendTestNotification = useCallback(() => {
    triggerNotification({
      id: `test-${Date.now()}`,
      chatId: "test-chat",
      title: "+966 54 123 4567 (Ahmed Al-Mansoor)",
      body: "Assalamu Alaikum! Could you please share the current quad room rates for Makkah Clock Tower?",
      chatType: "direct",
      time: "Just now",
    });
  }, [triggerNotification]);

  // Realtime Polling Loop for Incoming Messages
  useEffect(() => {
    let active = true;

    // Check on interval
    const poll = async () => {
      if (!active) return;
      try {
        const url = lastCheckTimeRef.current
          ? `/api/notifications/poll?since=${encodeURIComponent(lastCheckTimeRef.current)}`
          : `/api/notifications/poll`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        if (!active) return;

        if (data.serverTime) {
          // On first run without `since`, just store serverTime checkpoint
          if (!lastCheckTimeRef.current) {
            lastCheckTimeRef.current = data.serverTime;
            return;
          }
          lastCheckTimeRef.current = data.serverTime;
        }

        const newMessages = data.messages ?? [];
        for (const msg of newMessages) {
          if (seenIdsRef.current.has(msg.id)) continue;
          seenIdsRef.current.add(msg.id);

          // If the user is currently on /inbox/<thisChatId> and page is visible, don't show toast
          const isCurrentlyViewingThisChat =
            pathname.startsWith(`/inbox/${msg.chatId}`) && !document.hidden;

          if (isCurrentlyViewingThisChat) {
            continue;
          }

          // Scope filtering
          if (settings.notifyScope === "direct" && msg.chatType === "group") {
            continue;
          }
          if (settings.notifyScope === "mine" && !msg.assignedToMe && !msg.isUnassigned) {
            continue;
          }

          // Trigger WhatsApp-style notification
          triggerNotification({
            id: msg.id,
            chatId: msg.chatId,
            title: msg.title,
            body: msg.body,
            chatType: msg.chatType,
            time: "Just now",
          });
        }
      } catch {
        // Retry next interval
      }
    };

    // Initial check to register timestamp
    void poll();

    const interval = setInterval(poll, document.hidden ? 12000 : 3500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname, settings.notifyScope, triggerNotification]);

  return (
    <NotificationContext.Provider
      value={{
        ...settings,
        browserPermission,
        activeToasts,
        playTestChime,
        sendTestNotification,
        requestBrowserPermission,
        updateSettings,
        dismissToast,
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

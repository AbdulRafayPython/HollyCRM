"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useNotifications, type InAppToast } from "./NotificationContext";
import Icon from "../ui/Icon";
import Avatar from "../ui/Avatar";

export default function WhatsAppToastContainer() {
  const { activeToasts, dismissToast } = useNotifications();
  const router = useRouter();

  if (activeToasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="WhatsApp Notifications"
      className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 max-w-sm sm:max-w-md w-full pointer-events-none"
    >
      {activeToasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
          onClick={() => {
            dismissToast(toast.id);
            if (toast.chatId !== "test-chat") {
              router.push(`/inbox/${toast.chatId}`);
            }
          }}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onClick,
}: {
  toast: InAppToast;
  onDismiss: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group pointer-events-auto cursor-pointer rounded-2xl border border-edge/90 bg-white/95 backdrop-blur-md p-3.5 shadow-2xl ring-1 ring-ink/10 transition-all duration-200 hover:border-wa hover:shadow-wa-dark/10 hover:-translate-y-0.5 animate-slide-in-right"
    >
      <div className="flex items-start gap-3">
        {/* Avatar with WhatsApp Badge */}
        <div className="relative shrink-0">
          <Avatar name={toast.title} type={toast.chatType === "group" ? "group" : "direct"} size={40} />
          <span
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#25D366] text-white ring-2 ring-white shadow-xs"
            title="WhatsApp"
          >
            <Icon name="whatsapp" size={10} fill />
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-xs font-bold text-ink group-hover:text-wa-dark transition-colors">
                {toast.title}
              </span>
              {toast.chatType === "group" && (
                <span className="shrink-0 rounded-md bg-chalk px-1.5 py-0.5 text-[9px] font-bold text-muted">
                  Group
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] font-medium text-subtle">
              {toast.time || "Just now"}
            </span>
          </div>

          <p className="line-clamp-2 text-xs text-muted leading-snug">
            {toast.body}
          </p>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-bold text-wa-dark group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              <span>Open in Inbox</span>
              <Icon name="chevronRight" size={10} />
            </span>
            <span className="text-[10px] font-semibold text-subtle">WhatsApp Web</span>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="shrink-0 rounded-lg p-1 text-subtle hover:bg-chalk hover:text-ink-soft transition"
          aria-label="Dismiss notification"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}

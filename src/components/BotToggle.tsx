"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";
import { useAssistantName } from "./WorkspaceContext";

export default function BotToggle({
  chatId,
  initialPaused,
}: {
  chatId: string;
  initialPaused: boolean;
}) {
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const assistant = useAssistantName();

  async function toggle() {
    setBusy(true);
    const next = !paused;
    const res = await fetch(`/api/chats/${chatId}/bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: next, resumeInHours: next ? 4 : undefined }),
    });
    setBusy(false);
    if (res.ok) {
      setPaused(next);
      router.refresh();
    }
  }

  const active = !paused;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      type="button"
      title={paused ? `${assistant} is paused — click to activate` : `${assistant} is actively answering — click to pause`}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0 shadow-2xs ${
        active
          ? "border-wa-soft bg-wa-soft text-wa-dark hover:bg-wa-soft/80"
          : "border-edge bg-surface text-muted hover:bg-chalk hover:text-ink-soft"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? "bg-wa" : "bg-subtle"}`} />
      <Icon name="bot" size={14} className={active ? "text-wa-dark" : "text-subtle"} />
      <span>{active ? "AI Active" : "AI Paused"}</span>
    </button>
  );
}

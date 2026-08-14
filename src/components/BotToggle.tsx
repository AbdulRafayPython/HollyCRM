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
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      <Icon name="bot" size={14} className={active ? "text-emerald-700" : "text-slate-400"} />
      <span>{active ? "AI Active" : "AI Paused"}</span>
    </button>
  );
}

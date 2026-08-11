"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";
import { useAssistantName } from "./WorkspaceContext";

/**
 * Module 2.2 — pause the AI during a negotiation, with optional auto-resume.
 *
 * The most consequential control on the screen: while this is on, the bot is
 * talking to a live customer. It reads as a switch, not a button.
 */
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

  async function toggle() {
    setBusy(true);
    const next = !paused;
    const res = await fetch(`/api/chats/${chatId}/bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Auto-resume after 4h when pausing; pg_cron clears it (0001 §12).
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
      title={paused ? "AI is paused — resumes automatically in 4h" : "AI is answering this chat"}
      className={`flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-3.5 transition duration-150 ease-swift disabled:opacity-60 ${
        active ? "border-bot/40 bg-bot-soft" : "border-edge bg-surface"
      }`}
    >
      <Icon name="bot" size={16} className={active ? "text-bot" : "text-muted"} />
      <span className="text-caption font-semibold text-ink">{useAssistantName()}</span>

      <span
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-150 ease-swift ${
          active ? "bg-wa" : "bg-edge-strong"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-card transition-transform duration-150 ease-swift ${
            active ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>

      <span className={`text-caption font-medium ${active ? "text-wa-dark" : "text-muted"}`}>
        {active ? "Active" : "Paused 4h"}
      </span>
    </button>
  );
}

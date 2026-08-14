"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import SettingsNav from "@/components/settings/SettingsNav";

interface BotForm {
  enabled: boolean;
  bot_name: string;
  greeting_enabled: boolean;
  greeting_en: string;
  greeting_ar: string;
  custom_instructions: string;
  group_keywords: string;   // comma-separated in the form
  handoff_keywords: string;
  group_cooldown_seconds: number;
  group_daily_cap: number;
  smalltalk_enabled: boolean;
  smalltalk_cooldown_seconds: number;
}

/**
 * Settings → AI Agent. Everything here lands in bot_settings and is picked up
 * by the bot within ~30 seconds — no restart, no deploy. Prices and hotel facts
 * are NOT configurable here on purpose: they always come from inventory SQL.
 */
export default function AiSettingsPage() {
  const [form, setForm] = useState<BotForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/bot")
      .then((r) => r.json())
      .then(({ settings: s }) =>
        setForm({
          enabled: s?.enabled ?? true,
          bot_name: s?.bot_name ?? "AI Assistant",
          greeting_enabled: s?.greeting_enabled ?? true,
          greeting_en: s?.greeting_en ?? "",
          greeting_ar: s?.greeting_ar ?? "",
          custom_instructions: s?.custom_instructions ?? "",
          group_keywords: (s?.group_keywords ?? []).join(", "),
          handoff_keywords: (s?.handoff_keywords ?? []).join(", "),
          group_cooldown_seconds: s?.group_cooldown_seconds ?? 60,
          group_daily_cap: s?.group_daily_cap ?? 10,
          smalltalk_enabled: s?.smalltalk_enabled ?? true,
          smalltalk_cooldown_seconds: s?.smalltalk_cooldown_seconds ?? 45,
        })
      )
      .catch(() => setError("Could not load settings"));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/bot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        group_keywords: form.group_keywords.split(",").map((s) => s.trim()).filter(Boolean),
        handoff_keywords: form.handoff_keywords.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save settings");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const set = <K extends keyof BotForm>(k: K, v: BotForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  if (!form) {
    return <div className="p-6 text-xs text-subtle">Loading AI settings…</div>;
  }

  return (
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">AI Concierge & Persona</h1>
            <p className="text-xs text-subtle">Configure response tone, greetings, keywords, and automated handoff triggers</p>
          </div>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="rounded-full bg-wa-soft px-3 py-1 text-xs font-bold text-wa-dark ring-1 ring-wa-dark/20">
                ✓ Saved — live in ~30s
              </span>
            )}
            <button
              form="bot-form"
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-surface">
          <form id="bot-form" onSubmit={save} className="max-w-4xl mx-auto space-y-5">
            {error && (
              <p className="flex items-start gap-2 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
                <Icon name="alert" size={16} className="mt-0.5 text-danger shrink-0" />
                <span>{error}</span>
              </p>
            )}

          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-ink">Agent</h2>
                <p className="text-caption text-muted">The master switch pauses the AI everywhere, instantly.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                <span className="text-meta font-medium text-ink">{form.enabled ? "Enabled" : "Off"}</span>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Agent name</span>
              <input className="field rounded-lg py-2.5 text-meta" value={form.bot_name} maxLength={60}
                onChange={(e) => set("bot_name", e.target.value)} />
              <span className="mt-1 block text-caption text-subtle">Shown on bot messages in the inbox and used when the AI refers to itself.</span>
            </label>
          </section>

          <section className="panel space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-h3 text-ink">First-contact greeting</h2>
                <p className="text-caption text-muted">Sent once when a new customer opens with “Hi” instead of a hotel question. Direct chats only.</p>
              </div>
              <input type="checkbox" checked={form.greeting_enabled}
                onChange={(e) => set("greeting_enabled", e.target.checked)} />
            </div>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">English greeting</span>
              <textarea rows={3} className="field resize-none rounded-lg py-2.5 text-meta"
                placeholder="Leave empty for the built-in greeting"
                value={form.greeting_en} onChange={(e) => set("greeting_en", e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Arabic greeting</span>
              <textarea rows={3} dir="rtl" className="field resize-none rounded-lg py-2.5 text-meta"
                placeholder="اتركه فارغاً للتحية الافتراضية"
                value={form.greeting_ar} onChange={(e) => set("greeting_ar", e.target.value)} />
            </label>
          </section>

          <section className="panel space-y-3 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-h3 text-ink">Answer greetings mid-conversation</h2>
                <p className="text-caption text-muted">
                  Replies to “salam”, “are you there?” and “thanks” at any point — not only on
                  first contact — and carries any outstanding question forward. Switch this off and
                  the AI stays silent on anything that isn&rsquo;t a booking message.
                </p>
              </div>
              <input type="checkbox" checked={form.smalltalk_enabled}
                onChange={(e) => set("smalltalk_enabled", e.target.checked)} />
            </div>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">
                Minimum gap between social replies (seconds)
              </span>
              <input type="number" min={0} max={3600} className="field rounded-lg py-2.5 text-meta"
                value={form.smalltalk_cooldown_seconds}
                onChange={(e) => set("smalltalk_cooldown_seconds", Number(e.target.value))} />
              <span className="mt-1 block text-caption text-subtle">
                Stops a run of “ok” / “thanks” / 👍 turning into the AI talking to itself.
              </span>
            </label>
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="text-h3 text-ink">Group behavior</h2>
            <p className="text-caption text-muted">
              In groups the AI stays silent unless it is @mentioned or one of these words appears.
            </p>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Trigger keywords (comma-separated)</span>
              <textarea rows={3} className="field resize-none rounded-lg py-2.5 text-meta"
                value={form.group_keywords} onChange={(e) => set("group_keywords", e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">Cooldown (seconds)</span>
                <input type="number" min={10} max={3600} className="field rounded-lg py-2.5 text-meta"
                  value={form.group_cooldown_seconds}
                  onChange={(e) => set("group_cooldown_seconds", Number(e.target.value))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">Max replies per group per day</span>
                <input type="number" min={1} max={200} className="field rounded-lg py-2.5 text-meta"
                  value={form.group_daily_cap}
                  onChange={(e) => set("group_daily_cap", Number(e.target.value))} />
              </label>
            </div>
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="text-h3 text-ink">Human handoff</h2>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Handoff keywords (comma-separated)</span>
              <input className="field rounded-lg py-2.5 text-meta"
                value={form.handoff_keywords} onChange={(e) => set("handoff_keywords", e.target.value)} />
              <span className="mt-1 block text-caption text-subtle">
                Any of these pauses the AI and flags the chat for your team — e.g. discount, manager, خصم.
              </span>
            </label>
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="text-h3 text-ink">Style instructions</h2>
            <textarea rows={4} className="field resize-none rounded-lg py-2.5 text-meta"
              placeholder="e.g. Always address customers respectfully as brother/sister. Mention our free Zamzam water offer when quoting 5-star hotels."
              value={form.custom_instructions} onChange={(e) => set("custom_instructions", e.target.value)} />
            <p className="text-caption text-subtle">
              Shapes tone and extras. It can never override the safety rules — the AI only ever
              quotes prices, distances and availability that exist in your inventory.
            </p>
          </section>
        </form>
      </div>
    </div>
  </div>
  );
}

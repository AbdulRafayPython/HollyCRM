"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

export interface AgentDraft {
  business_name: string;
  business_url: string;
  business_description: string;
  bot_name: string;
  tone: string;
}

const TONES = [
  { id: "warm", label: "Warm & personal", hint: "Friendly, uses names, a little informal." },
  { id: "professional", label: "Professional", hint: "Polished and neutral. The safe default." },
  { id: "concise", label: "Short & direct", hint: "Minimal words. Good for busy sales desks." },
];

/**
 * Build-your-agent, in three steps.
 *
 * Everything here is optional except the business name, and the wizard says so.
 * A setup flow that demands a website, a description and a tone before it will
 * do anything is a setup flow people abandon — and an agent configured with a
 * name alone is still far better than one running on shipped defaults that
 * describe nobody's business.
 */
export default function BuildAgentWizard({
  initial,
  onClose,
  onDone,
}: {
  // Nullable rather than optional: these arrive straight off a database row,
  // where "not set" is null, not undefined.
  initial?: { [K in keyof AgentDraft]?: string | null };
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft>({
    business_name: initial?.business_name ?? "",
    business_url: initial?.business_url ?? "",
    business_description: initial?.business_description ?? "",
    bot_name: initial?.bot_name ?? "AI Assistant",
    tone: "professional",
  });

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Could not save."); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const canAdvance = step === 0 ? draft.business_name.trim().length > 0 : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-lg animate-rise-in overflow-hidden p-0">
        <header className="flex items-center gap-3 border-b border-edge px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon name="bot" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-ink">Build your AI agent</h2>
            <p className="text-caption text-muted">Step {step + 1} of 3</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-full p-1.5">
            <Icon name="close" size={15} />
          </button>
        </header>

        {/* Progress rail. Three segments that fill, so "how much longer" is
            answerable at a glance rather than after reading a step counter. */}
        <div className="flex gap-1 px-5 pt-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
              <span
                className="block h-full rounded-full bg-brand transition-all duration-500 ease-swift"
                style={{ width: i <= step ? "100%" : "0%" }}
              />
            </span>
          ))}
        </div>

        <div className="min-h-64 space-y-4 p-5">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px shrink-0" />{error}
            </p>
          )}

          {step === 0 && (
            <div className="animate-rise-in space-y-4">
              <div>
                <h3 className="text-body font-semibold text-ink">Who does the agent work for?</h3>
                <p className="mt-0.5 text-caption text-muted">
                  This goes into how it introduces itself and talks about your business.
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">Business name</span>
                <input
                  autoFocus
                  value={draft.business_name}
                  onChange={(e) => set("business_name", e.target.value)}
                  placeholder="Holyland Travel"
                  className="field w-full rounded-lg py-2.5 text-meta"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">
                  Website <span className="font-normal text-subtle">— optional</span>
                </span>
                <input
                  value={draft.business_url}
                  onChange={(e) => set("business_url", e.target.value)}
                  placeholder="https://your-site.com"
                  className="field w-full rounded-lg py-2.5 text-meta"
                />
                <span className="mt-1 block text-caption text-subtle">
                  We&rsquo;ll read the page and add it to the knowledge base, so the agent can
                  answer from your own site straight away. You can add more documents later.
                </span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="animate-rise-in space-y-4">
              <div>
                <h3 className="text-body font-semibold text-ink">What should it know?</h3>
                <p className="mt-0.5 text-caption text-muted">
                  A few lines about what you sell and how you work. Skip it if you&rsquo;d rather
                  upload documents instead.
                </p>
              </div>
              <textarea
                autoFocus
                rows={6}
                value={draft.business_description}
                onChange={(e) => set("business_description", e.target.value)}
                placeholder="We arrange Umrah and Hajj packages from Pakistan and the UK. We book hotels in Makkah and Madinah, arrange visas and airport transfers, and take payment by bank transfer."
                className="field w-full resize-none rounded-lg py-2.5 text-meta"
              />
              <p className="flex items-start gap-2 rounded-lg border border-edge bg-surface p-3 text-caption text-muted">
                <Icon name="lock" size={13} className="mt-px shrink-0" />
                <span>
                  This shapes tone and framing only. Prices always come from your inventory,
                  never from what you write here — so nothing typed in this box can make the
                  agent quote a number.
                </span>
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="animate-rise-in space-y-4">
              <div>
                <h3 className="text-body font-semibold text-ink">How should it sound?</h3>
                <p className="mt-0.5 text-caption text-muted">Change this any time.</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">Agent name</span>
                <input
                  value={draft.bot_name}
                  onChange={(e) => set("bot_name", e.target.value)}
                  className="field w-full rounded-lg py-2.5 text-meta"
                />
              </label>
              <div className="space-y-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => set("tone", t.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150 ease-swift ${
                      draft.tone === t.id
                        ? "border-brand bg-brand-soft"
                        : "border-edge bg-card hover:border-edge-strong"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      draft.tone === t.id ? "border-brand" : "border-edge-strong"
                    }`}>
                      {draft.tone === t.id && <span className="h-2 w-2 rounded-full bg-brand" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-meta font-medium text-ink">{t.label}</span>
                      <span className="block text-caption text-muted">{t.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-edge px-5 py-4">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-ghost rounded-lg px-4 py-2 text-meta">
              Back
            </button>
          )}
          <button onClick={onClose} className="btn-ghost ml-auto rounded-lg px-4 py-2 text-meta">
            Cancel
          </button>
          {step < 2 ? (
            <button
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
              className="btn-primary rounded-lg px-5 py-2 text-meta disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={submit}
              className="btn-primary rounded-lg px-5 py-2 text-meta disabled:opacity-40"
            >
              {busy ? "Building…" : "Build my agent"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

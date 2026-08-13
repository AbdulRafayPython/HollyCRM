"use client";

import { useState } from "react";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";

export interface TraceStep {
  node: string;
  status: "ok" | "skipped" | "failed";
  summary: string;
  detail?: Record<string, unknown>;
  ms: number;
}

export interface TestResult {
  reply: string | null;
  intent: string;
  trace: TraceStep[];
  latencyMs: number;
  succeeded: boolean;
}

/** Cases worth running before a demo, in the order things actually break. */
const PRESETS = [
  { label: "Greeting", message: "Assalamu alaikum" },
  { label: "Full booking", message: "5 star hotel in Makkah, 12-15 September, 5 people" },
  { label: "Partial booking", message: "I need a hotel for next month" },
  { label: "Policy question", message: "Do you arrange transport from Jeddah airport?" },
  { label: "Wants a human", message: "Can I speak to someone about a discount?" },
  { label: "Mid-chat greeting", message: "hello are you there?" },
];

/**
 * Runs a message through the real pipeline and shows what each step did.
 *
 * The trace is the point, not the reply. "The bot said something odd" is not
 * debuggable; "the extractor read no city, so it skipped the search and asked a
 * clarifying question" is a thing you can go and fix.
 */
export default function TestPanel({
  onActiveNode,
  onResult,
  onClose,
}: {
  /** Lights the matching node on the canvas as each step is reported. */
  onActiveNode: (node: string | null) => void;
  /** Lifts the trace so each node's panel can show its own input and output. */
  onResult: (result: TestResult | null) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError(null); setResult(null); onResult(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Test failed to run."); return; }
      setResult(json as TestResult);
      onResult(json as TestResult);
      await replay(json as TestResult);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Walks the canvas through the trace after the fact.
   *
   * The run has already finished by the time this starts — the steps are
   * replayed at a readable pace rather than streamed live. Streaming would need
   * the route to hold a connection open across three model calls for what is,
   * honestly, a two-second animation.
   */
  async function replay(r: TestResult) {
    for (const step of r.trace) {
      onActiveNode(canvasNode(step.node));
      await new Promise((res) => setTimeout(res, 260));
    }
    onActiveNode(null);
  }

  return (
    <aside className="flex h-full w-96 flex-col border-l border-edge bg-card shadow-drawer">
      <header className="flex items-center gap-2.5 border-b border-edge p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon name="play" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-ink">Test the workflow</h2>
          <p className="text-caption text-muted">Nothing is sent to WhatsApp.</p>
        </div>
        <button onClick={onClose} className="btn-ghost rounded-full p-1.5">
          <Icon name="close" size={14} />
        </button>
      </header>

      <div className="shrink-0 space-y-2 border-b border-edge p-4">
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(message);
          }}
          placeholder="Type what a customer would send…"
          className="field w-full resize-none rounded-lg py-2 text-meta"
        />
        <div className="flex items-center gap-2">
          <button
            disabled={busy || !message.trim()}
            onClick={() => run(message)}
            className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-meta disabled:opacity-40"
          >
            {busy ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running…
              </>
            ) : (
              <><Icon name="play" size={13} />Run test</>
            )}
          </button>
          <span className="text-caption text-subtle">⌘/Ctrl + Enter</span>
        </div>

        <div className="flex flex-wrap gap-1 pt-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              disabled={busy}
              onClick={() => { setMessage(p.message); run(p.message); }}
              className="rounded-full border border-dashed border-edge px-2 py-0.5 text-caption text-subtle transition-colors duration-150 hover:border-brand/40 hover:text-brand disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
            <Icon name="alert" size={15} className="mt-px shrink-0" />{error}
          </p>
        )}

        {!result && !error && !busy && (
          <p className="pt-8 text-center text-caption text-subtle">
            Run a test to see how each step handles the message.
          </p>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone={result.succeeded ? "wa" : "danger"}>
                {result.succeeded ? "Completed" : "Failed"}
              </Chip>
              <Chip tone="brand">{result.intent}</Chip>
              <Chip tone="neutral">{(result.latencyMs / 1000).toFixed(1)}s</Chip>
            </div>

            {result.reply && (
              <div>
                <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-subtle">
                  What the customer would receive
                </h3>
                <div className="rounded-xl rounded-tl-sm border border-wa/30 bg-wa-soft p-3">
                  <p className="whitespace-pre-wrap text-meta leading-relaxed text-ink">
                    {result.reply}
                  </p>
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-subtle">
                Step by step
              </h3>
              <ol className="space-y-1.5">
                {result.trace.map((step, i) => (
                  <li
                    key={`${step.node}-${i}`}
                    onMouseEnter={() => onActiveNode(canvasNode(step.node))}
                    onMouseLeave={() => onActiveNode(null)}
                    className="animate-rise-in rounded-lg border border-edge bg-surface p-2.5"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${
                        step.status === "ok" ? "bg-wa"
                        : step.status === "skipped" ? "bg-subtle" : "bg-danger"
                      }`} />
                      <span className="flex-1 truncate text-meta font-medium text-ink">
                        {NODE_LABEL[step.node] ?? step.node}
                      </span>
                      <span className="text-caption tabular-nums text-subtle">{step.ms}ms</span>
                    </div>
                    <p className="mt-1 pl-4 text-caption leading-relaxed text-muted">
                      {step.summary}
                    </p>
                    {step.detail && Object.keys(step.detail).length > 0 && (
                      <dl className="mt-1.5 space-y-0.5 pl-4">
                        {Object.entries(step.detail)
                          .filter(([, v]) => v !== null && v !== undefined &&
                            !(Array.isArray(v) && v.length === 0))
                          .map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-caption">
                              <dt className="shrink-0 text-subtle">{k.replace(/_/g, " ")}</dt>
                              <dd className="min-w-0 flex-1 truncate text-muted">
                                {Array.isArray(v) ? v.join(", ") : String(v)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Trace step ids -> canvas node ids. They differ where one canvas node covers
 *  two trace steps (the model check and the extraction both light "understand"). */
function canvasNode(step: string): string {
  return step === "understand_model" ? "understand" : step;
}

const NODE_LABEL: Record<string, string> = {
  trigger: "WhatsApp message",
  understand_model: "Model",
  understand: "Understand",
  rules: "Your rules",
  greet: "Greeting & small talk",
  knowledge: "Knowledge base",
  answer: "Answer from documents",
  inventory: "Inventory search",
  quote: "Send quote",
  route: "Route & assign",
};

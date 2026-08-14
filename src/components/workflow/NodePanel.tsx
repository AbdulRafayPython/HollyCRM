"use client";

import { useEffect } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { EDGES, NODE_TOGGLE, type WorkflowNode } from "@/lib/workflow";
import type { TraceStep } from "./TestPanel";
import DataView, { type DataPacket } from "./DataView";
import NodeGlyph, { glyphFor } from "./NodeGlyph";

export interface NodePanelProps {
  node: WorkflowNode;
  status?: { status: "ready" | "attention" | "neutral"; detail: string };
  toggles: Record<string, boolean>;
  /** The last test run's trace, so each node can show real data it handled. */
  trace: TraceStep[] | null;
  settings: Record<string, unknown> | null;
  onToggle: (column: string, next: boolean) => void;
  onSettingChange: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}

/**
 * The node detail view: a centred modal, three columns.
 *
 *   INPUT          CONFIGURATION          OUTPUT
 *   what arrived   what this step does    what it produced
 *
 * Reading left to right follows the data, which is the same direction the
 * canvas runs — so the panel answers "what did this node get, what did it do
 * with it, what came out" in one screen without scrolling between panes.
 *
 * A modal rather than a docked sidebar: the three columns need the full width
 * to be legible side by side, and a sidebar wide enough for them would leave no
 * canvas. Inspecting a node is a focused act; the canvas can wait behind it.
 */
export default function NodePanel({
  node, status, toggles, trace, settings,
  onToggle, onSettingChange, onClose,
}: NodePanelProps) {
  const step = trace?.find((t) => canvasNode(t.node) === node.id) ?? null;
  const upstream = EDGES.filter((e) => e.to === node.id);
  const downstream = EDGES.filter((e) => e.from === node.id);
  const upstreamSteps = (trace ?? []).filter((t) =>
    upstream.some((e) => e.from === canvasNode(t.node))
  );
  const toggleKey = NODE_TOGGLE[node.id];
  const disabled = toggleKey ? toggles[toggleKey] === false : false;

  // Escape closes from anywhere, including a focused input inside the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${node.title} settings`}
    >
      <div className="panel flex h-[86vh] w-full max-w-6xl animate-rise-in flex-col overflow-hidden p-0">
        <header className="flex shrink-0 items-center gap-3 border-b border-edge px-5 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <NodeGlyph name={glyphFor(node.id)} size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-h3 text-ink">{node.title}</h2>
            <p className="truncate text-caption text-muted">{node.summary}</p>
          </div>
          {disabled && <Chip tone="neutral">Switched off</Chip>}
          {step && (
            <Chip tone={step.status === "ok" ? "wa" : step.status === "skipped" ? "neutral" : "danger"}>
              last run: {step.status === "ok" ? "ran" : step.status === "skipped" ? "skipped" : "failed"}
            </Chip>
          )}
          <button onClick={onClose} className="btn-ghost rounded-full p-2" title="Close (Esc)">
            <Icon name="close" size={16} />
          </button>
        </header>

        {/* Three columns on a wide screen; stacked below it, because three
            160px columns are worse than one readable one. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-edge overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0 lg:overflow-hidden">
          {/* ---------------- INPUT ---------------- */}
          <section className="scroll-thin flex min-h-0 flex-col overflow-y-auto">
            <ColumnHead
              icon="arrowDown"
              title="Input"
              hint={
                upstream.length === 0
                  ? "Where the flow starts"
                  : `From ${upstream.map((e) => labelFor(e.from)).join(", ")}`
              }
            />
            <div className="space-y-3 p-4">
              <DataView
                packets={upstreamSteps.map(toPacket)}
                empty={
                  upstream.length === 0
                    ? "This is the first step. Its input is a WhatsApp message arriving on your connected number — run a test to capture one."
                    : `Run a test to see the real data that arrives here from ${upstream
                        .map((e) => labelFor(e.from))
                        .join(" or ")}.`
                }
              />

              {upstream.length > 0 && (
                <div>
                  <h4 className="mb-1 text-caption font-semibold uppercase tracking-wide text-subtle">
                    Reaches this step when
                  </h4>
                  <ul className="space-y-1">
                    {upstream.map((e) => (
                      <li key={`${e.from}-${e.to}`} className="text-caption text-muted">
                        <span className="text-ink">{labelFor(e.from)}</span>
                        {e.label ? <> &rarr; <span className="font-medium">{e.label}</span></> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* ------------- CONFIGURATION ------------- */}
          <section className="scroll-thin flex min-h-0 flex-col overflow-y-auto bg-surface/40">
            <ColumnHead icon="settings" title="Configuration" hint="What this step does" />
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 p-4">
                {toggleKey && (
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-card p-3">
                    <span className="min-w-0">
                      <span className="block text-meta font-medium text-ink">Step is active</span>
                      <span className="block text-caption text-muted">
                        Off skips this branch entirely.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={!disabled}
                      onChange={(e) => onToggle(toggleKey, e.target.checked)}
                    />
                  </label>
                )}

                {status && (
                  <div className={`rounded-lg border p-3 text-meta ${
                    status.status === "attention"
                      ? "border-bot/30 bg-bot-soft text-bot-dark"
                      : status.status === "ready"
                        ? "border-wa/25 bg-wa-soft text-wa-dark"
                        : "border-edge bg-card text-muted"
                  }`}>
                    {status.detail}
                  </div>
                )}

                <InlineSettings node={node} settings={settings} onChange={onSettingChange} />

                <div className="space-y-1.5">
                  <h4 className="text-caption font-semibold uppercase tracking-wide text-subtle">
                    How it works
                  </h4>
                  <p className="text-meta leading-relaxed text-muted">{DETAIL[node.id]}</p>
                </div>

                {GUARANTEE[node.id] && (
                  <div className="rounded-lg border border-edge bg-card p-3">
                    <h4 className="mb-1 flex items-center gap-1.5 text-caption font-semibold text-ink">
                      <Icon name="lock" size={12} className="text-muted" />Fixed behaviour
                    </h4>
                    <p className="text-caption leading-relaxed text-muted">{GUARANTEE[node.id]}</p>
                  </div>
                )}
              </div>

              {node.settings && (
                <div className="shrink-0 border-t border-edge p-4">
                  <Link
                    href={SETTINGS_HREF[node.settings]}
                    className="btn-primary flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-meta"
                  >
                    <Icon name="settings" size={14} />
                    {SETTINGS_LABEL[node.settings]}
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* ---------------- OUTPUT ---------------- */}
          <section className="scroll-thin flex min-h-0 flex-col overflow-y-auto">
            <ColumnHead
              icon="arrowUp"
              title="Output"
              hint={
                downstream.length === 0
                  ? "Ends here — the reply is sent"
                  : `Goes to ${downstream.map((e) => labelFor(e.to)).join(", ")}`
              }
            />
            <div className="space-y-3 p-4">
              <DataView
                packets={step ? [toPacket(step)] : []}
                empty="No data yet. Run a test and this shows exactly what this step produced."
              />

              {downstream.length > 0 ? (
                <div>
                  <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-subtle">
                    Passed on to
                  </h4>
                  <ul className="space-y-1.5">
                    {downstream.map((e) => (
                      <li
                        key={`${e.from}-${e.to}`}
                        className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-2.5 py-1.5"
                      >
                        <Icon name="chevronRight" size={12} className="shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">
                          {labelFor(e.to)}
                        </span>
                        {e.label && <Chip tone={e.muted ? "neutral" : "brand"}>{e.label}</Chip>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Empty>
                  Nothing follows — this step sends the reply and the conversation waits for
                  the customer.
                </Empty>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ColumnHead({ icon, title, hint }: { icon: "arrowDown" | "arrowUp" | "settings"; title: string; hint: string }) {
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-edge bg-card/95 px-4 py-2.5 backdrop-blur">
      <h3 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-ink">
        <Icon name={icon} size={12} className="text-subtle" />
        {title}
      </h3>
      <p className="mt-0.5 truncate text-caption text-subtle">{hint}</p>
    </div>
  );
}

/**
 * The handful of settings worth editing without leaving the canvas.
 *
 * Deliberately not every setting: the full pages exist and are linked below.
 * What is here is what someone adjusts WHILE looking at the flow — wording and
 * switches — rather than what they set up once, like hotel rates.
 */
function InlineSettings({ node, settings, onChange }: {
  node: WorkflowNode;
  settings: Record<string, unknown> | null;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  if (!settings) return null;

  if (node.id === "understand" || node.id === "greet") {
    return (
      <label className="block">
        <span className="mb-1 block text-caption font-semibold uppercase tracking-wide text-subtle">
          Agent name
        </span>
        <input
          defaultValue={String(settings.bot_name ?? "")}
          onBlur={(e) => onChange({ bot_name: e.target.value })}
          className="field w-full rounded-lg py-2 text-meta"
        />
        <span className="mt-1 block text-caption text-subtle">Saved when you click away.</span>
      </label>
    );
  }

  if (node.id === "quote" || node.id === "answer") {
    return (
      <label className="block">
        <span className="mb-1 block text-caption font-semibold uppercase tracking-wide text-subtle">
          Style notes
        </span>
        <textarea
          rows={5}
          defaultValue={String(settings.custom_instructions ?? "")}
          onBlur={(e) => onChange({ custom_instructions: e.target.value })}
          placeholder="How replies should sound. Never overrides the fixed behaviour below."
          className="field w-full resize-none rounded-lg py-2 text-meta"
        />
      </label>
    );
  }

  return null;
}

/**
 * A trace step as an inspectable packet.
 *
 * `detail` is the step's own field data — the extracted city, the hotel rows,
 * the rules that matched — and it is what someone tuning the agent came here to
 * read. Status, timing and the one-line summary ride alongside it so the JSON
 * tab answers "what happened" as well as "what came out".
 */
function toPacket(s: TraceStep): DataPacket {
  return {
    label: labelFor(canvasNode(s.node)),
    status: s.status,
    ms: s.ms,
    summary: s.summary,
    data: s.detail ?? {},
  };
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-edge p-4 text-center text-caption leading-relaxed text-subtle">
      {children}
    </p>
  );
}

function canvasNode(step: string): string {
  return step === "understand_model" ? "understand" : step;
}

function labelFor(id: string): string {
  return LABELS[id] ?? id;
}

const LABELS: Record<string, string> = {
  trigger: "WhatsApp message",
  understand: "Understand",
  rules: "Your rules",
  greet: "Greeting & small talk",
  knowledge: "Knowledge base",
  answer: "Answer from documents",
  inventory: "Inventory search",
  quote: "Send quote",
  route: "Route & assign",
  assigned: "Assigned to an agent",
  fallback: "Fallback",
};

const SETTINGS_HREF: Record<string, string> = {
  rules: "/ai/rules?from=/ai/workflow",
  ai: "/settings/ai?from=/ai/workflow",
  knowledge: "/settings/knowledge?from=/ai/workflow",
  inventory: "/settings/inventory?from=/ai/workflow",
  routing: "/settings/routing?from=/ai/workflow",
  llm: "/settings/llm?from=/ai/workflow",
  whatsapp: "/settings/whatsapp?from=/ai/workflow",
};

const SETTINGS_LABEL: Record<string, string> = {
  rules: "Edit your rules",
  ai: "Open AI agent settings",
  knowledge: "Open knowledge & imports",
  inventory: "Open hotel inventory",
  routing: "Open routing & team",
  llm: "Open model & API keys",
  whatsapp: "Open WhatsApp connection",
};

const DETAIL: Record<string, string> = {
  rules:
    "Your own if/else, checked on every message right after the AI works out what the customer wants — so conditions can test intent, city, budget and party size, not just raw text. Rules run in priority order and the first match wins.",
  trigger:
    "Every inbound WhatsApp message hits the webhook, is de-duplicated, stored, and answered within 100ms. The agent runs afterwards, off the response path, so a slow model never causes duplicate deliveries.",
  understand:
    "One model call classifies the message (greeting, question, booking, human request) and pulls out city, dates, party size and budget. Values merge with what this person already told you, so nothing has to be repeated.",
  greet:
    "Greetings and thanks are answered at any point in a conversation, not only on first contact, and carry any outstanding question forward. Throttled so a run of \"ok\" / \"thanks\" produces one reply, not four.",
  knowledge:
    "Full-text search over your uploaded PDFs, sheets and notes. Returns nothing when nothing matches — which routes the customer to a human instead of inventing an answer.",
  inventory:
    "Exact SQL against hotels, room types and seasonal rates, filtered on city, dates, party size, distance and stars. Room counts are derived from the party size, so \"5 people\" matches two quads.",
  quote:
    "The reply is written only from the rows SQL returned. Hotels already quoted to this person are noted so \"anything else?\" gets something else.",
  answer:
    "The reply is written only from the retrieved passages, and says a colleague will confirm when they don't cover the question.",
  route:
    "Reads the customer's dialling code, finds the region that covers it, and picks the least-busy online agent on that desk. Falls back to any available agent if you allow it, and to nobody if you don't.",
  assigned:
    "The chat and its lead are assigned, the bot pauses so it can't talk over the agent, and an internal note records who took it and why.",
  fallback:
    "When no agent is available the customer gets your out-of-hours wording instead of a promise the team can't keep, and the chat waits in the unassigned queue.",
};

const GUARANTEE: Record<string, string> = {
  inventory:
    "This step cannot be removed from the flow. Switching it off stops the agent quoting at all — it still gathers requirements and hands over to a person. Every price it ever sends comes from a rate row here.",
  quote:
    "The model is given the SQL results and nothing else. It cannot invent a hotel, a price, a distance or a star rating.",
  answer:
    "Documents are never used as a price source. If a customer asks about cost here, the agent pulls live rates instead of reading a number out of a PDF that may be months old.",
  route:
    "A chat already owned by a human is never reassigned — the router leaves it alone rather than moving it out from under whoever is mid-reply.",
};

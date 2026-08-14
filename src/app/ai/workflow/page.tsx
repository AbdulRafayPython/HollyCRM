"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import WorkflowCanvas, { type Layout, type NodeStatus } from "@/components/workflow/WorkflowCanvas";
import TestPanel, { type TestResult } from "@/components/workflow/TestPanel";
import NodePanel from "@/components/workflow/NodePanel";
import { NODES } from "@/lib/workflow";

interface Snapshot {
  instanceReady: boolean;
  llm: { label: string; ready: boolean };
  knowledge: { docs: number };
  inventory: { hotels: number };
  routing: { regions: number; online: number; agents: number };
  rules: { active: number };
}

type Toggles = Record<string, boolean>;

/**
 * The workflow editor.
 *
 * Arrange the steps, switch optional branches off, open any step's real
 * settings, and run a message through the whole thing to see what each step
 * does with it.
 */
export default function WorkflowPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [layout, setLayout] = useState<Layout>({});
  const [toggles, setToggles] = useState<Toggles>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lifted out of the test panel so every node can show its own input/output. */
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [agentSettings, setAgentSettings] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const [agent, inst, llm, knowledge, hotels, routing, rules] = await Promise.all([
      fetch("/api/ai/agent").then(safe),
      fetch("/api/instance").then(safe),
      fetch("/api/settings/llm").then(safe),
      fetch("/api/settings/knowledge").then(safe),
      fetch("/api/settings/hotels").then(safe),
      fetch("/api/settings/routing").then(safe),
      fetch("/api/settings/rules").then(safe),
    ]);

    const a = agent?.agent;
    if (a) {
      setAgentSettings(a);
      setLayout(a.workflow_layout ?? {});
      setToggles({
        smalltalk_enabled: a.smalltalk_enabled !== false,
        knowledge_enabled: a.knowledge_enabled !== false,
        inventory_enabled: a.inventory_enabled !== false,
        auto_assign_enabled: a.auto_assign_enabled !== false,
      });
    }

    // The active entry is now the deployment key when nothing overrides it, so
    // this reports the real provider and model rather than "not configured".
    const active = (llm?.providers ?? []).find((p: { is_active: boolean }) => p.is_active);
    setSnap({
      instanceReady: Boolean(inst?.healthy),
      llm: {
        label: active ? `${active.provider} · ${active.model}` : "Not configured",
        ready: Boolean(llm?.connected),
      },
      knowledge: {
        docs: (knowledge?.sources ?? []).filter(
          (s: { purpose: string; status: string; is_active: boolean }) =>
            s.purpose === "knowledge" && s.status === "ready" && s.is_active
        ).length,
      },
      inventory: { hotels: (hotels?.hotels ?? []).length },
      routing: {
        regions: (routing?.regions ?? []).length,
        online: (routing?.agents ?? []).filter((x: { is_online: boolean }) => x.is_online).length,
        agents: (routing?.agents ?? []).length,
      },
      rules: {
        active: (rules?.rules ?? []).filter((r: { is_active: boolean }) => r.is_active).length,
      },
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  /* --- persistence ----------------------------------------------------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not save.");
      }
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Layout is applied locally at once and written after a pause.
   *
   * Dragging four nodes into place is four pointer-up events in a few seconds;
   * writing each one immediately is four round trips for a single act of
   * arranging. The canvas never waits on the network either way.
   */
  const onLayoutChange = useCallback((next: Layout) => {
    setLayout(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => patch({ workflow_layout: next }), 700);
  }, [patch]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const onToggle = useCallback((column: string, next: boolean) => {
    setToggles((t) => ({ ...t, [column]: next }));
    patch({ [column]: next });
  }, [patch]);

  /* --- node readiness -------------------------------------------------- */
  const statuses = useMemo(() => {
    const out: Record<string, { status: NodeStatus; detail: string }> = {};
    if (!snap) return out;

    out.trigger = snap.instanceReady
      ? { status: "ready", detail: "Connected and receiving messages." }
      : { status: "attention", detail: "WhatsApp is not connected — nothing arrives." };

    out.understand = {
      status: snap.llm.ready ? "ready" : "attention",
      detail: snap.llm.ready ? snap.llm.label : "No model key — the agent cannot reply.",
    };

    out.knowledge = snap.knowledge.docs > 0
      ? { status: "ready", detail: `${snap.knowledge.docs} document${snap.knowledge.docs === 1 ? "" : "s"} searchable.` }
      : { status: "attention", detail: "No documents — every question goes to a human." };

    out.inventory = snap.inventory.hotels > 0
      ? { status: "ready", detail: `${snap.inventory.hotels} hotels priced.` }
      : { status: "attention", detail: "No inventory — nothing can be quoted." };

    // Neutral, never "attention": no rules is a perfectly good configuration —
    // it means the built-in flow runs, which is what most workspaces want.
    out.rules = snap.rules.active > 0
      ? { status: "ready", detail: `${snap.rules.active} rule${snap.rules.active === 1 ? "" : "s"} active.` }
      : { status: "neutral", detail: "No rules — the built-in flow decides everything." };

    out.route = snap.routing.online > 0
      ? { status: "ready", detail: `${snap.routing.online} of ${snap.routing.agents} online · ${snap.routing.regions} regions.` }
      : { status: "attention", detail: "Nobody online — handoffs use the fallback message." };

    return out;
  }, [snap]);

  const node = NODES.find((n) => n.id === selected) ?? null;
  const needsSetup = Object.values(statuses).filter((s) => s.status === "attention").length;

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6 md:px-8 z-10">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/ai" title="Back to AI agent" />
          <h1 className="text-xl font-bold text-ink">Workflow Canvas</h1>
          {snap && (needsSetup > 0
            ? <span className="rounded-full bg-bot-soft px-2.5 py-0.5 text-xs font-bold text-bot-dark ring-1 ring-bot/20">{needsSetup} step{needsSetup === 1 ? "" : "s"} need setup</span>
            : <span className="rounded-full bg-wa-soft px-2.5 py-0.5 text-xs font-bold text-wa-dark ring-1 ring-wa-dark/20">All steps configured</span>)}
        </div>

        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-danger font-medium">{error}</span>}
          <span className={`text-xs text-subtle font-medium transition-opacity duration-200 ${saving ? "opacity-100" : "opacity-0"}`}>
            Saving layout…
          </span>
          <Link
            href="/ai/rules?from=/ai/workflow"
            className="flex items-center gap-1.5 rounded-xl border border-edge bg-white px-3.5 py-2 text-xs font-semibold text-ink-soft hover:bg-surface transition shadow-2xs"
          >
            <Icon name="filter" size={14} />
            <span>Rules{snap?.rules.active ? ` (${snap.rules.active})` : ""}</span>
          </Link>
          <button
            onClick={() => { setTesting((v) => !v); setSelected(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs ${
              testing
                ? "border border-edge bg-white text-ink-soft hover:bg-surface"
                : "bg-brand text-white hover:bg-brand"
            }`}
          >
            <Icon name="play" size={14} />
            <span>{testing ? "Close Simulation" : "Test Workflow"}</span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <WorkflowCanvas
            statuses={statuses}
            toggles={toggles}
            layout={layout}
            selected={selected}
            activeNode={activeNode}
            onSelect={setSelected}
            onLayoutChange={onLayoutChange}
            onToggle={onToggle}
          />

        </div>

        {testing && (
          <TestPanel
            onActiveNode={setActiveNode}
            onResult={setTestResult}
            onClose={() => setTesting(false)}
          />
        )}
      </div>

      {/* Overlays the whole editor rather than docking beside it: the three
          columns need the full width to sit side by side and stay readable. */}
      {node && (
        <NodePanel
          node={node}
          status={statuses[node.id]}
          toggles={toggles}
          trace={testResult?.trace ?? null}
          settings={agentSettings}
          onToggle={onToggle}
          onSettingChange={(p) => { setAgentSettings((s) => ({ ...(s ?? {}), ...p })); patch(p); }}
          onNavigate={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

async function safe(r: Response) {
  return r.ok ? r.json().catch(() => null) : null;
}

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
    "Your own if/else, checked on every message right after the AI works out what the customer wants — so conditions can test intent, city, budget and party size, not just the raw text. Rules run in priority order and the first match wins. With no rules, the built-in flow runs exactly as before.",
  trigger:
    "Every inbound WhatsApp message hits the webhook, is de-duplicated, stored, and answered within 100ms — the agent runs afterwards, off the response path, so a slow model never causes duplicate deliveries.",
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
    "This step cannot be removed from the flow. Switching it off stops the agent quoting at all — it still gathers requirements and hands over to a person. Every price it ever sends comes from a rate row here; the model never sees your rate sheets and cannot estimate a number.",
  quote:
    "The model is given the SQL results and nothing else. It cannot invent a hotel, a price, a distance or a star rating.",
  answer:
    "Documents are never used as a price source. If a customer asks about cost here, the agent pulls live rates instead of reading a number out of a PDF that may be months old.",
  route:
    "A chat already owned by a human is never reassigned — the router leaves it alone rather than moving it out from under whoever is mid-reply.",
};

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  ACTION_LABEL, ACTIONS, FIELD_LABEL, FIELDS, OPERATOR_LABEL, OPERATORS,
  type ActionType, type Condition, type Field, type Operator, type Rule,
} from "@/lib/bot/rules";

interface Named { id: string; name?: string | null; full_name?: string | null }

/** Values that only make sense from a list. Free text everywhere else, because
 *  a dropdown of every possible message substring is not a thing. */
const SUGGESTIONS: Partial<Record<Field, { value: string; label: string }[]>> = {
  intent: [
    { value: "hotel_inquiry", label: "Asking about hotels" },
    { value: "greeting", label: "Greeting" },
    { value: "thanks", label: "Thanks" },
    { value: "other_question", label: "Other question" },
    { value: "human_request", label: "Wants a human" },
    { value: "smalltalk", label: "Small talk" },
  ],
  language: [
    { value: "en", label: "English" }, { value: "ar", label: "Arabic" },
    { value: "ur", label: "Urdu" }, { value: "other", label: "Other" },
  ],
  city: [{ value: "Makkah", label: "Makkah" }, { value: "Madinah", label: "Madinah" }],
  chat_type: [{ value: "direct", label: "Direct chat" }, { value: "group", label: "Group" }],
};

const NO_VALUE: Operator[] = ["is_set", "is_empty"];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [regions, setRegions] = useState<Named[]>([]);
  const [agents, setAgents] = useState<Named[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/rules");
    if (!res.ok) return setError("Could not load rules");
    const j = await res.json();
    setRules(j.rules); setRegions(j.regions); setAgents(j.agents);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(method: string, body: unknown, url = "/api/settings/rules") {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
      return false;
    }
    await load();
    return true;
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 bg-white px-6 md:px-8 z-10">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/ai/workflow" title="Back to Workflow" />
          <h1 className="text-xl font-bold text-ink">Business Routing Rules</h1>
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand ring-1 ring-brand/20">
            {rules.filter((r) => r.is_active).length} active
          </span>
        </div>

        <button
          onClick={() => setEditing({ name: "", match_type: "all", priority: 100, conditions: [], action: { type: "handoff" } })}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition"
        >
          <Icon name="plus" size={14} />
          <span>Add New Rule</span>
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {error && (
            <p className="flex items-start gap-2 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
              <Icon name="alert" size={16} className="mt-0.5 text-danger shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="rounded-2xl border border-edge/80 bg-white p-4 text-xs text-muted leading-relaxed shadow-xs flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/20 mt-0.5">
              <Icon name="info" size={14} />
            </span>
            <p>
              Rules execute in sequence on every incoming message after intent detection. The first matching condition triggers its destination desk, routing VIP inquiries, language preferences, or human escalations.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {rules.map((rule, i) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={i}
                regions={regions}
                agents={agents}
                onEdit={() => setEditing(rule)}
                onToggle={() => send("PATCH", { action: "toggle", id: rule.id, is_active: !rule.is_active })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete “${rule.name}”?`,
                    body: "Messages will stop being handled by this rule immediately.",
                    confirmLabel: "Delete rule",
                    tone: "danger",
                  });
                  if (ok) send("DELETE", null, `/api/settings/rules?id=${rule.id}`);
                }}
              />
            ))}
          </div>

          {rules.length === 0 && (
            <div className="rounded-3xl border border-dashed border-edge bg-white p-10 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-subtle">
                <Icon name="filter" size={24} />
              </div>
              <p className="text-sm font-bold text-ink">No custom rules configured yet</p>
              <p className="text-xs text-subtle max-w-sm mx-auto">
                The AI will use its standard automated qualification pipeline. Add a custom rule to route specific requests to specialized agent desks.
              </p>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <RuleEditor
          rule={editing}
          regions={regions}
          agents={agents}
          onCancel={() => setEditing(null)}
          onSave={async (r) => {
            const ok = r.id
              ? await send("PATCH", { ...r, id: r.id })
              : await send("POST", r);
            if (ok) setEditing(null);
          }}
        />
      )}
      {dialog}
    </div>
  );
}

function RuleCard({ rule, index, regions, agents, onEdit, onToggle, onDelete }: {
  rule: Rule & { match_count?: number; last_matched_at?: string | null };
  index: number;
  regions: Named[]; agents: Named[];
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const target =
    rule.action?.type === "assign_agent"
      ? agents.find((a) => a.id === rule.action.agent_id)?.full_name
      : rule.action?.type === "assign_region"
        ? regions.find((r) => r.id === rule.action.region_id)?.name
        : null;

  return (
    <div className={`rounded-2xl border border-edge/80 bg-white p-5 shadow-xs transition-all ${rule.is_active ? "" : "opacity-60 bg-surface/50"}`}>
      <div className="flex items-start gap-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-chalk text-xs font-bold text-muted">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-ink">{rule.name}</span>
            {!rule.is_active && (
              <span className="rounded-md bg-chalk px-2 py-0.5 text-[10px] font-bold text-muted">
                Disabled
              </span>
            )}
            {rule.match_count ? (
              <span className="rounded-md bg-wa-soft px-2 py-0.5 text-[10px] font-bold text-wa-dark ring-1 ring-wa-dark/20">
                Matched {rule.match_count}×
              </span>
            ) : (
              <span className="rounded-md bg-chalk px-2 py-0.5 text-[10px] font-semibold text-subtle">
                Never matched
              </span>
            )}
          </div>

          <div className="mt-2.5 space-y-1.5 text-xs rounded-xl bg-surface/70 border border-edge p-3">
            <p className="text-muted">
              <span className="font-bold text-brand mr-1.5 uppercase text-[10px] tracking-wider">IF</span>
              {(rule.conditions ?? []).map((c, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="font-bold text-subtle mx-1.5">
                      {rule.match_type === "any" ? "OR" : "AND"}
                    </span>
                  )}
                  <span className="font-semibold text-ink">{FIELD_LABEL[c.field] ?? c.field}</span>{" "}
                  <span className="text-muted">{OPERATOR_LABEL[c.op] ?? c.op}</span>
                  {!NO_VALUE.includes(c.op) && <span className="font-bold text-ink ml-1">“{c.value}”</span>}
                </span>
              ))}
            </p>
            <p className="text-muted">
              <span className="font-bold text-wa-dark mr-1.5 uppercase text-[10px] tracking-wider">THEN</span>
              <span className="font-bold text-ink">{ACTION_LABEL[rule.action?.type] ?? "—"}</span>
              {target && <span className="text-muted"> · <strong className="text-ink">{target}</strong></span>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            title={rule.is_active ? "Switch off" : "Switch on"}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              rule.is_active ? "bg-wa" : "bg-edge-strong"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                rule.is_active ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between border-t border-edge pt-2.5 text-xs font-semibold">
        <button onClick={onEdit} className="text-brand hover:text-brand-dark transition">Edit rule…</button>
        <button onClick={onDelete} className="text-danger hover:text-danger-dark transition">Delete</button>
      </div>
    </div>
  );
}

function RuleEditor({ rule, regions, agents, onCancel, onSave }: {
  rule: Partial<Rule>;
  regions: Named[]; agents: Named[];
  onCancel: () => void;
  onSave: (r: Partial<Rule>) => void;
}) {
  const [draft, setDraft] = useState<Partial<Rule>>({
    ...rule,
    conditions: rule.conditions?.length ? rule.conditions : [{ field: "intent", op: "is", value: "" }],
  });

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const conditions = draft.conditions ?? [];

  const setCondition = (i: number, patch: Partial<Condition>) =>
    set("conditions", conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const actionType = draft.action?.type ?? "handoff";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="panel flex max-h-[88vh] w-full max-w-2xl animate-rise-in flex-col p-0">
        <header className="flex items-center gap-3 border-b border-edge px-5 py-4">
          <h2 className="text-h3 text-ink">{rule.id ? "Edit rule" : "New rule"}</h2>
          <button onClick={onCancel} className="btn-ghost ml-auto rounded-full p-1.5">
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <label className="block">
            <span className="mb-1 block text-meta font-medium text-ink">Rule name</span>
            <input
              autoFocus
              value={draft.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Big enquiries go to Ahmed"
              className="field w-full rounded-lg py-2.5 text-meta"
            />
          </label>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-caption font-semibold uppercase tracking-wide text-brand-dark">If</span>
              <select
                value={draft.match_type ?? "all"}
                onChange={(e) => set("match_type", e.target.value as "all" | "any")}
                className="field w-auto rounded-lg py-1 text-caption"
              >
                <option value="all">all of these are true</option>
                <option value="any">any of these are true</option>
              </select>
            </div>

            <div className="space-y-2">
              {conditions.map((c, i) => {
                const options = SUGGESTIONS[c.field];
                const needsValue = !NO_VALUE.includes(c.op);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-edge bg-surface p-2">
                    <select
                      value={c.field}
                      onChange={(e) => setCondition(i, { field: e.target.value as Field, value: "" })}
                      className="field w-auto min-w-36 flex-1 rounded-lg py-1.5 text-caption"
                    >
                      {FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                    </select>
                    <select
                      value={c.op}
                      onChange={(e) => setCondition(i, { op: e.target.value as Operator })}
                      className="field w-auto rounded-lg py-1.5 text-caption"
                    >
                      {OPERATORS.map((o) => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
                    </select>
                    {needsValue && (
                      options ? (
                        <select
                          value={c.value ?? ""}
                          onChange={(e) => setCondition(i, { value: e.target.value })}
                          className="field w-auto min-w-32 flex-1 rounded-lg py-1.5 text-caption"
                        >
                          <option value="">choose…</option>
                          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input
                          value={c.value ?? ""}
                          onChange={(e) => setCondition(i, { value: e.target.value })}
                          placeholder="value"
                          className="field w-auto min-w-32 flex-1 rounded-lg py-1.5 text-caption"
                        />
                      )
                    )}
                    {conditions.length > 1 && (
                      <button
                        onClick={() => set("conditions", conditions.filter((_, idx) => idx !== i))}
                        className="btn-ghost rounded-full p-1" title="Remove condition"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => set("conditions", [...conditions, { field: "message", op: "contains", value: "" }])}
              className="mt-2 flex items-center gap-1 text-caption font-medium text-brand hover:underline"
            >
              <Icon name="plus" size={12} />Add condition
            </button>
          </div>

          <div>
            <span className="mb-2 block text-caption font-semibold uppercase tracking-wide text-wa-dark">Then</span>
            <div className="space-y-2">
              <select
                value={actionType}
                onChange={(e) => set("action", { type: e.target.value as ActionType })}
                className="field w-full rounded-lg py-2.5 text-meta"
              >
                {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
              </select>

              {actionType === "assign_agent" && (
                <select
                  value={draft.action?.agent_id ?? ""}
                  onChange={(e) => set("action", { ...draft.action!, agent_id: e.target.value })}
                  className="field w-full rounded-lg py-2.5 text-meta"
                >
                  <option value="">Choose a person…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              )}

              {actionType === "assign_region" && (
                <select
                  value={draft.action?.region_id ?? ""}
                  onChange={(e) => set("action", { ...draft.action!, region_id: e.target.value })}
                  className="field w-full rounded-lg py-2.5 text-meta"
                >
                  <option value="">Choose a desk…</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}

              {(actionType === "reply" || actionType === "handoff") && (
                <textarea
                  rows={3}
                  value={draft.action?.message ?? ""}
                  onChange={(e) => set("action", { ...draft.action!, message: e.target.value })}
                  placeholder={actionType === "reply"
                    ? "The exact message to send"
                    : "Optional message before handing over — leave empty for the default"}
                  className="field w-full resize-none rounded-lg py-2.5 text-meta"
                />
              )}

              {actionType === "tag" && (
                <>
                  <input
                    value={draft.action?.tag ?? ""}
                    onChange={(e) => set("action", { ...draft.action!, tag: e.target.value })}
                    placeholder="Note to add, e.g. VIP enquiry"
                    className="field w-full rounded-lg py-2.5 text-meta"
                  />
                  <label className="flex items-center gap-2 text-caption text-muted">
                    <input
                      type="checkbox"
                      checked={draft.continue_on_match ?? true}
                      onChange={(e) => set("continue_on_match", e.target.checked)}
                    />
                    Carry on to the next rule after tagging
                  </label>
                </>
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-meta font-medium text-ink">Priority</span>
            <input
              type="number" min={1} max={999}
              value={draft.priority ?? 100}
              onChange={(e) => set("priority", Number(e.target.value))}
              className="field w-28 rounded-lg py-2 text-meta"
            />
            <span className="mt-1 block text-caption text-subtle">
              Lower runs first. The first rule that matches wins.
            </span>
          </label>
        </div>

        <footer className="flex items-center gap-2 border-t border-edge px-5 py-4">
          <button onClick={onCancel} className="btn-ghost ml-auto rounded-lg px-4 py-2 text-meta">Cancel</button>
          <button
            disabled={!draft.name?.trim()}
            onClick={() => onSave(draft)}
            className="btn-primary rounded-lg px-5 py-2 text-meta disabled:opacity-40"
          >
            {rule.id ? "Save rule" : "Create rule"}
          </button>
        </footer>
      </div>
    </div>
  );
}

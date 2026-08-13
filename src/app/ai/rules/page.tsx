"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
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
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/ai/workflow" className="btn-ghost rounded-full p-1.5" title="Back to workflow">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-h1 text-ink">Rules</h1>
        <Chip tone="neutral">{rules.filter((r) => r.is_active).length} active</Chip>
        <button
          onClick={() => setEditing({ name: "", match_type: "all", priority: 100, conditions: [], action: { type: "handoff" } })}
          className="btn-primary ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-meta"
        >
          <Icon name="plus" size={14} />Add rule
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px shrink-0" />{error}
            </p>
          )}

          <p className="rounded-lg border border-edge bg-card p-3 text-caption leading-relaxed text-muted">
            Rules run on every message, in order, straight after the AI works out what the
            customer wants — so you can test what they <em>meant</em> (&ldquo;wants a human&rdquo;,
            &ldquo;budget over 50,000&rdquo;), not just what they typed. The first rule that
            matches wins and the rest are skipped.
          </p>

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

          {rules.length === 0 && (
            <div className="rounded-lg border border-dashed border-edge p-6 text-center">
              <p className="text-meta text-muted">No rules yet — the AI uses its built-in flow.</p>
              <p className="mt-1 text-caption text-subtle">
                Add one to override it for specific cases, like sending big enquiries
                straight to your best closer.
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
    <div className={`panel p-4 ${rule.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface text-caption font-semibold text-muted">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">{rule.name}</span>
            {!rule.is_active && <Chip tone="neutral">Off</Chip>}
            {rule.match_count ? <Chip tone="wa">matched {rule.match_count}×</Chip> : <Chip tone="neutral">never matched</Chip>}
          </div>

          {/* The rule in words. A list of {field, op, value} objects is data;
              this is the thing an operator can actually check for correctness. */}
          <div className="mt-2 space-y-1 text-meta">
            <p className="text-muted">
              <span className="font-semibold text-brand-dark">IF</span>{" "}
              {(rule.conditions ?? []).map((c, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="font-medium text-subtle">
                      {" "}{rule.match_type === "any" ? "OR" : "AND"}{" "}
                    </span>
                  )}
                  <span className="text-ink">{FIELD_LABEL[c.field] ?? c.field}</span>{" "}
                  {OPERATOR_LABEL[c.op] ?? c.op}
                  {!NO_VALUE.includes(c.op) && <span className="font-medium text-ink"> {c.value}</span>}
                </span>
              ))}
            </p>
            <p className="text-muted">
              <span className="font-semibold text-wa-dark">THEN</span>{" "}
              <span className="text-ink">{ACTION_LABEL[rule.action?.type] ?? "—"}</span>
              {target && <span className="text-ink"> · {target}</span>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onToggle}
            title={rule.is_active ? "Switch off" : "Switch on"}
            className={`relative h-5 w-9 rounded-full transition-colors duration-200 ease-swift ${
              rule.is_active ? "bg-wa" : "bg-edge-strong"
            }`}>
            <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-card transition-all duration-200 ease-swift"
              style={{ left: rule.is_active ? 18 : 2 }} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-3 border-t border-edge pt-2 text-caption font-medium">
        <button onClick={onEdit} className="text-brand hover:underline">Edit</button>
        <button onClick={onDelete} className="ml-auto text-danger hover:underline">Delete</button>
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

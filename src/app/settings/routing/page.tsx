"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { CODE_SUGGESTIONS } from "@/lib/phone";

import SettingsNav from "@/components/settings/SettingsNav";

interface Region {
  id: string; name: string; country_codes: string[]; is_default: boolean; is_active: boolean;
}
interface Agent {
  id: string; full_name: string | null; role: string; presence: string;
  is_online: boolean; open_chats: number; max_open_chats: number;
}
interface Coverage { profile_id: string; region_id: string }
interface RoutingSettings {
  auto_assign_enabled: boolean;
  assign_outside_region: boolean;
  presence_timeout_seconds: number;
  fallback_message_en: string | null;
  fallback_message_ar: string | null;
}

/**
 * Settings → Routing. Which desk covers which customers, who is on it, and what
 * the customer is told when nobody is.
 */
export default function RoutingPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [settings, setSettings] = useState<RoutingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/routing");
    if (!res.ok) return setError("Could not load routing");
    const j = await res.json();
    setRegions(j.regions); setAgents(j.agents); setCoverage(j.coverage);
    setSettings(j.settings ?? {
      auto_assign_enabled: true, assign_outside_region: true,
      presence_timeout_seconds: 120, fallback_message_en: null, fallback_message_ar: null,
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Presence changes without any action on this page, so it re-reads on a slow
  // interval — a stale "3 online" while nobody is there misleads exactly the
  // person who is deciding whether the rules work.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function send(method: string, body: unknown, url = "/api/settings/routing") {
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

  const covered = (agentId: string, regionId: string) =>
    coverage.some((c) => c.profile_id === agentId && c.region_id === regionId);

  const online = agents.filter((a) => a.is_online).length;

  return (
    <div className="flex h-full bg-[#F8FAFC]">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Routing & Coverage Desks</h1>
            <p className="text-xs text-slate-400">Dialing code regions, auto-assignment rules, and active agent availability</p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${
                online > 0
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${online > 0 ? "bg-emerald-500" : "bg-slate-400"}`} />
              {online} of {agents.length} agents online
            </span>
            <Link
              href="/ai/workflow?from=/settings/routing"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              View in Workflow →
            </Link>
          </div>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-[#F8FAFC]">
          <div className="max-w-5xl mx-auto space-y-6">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px shrink-0" />{error}
            </p>
          )}

          {settings && (
            <section className="panel space-y-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-h3 text-ink">Assign chats automatically</h2>
                  <p className="mt-0.5 text-caption text-muted">
                    When the AI hands a conversation over, give it to an available agent
                    straight away instead of leaving it in the unassigned queue.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.auto_assign_enabled}
                  onChange={(e) =>
                    send("PATCH", { action: "settings", settings: { ...settings, auto_assign_enabled: e.target.checked } })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4 border-t border-edge pt-4">
                <div>
                  <h3 className="text-meta font-semibold text-ink">Allow assignment outside the region</h3>
                  <p className="mt-0.5 text-caption text-muted">
                    If nobody on the customer&rsquo;s own desk is free, hand the chat to any
                    available agent. Turn this off when regions map to languages other desks
                    don&rsquo;t speak.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.assign_outside_region}
                  onChange={(e) =>
                    send("PATCH", { action: "settings", settings: { ...settings, assign_outside_region: e.target.checked } })
                  }
                />
              </div>

              <label className="block border-t border-edge pt-4">
                <span className="mb-1 block text-meta font-medium text-ink">
                  Treat an agent as offline after (seconds)
                </span>
                <input
                  type="number" min={30} max={3600}
                  className="field w-32 rounded-lg py-2 text-meta"
                  defaultValue={settings.presence_timeout_seconds}
                  onBlur={(e) =>
                    send("PATCH", { action: "settings", settings: { ...settings, presence_timeout_seconds: Number(e.target.value) } })
                  }
                />
                <span className="mt-1 block text-caption text-subtle">
                  The CRM sends a heartbeat every 60 seconds. Below 120 a single missed
                  beat marks someone offline.
                </span>
              </label>

              <div className="grid gap-3 border-t border-edge pt-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-meta font-medium text-ink">
                    Fallback message (English)
                  </span>
                  <textarea
                    rows={3}
                    className="field resize-none rounded-lg py-2 text-meta"
                    placeholder="Leave empty for the built-in wording"
                    defaultValue={settings.fallback_message_en ?? ""}
                    onBlur={(e) =>
                      send("PATCH", { action: "settings", settings: { ...settings, fallback_message_en: e.target.value } })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-meta font-medium text-ink">
                    Fallback message (Arabic)
                  </span>
                  <textarea
                    rows={3} dir="rtl"
                    className="field resize-none rounded-lg py-2 text-meta"
                    placeholder="اتركه فارغاً للنص الافتراضي"
                    defaultValue={settings.fallback_message_ar ?? ""}
                    onBlur={(e) =>
                      send("PATCH", { action: "settings", settings: { ...settings, fallback_message_ar: e.target.value } })
                    }
                  />
                </label>
              </div>
              <p className="text-caption text-subtle">
                Sent when a handoff finds nobody available. The built-in text promises
                follow-up without promising speed — which is the only thing that&rsquo;s true
                in every case.
              </p>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-h3 text-ink">Regions</h2>
              <p className="text-caption text-muted">Matched on the customer&rsquo;s dialling code.</p>
              <button onClick={() => setAdding((v) => !v)}
                className="btn-primary ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption">
                <Icon name="plus" size={13} />Add region
              </button>
            </div>

            {adding && (
              <RegionForm
                onCancel={() => setAdding(false)}
                onSave={async (r) => { if (await send("POST", r)) setAdding(false); }}
              />
            )}

            {regions.map((r) => (
              <RegionCard
                key={r.id}
                region={r}
                agents={agents}
                isCovered={(a) => covered(a, r.id)}
                onToggleAgent={(profile_id, next) =>
                  send("PATCH", { action: "coverage", profile_id, region_id: r.id, covered: next })
                }
                onUpdate={(patch) => send("PATCH", { action: "region", id: r.id, ...patch })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete “${r.name}”?`,
                    body: "Customers from these dialling codes will fall through to the default region.",
                    confirmLabel: "Delete region",
                    tone: "danger",
                  });
                  if (ok) send("DELETE", null, `/api/settings/routing?id=${r.id}`);
                }}
              />
            ))}
          </section>

          <section className="panel p-5">
            <h2 className="text-h3 text-ink">Capacity</h2>
            <p className="mt-0.5 text-caption text-muted">
              The router skips an agent already at their limit, so the fastest responder
              doesn&rsquo;t silently absorb the whole queue.
            </p>
            <table className="mt-3 w-full text-caption">
              <thead className="text-subtle">
                <tr className="text-left">
                  <th className="font-normal">Agent</th>
                  <th className="font-normal">Status</th>
                  <th className="text-right font-normal">Open</th>
                  <th className="text-right font-normal">Max</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-t border-edge/60">
                    <td className="py-2 font-medium text-ink">{a.full_name ?? "Unnamed"}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${a.is_online ? "bg-wa" : "bg-subtle"}`} />
                        <span className={a.is_online ? "text-wa-dark" : "text-muted"}>
                          {a.is_online ? "Online" : a.presence === "away" ? "Away" : "Offline"}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{a.open_chats}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number" min={1} max={500}
                        className="field w-20 rounded-lg py-1 text-right text-caption"
                        defaultValue={a.max_open_chats}
                        onBlur={(e) =>
                          send("PATCH", { action: "capacity", profile_id: a.id, max_open_chats: Number(e.target.value) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
      {dialog}
    </div>
  </div>
  );
}

function RegionCard({ region, agents, isCovered, onToggleAgent, onUpdate, onDelete }: {
  region: Region;
  agents: Agent[];
  isCovered: (agentId: string) => boolean;
  onToggleAgent: (agentId: string, next: boolean) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const onlineHere = agents.filter((a) => isCovered(a.id) && a.is_online).length;
  const assigned = agents.filter((a) => isCovered(a.id)).length;

  return (
    <div className="panel p-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <Icon name="chevronDown" size={15}
          className={`text-subtle transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
            {region.name}
            {region.is_default && <Chip tone="brand">Default</Chip>}
            <Chip tone={onlineHere > 0 ? "wa" : "neutral"}>{onlineHere} online</Chip>
          </span>
          <span className="mt-0.5 block text-caption text-muted">
            {region.country_codes.length
              ? region.country_codes.map((c) => `+${c}`).join(", ")
              : region.is_default ? "Catches everything no other region matches" : "No dialling codes yet — matches nobody"}
            {" · "}{assigned} agent{assigned === 1 ? "" : "s"}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-edge p-4">
          <CodeEditor
            codes={region.country_codes}
            onChange={(country_codes) => onUpdate({ country_codes })}
          />

          <div>
            <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-subtle">
              Who covers this region
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => {
                const on = isCovered(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => onToggleAgent(a.id, !on)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-all duration-150 ease-swift ${
                      on ? "border-brand/30 bg-brand-soft text-brand-dark" : "border-edge bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${a.is_online ? "bg-wa" : "bg-subtle"}`} />
                    {a.full_name ?? "Unnamed"}
                    {on && <Icon name="check" size={11} />}
                  </button>
                );
              })}
              {agents.length === 0 && (
                <p className="text-caption text-subtle">No team members yet.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-edge pt-3">
            {!region.is_default && (
              <button onClick={() => onUpdate({ is_default: true })}
                className="text-caption font-medium text-muted hover:text-ink">
                Make default
              </button>
            )}
            {!region.is_default && (
              <button onClick={onDelete} className="ml-auto text-caption font-medium text-danger hover:underline">
                Delete region
              </button>
            )}
            {region.is_default && (
              <p className="text-caption text-subtle">
                The default region can&rsquo;t be deleted — it&rsquo;s what catches unmatched customers.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Dialling codes as removable chips, with the common markets one click away. */
function CodeEditor({ codes, onChange }: { codes: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const code = raw.replace(/\D/g, "");
    if (!code || codes.includes(code)) return;
    onChange([...codes, code]);
    setDraft("");
  };

  return (
    <div>
      <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-subtle">
        Dialling codes
      </h4>
      <div className="flex flex-wrap items-center gap-1.5">
        {codes.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full border border-edge bg-surface px-2.5 py-1 text-caption text-ink">
            +{c}
            <button onClick={() => onChange(codes.filter((x) => x !== c))}
              className="text-subtle hover:text-danger" title="Remove">
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
          onBlur={() => draft && add(draft)}
          placeholder="+92"
          className="field w-20 rounded-full py-1 text-center text-caption"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {CODE_SUGGESTIONS.filter((s) => !codes.includes(s.code)).slice(0, 10).map((s) => (
          <button key={s.code} onClick={() => add(s.code)}
            className="rounded-full border border-dashed border-edge px-2 py-0.5 text-caption text-subtle hover:border-brand/40 hover:text-brand">
            + {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RegionForm({ onSave, onCancel }: {
  onSave: (r: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  return (
    <div className="panel space-y-3 p-4">
      <input
        autoFocus
        placeholder="Region name, e.g. Pakistan desk"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field w-full rounded-lg py-2 text-meta"
      />
      <CodeEditor codes={codes} onChange={setCodes} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost rounded-lg px-4 py-2 text-meta">Cancel</button>
        <button
          disabled={!name.trim()}
          onClick={() => onSave({ name, country_codes: codes })}
          className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
        >
          Add region
        </button>
      </div>
    </div>
  );
}

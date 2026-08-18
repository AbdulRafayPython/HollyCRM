"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import Chip from "@/components/ui/Chip";

type Dimension = "destination" | "supplier" | "client";

interface Target { id: string; name: string; kind?: string; country?: string | null; is_active?: boolean }
interface Agent { id: string; full_name: string | null; role: string; is_active: boolean }
interface CoverageRow { profile_id: string; [key: string]: string }

interface Payload {
  destinations: Target[];
  suppliers: Target[];
  clients: Target[];
  agents: Agent[];
  coverage: Record<Dimension, CoverageRow[]>;
  enforce_region_scope: boolean;
}

const FK: Record<Dimension, string> = {
  destination: "destination_id",
  supplier: "supplier_id",
  client: "client_id",
};

const TAB: { key: Dimension; label: string; blurb: string }[] = [
  {
    key: "destination",
    label: "Destinations",
    blurb:
      "Which markets this person sells. Also filters the hotel inventory they can read.",
  },
  {
    key: "supplier",
    label: "Suppliers",
    blurb:
      "Which contracts are theirs. Inventory only — a conversation is not supplied by anybody.",
  },
  {
    key: "client",
    label: "Clients",
    blurb:
      "Which accounts are theirs. Conversations only — a hotel has no client.",
  },
];

/**
 * Settings → Routing → Coverage.
 *
 * The screen the 0033 boundary was missing. Without it coverage is assignable
 * only by hand-written SQL, which means in practice it is never assigned and the
 * whole scoping model stays theoretical.
 *
 * The one thing this UI has to communicate, and the reason for the banner and
 * the "Everything" chip: NO rows in a dimension means unrestricted, not blind.
 * An operator who reads an empty row as "sees nothing" will clear somebody's
 * coverage in order to lock them down and quietly hand them the whole workspace.
 */
export default function CoveragePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Dimension>("destination");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/coverage");
    if (!res.ok) {
      setError("Could not load coverage.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const targets: Target[] =
    data === null
      ? []
      : tab === "destination"
        ? data.destinations
        : tab === "supplier"
          ? data.suppliers
          : data.clients;

  const covers = (agentId: string, targetId: string) =>
    (data?.coverage[tab] ?? []).some(
      (r) => r.profile_id === agentId && r[FK[tab]] === targetId,
    );

  const coveredCount = (agentId: string) =>
    (data?.coverage[tab] ?? []).filter((r) => r.profile_id === agentId).length;

  async function toggle(agentId: string, targetId: string, covered: boolean) {
    setBusy(`${agentId}:${targetId}`);
    setError(null);
    const res = await fetch("/api/settings/coverage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "coverage",
        dimension: tab,
        profile_id: agentId,
        target_id: targetId,
        covered,
      }),
    });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Failed.");
    await load();
    setBusy(null);
  }

  async function addTarget() {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    setError(null);
    const res = await fetch("/api/settings/coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimension: tab, name }),
    });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Failed.");
    setNewName("");
    await load();
    setBusy(null);
  }

  async function toggleRegionScope(enabled: boolean) {
    setBusy("region_scope");
    setError(null);
    const res = await fetch("/api/settings/coverage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "region_scope", enabled }),
    });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Failed.");
    await load();
    setBusy(null);
  }

  if (!data) {
    return (
      <section className="panel p-5">
        <p className="text-caption text-muted">Loading coverage…</p>
      </section>
    );
  }

  return (
    <section className="panel space-y-5 p-5">
      <div>
        <h2 className="text-h3 text-ink">Coverage</h2>
        <p className="mt-0.5 text-caption text-muted">
          What each person can see. Applies to the unassigned queue and to the
          inventory — a conversation already assigned to somebody stays visible to
          them whatever their coverage says.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-edge bg-chalk p-3 text-caption text-ink-soft">
        <Icon name="alert" size={15} className="mt-px shrink-0 text-subtle" />
        <span>
          <strong>No boxes ticked means no restriction.</strong> An agent with
          nothing selected here sees every {tab}. Ticking boxes narrows them to
          what is ticked — so clearing a row widens access rather than removing
          it.
        </span>
      </p>

      <div className="flex gap-1 border-b border-edge">
        {TAB.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-meta font-semibold transition ${
              tab === t.key
                ? "border-wa-dark text-ink"
                : "border-transparent text-subtle hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-caption text-muted">
        {TAB.find((t) => t.key === tab)?.blurb}
      </p>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addTarget();
          }}
          placeholder={`Add a ${tab}…`}
          className="field flex-1 rounded-lg py-2 text-meta"
        />
        <button
          onClick={() => void addTarget()}
          disabled={!newName.trim() || busy === "new"}
          className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge p-6 text-center text-caption text-muted">
          No {tab}s yet. Add one above, then tick who covers it.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-meta">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="py-2 pr-4 font-semibold text-subtle">Agent</th>
                {targets.map((t) => (
                  <th key={t.id} className="px-3 py-2 font-semibold text-ink">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => {
                const n = coveredCount(a.id);
                return (
                  <tr key={a.id} className="border-b border-edge/60">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{a.full_name ?? "Unnamed"}</span>
                        {n === 0 ? (
                          <Chip tone="neutral">Everything</Chip>
                        ) : (
                          <Chip tone="brand">{n} of {targets.length}</Chip>
                        )}
                      </div>
                    </td>
                    {targets.map((t) => {
                      const on = covers(a.id, t.id);
                      return (
                        <td key={t.id} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy === `${a.id}:${t.id}`}
                            onChange={(e) => void toggle(a.id, t.id, e.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-wa-dark"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-lg border border-edge p-4">
        <div>
          <h3 className="text-meta font-semibold text-ink">
            Also restrict by customer country
          </h3>
          <p className="mt-0.5 text-caption text-muted">
            Reuses the desks above. Off by default because those region
            assignments were made to route handovers, not to hide conversations —
            switching this on applies them retroactively and can empty an inbox.
          </p>
        </div>
        <input
          type="checkbox"
          checked={data.enforce_region_scope}
          disabled={busy === "region_scope"}
          onChange={(e) => void toggleRegionScope(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-wa-dark"
        />
      </div>
    </section>
  );
}

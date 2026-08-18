"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Permission {
  key: string; label: string; description: string; category: string; sort_order: number;
}
interface Role {
  id: string; name: string; description: string | null;
  is_system: boolean; legacy_role: string;
}
interface Grant { role_id: string; permission: string }
interface Member { id: string; full_name: string | null; role: string; role_id: string | null }

interface Payload {
  permissions: Permission[];
  roles: Role[];
  grants: Grant[];
  members: Member[];
  can_manage: boolean;
}

/**
 * Settings → Roles & permissions.
 *
 * Master/detail rather than one wide grid of every role × every permission.
 * That grid is the obvious design and it stops being readable at four roles —
 * and the whole reason this feature exists is that workspaces will have more
 * than four. One role at a time also makes the destructive moment small: you
 * are looking at exactly the role you are changing.
 *
 * Two things this screen must communicate that the data does not say on its own:
 * that Owner is deliberately uneditable rather than broken, and that deleting a
 * role does not remove anybody's access — it drops them back to their old tier.
 */
export default function RolesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/roles");
    if (!res.ok) return setError("Could not load roles.");
    const j = (await res.json()) as Payload;
    setData(j);
    setSelected((prev) => prev ?? j.roles.find((r) => !r.is_system)?.id ?? j.roles[0]?.id ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = data?.roles.find((r) => r.id === selected) ?? null;
  const readOnly = !data?.can_manage || (role?.is_system ?? false);

  const grantedKeys = useMemo(
    () => new Set((data?.grants ?? []).filter((g) => g.role_id === selected).map((g) => g.permission)),
    [data, selected],
  );

  const categories = useMemo(() => {
    const out: { name: string; items: Permission[] }[] = [];
    for (const p of data?.permissions ?? []) {
      const bucket = out.find((c) => c.name === p.category);
      if (bucket) bucket.items.push(p);
      else out.push({ name: p.category, items: [p] });
    }
    return out;
  }, [data]);

  const holders = (roleId: string) =>
    (data?.members ?? []).filter((m) => m.role_id === roleId).length;

  const grantCount = (roleId: string) =>
    (data?.grants ?? []).filter((g) => g.role_id === roleId).length;

  async function call(body: Record<string, unknown>, method: "POST" | "PATCH" = "PATCH") {
    setError(null);
    const res = await fetch("/api/settings/roles", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed.");
      return false;
    }
    await load();
    return true;
  }

  async function toggle(permission: string, granted: boolean) {
    setBusy(permission);
    await call({ action: "grant", role_id: selected, permission, granted });
    setBusy(null);
  }

  async function createRole() {
    if (!draft.name.trim()) return;
    setBusy("create");
    const res = await fetch("/api/settings/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!res.ok) setError(j.error ?? "Could not create the role.");
    else {
      await load();
      if (j.id) setSelected(j.id);
      setCreating(false);
      setDraft({ name: "", description: "" });
    }
    setBusy(null);
  }

  async function removeRole(r: Role) {
    const n = holders(r.id);
    const ok = await confirm({
      title: `Delete “${r.name}”?`,
      body: n === 0
        ? "No one holds this role, so nothing changes for your team."
        : `${n} ${n === 1 ? "person" : "people"} hold this role. They keep their access — ` +
          "they fall back to their previous level until you give them a new role.",
      confirmLabel: "Delete role",
      tone: "danger",
    });
    if (!ok) return;

    setBusy("delete");
    const res = await fetch(`/api/settings/roles?id=${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed.");
    } else {
      setSelected(null);
      await load();
    }
    setBusy(null);
  }

  if (!data) {
    return (
      <section className="panel p-5">
        <p className="text-caption text-muted">Loading roles…</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {!data.can_manage && (
        <p className="flex items-start gap-2 rounded-lg border border-edge bg-chalk p-3 text-caption text-ink-soft">
          <Icon name="lock" size={15} className="mt-px shrink-0 text-subtle" />
          You can see how this workspace is organised, but only someone with
          “Manage people” can change it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* ---------------------------------------------------------------- */}
        {/* Roles */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-2">
          {data.roles.map((r) => {
            const active = r.id === selected;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-brand bg-brand-soft"
                    : "border-edge bg-white hover:border-edge-strong"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-meta font-semibold text-ink">{r.name}</span>
                  {r.is_system && <Icon name="lock" size={13} className="shrink-0 text-subtle" />}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-caption text-muted">
                  {r.is_system ? "All permissions" : `${grantCount(r.id)} of ${data.permissions.length}`}
                  <span aria-hidden>·</span>
                  {holders(r.id)} {holders(r.id) === 1 ? "person" : "people"}
                </span>
              </button>
            );
          })}

          {data.can_manage && !creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-edge-strong p-3 text-meta font-semibold text-ink-soft hover:bg-surface"
            >
              <Icon name="plus" size={14} /> New role
            </button>
          )}

          {creating && (
            <div className="space-y-2 rounded-xl border border-edge bg-white p-3">
              <input
                autoFocus
                placeholder="Role name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void createRole(); }}
                className="field w-full rounded-lg py-2 text-meta"
              />
              <input
                placeholder="What is it for? (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="field w-full rounded-lg py-2 text-meta"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setCreating(false); setDraft({ name: "", description: "" }); }}
                  className="btn-ghost rounded-lg px-3 py-1.5 text-meta"
                >
                  Cancel
                </button>
                <button
                  disabled={!draft.name.trim() || busy === "create"}
                  onClick={() => void createRole()}
                  className="btn-primary rounded-lg px-3 py-1.5 text-meta disabled:opacity-40"
                >
                  Create
                </button>
              </div>
              <p className="text-caption text-subtle">
                It starts with nothing switched on. Tick what it should be able to do.
              </p>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Permissions for the selected role */}
        {/* ---------------------------------------------------------------- */}
        {role ? (
          <div className="panel space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-h3 text-ink">
                  {role.name}
                  {role.is_system && <Chip tone="brand">Built in</Chip>}
                </h3>
                {role.description && (
                  <p className="mt-1 text-caption text-muted">{role.description}</p>
                )}
              </div>

              {data.can_manage && !role.is_system && (
                <button
                  onClick={() => void removeRole(role)}
                  disabled={busy === "delete"}
                  className="shrink-0 rounded-lg border border-danger/30 px-3 py-1.5 text-caption font-semibold text-danger hover:bg-danger-soft disabled:opacity-40"
                >
                  Delete
                </button>
              )}
            </div>

            {role.is_system && (
              <p className="flex items-start gap-2 rounded-lg border border-edge bg-chalk p-3 text-caption text-ink-soft">
                <Icon name="lock" size={15} className="mt-px shrink-0 text-subtle" />
                <span>
                  The Owner role always has every permission, including ones added
                  in future updates, and cannot be edited or deleted. That is what
                  guarantees somebody can always get back into this workspace.
                </span>
              </p>
            )}

            {categories.map((cat) => (
              <div key={cat.name} className="space-y-2">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-subtle">
                  {cat.name}
                </h4>
                <div className="divide-y divide-edge/60 overflow-hidden rounded-lg border border-edge">
                  {cat.items.map((p) => {
                    const on = role.is_system || grantedKeys.has(p.key);
                    const dangerous = p.key === "data.purge" || p.key === "team.manage"
                      || p.key === "credentials.manage";
                    return (
                      <label
                        key={p.key}
                        className={`flex items-start gap-3 p-3 ${
                          readOnly ? "" : "cursor-pointer hover:bg-surface"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={readOnly || busy === p.key}
                          onChange={(e) => void toggle(p.key, e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-wa-dark disabled:opacity-50"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-meta font-medium text-ink">
                            {p.label}
                            {dangerous && <Chip tone="danger">Sensitive</Chip>}
                          </span>
                          <span className="mt-0.5 block text-caption text-muted">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel flex items-center justify-center p-10">
            <p className="text-caption text-muted">Pick a role to see what it can do.</p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Who holds what */}
      {/* ------------------------------------------------------------------ */}
      <div className="panel space-y-3 p-5">
        <div>
          <h3 className="text-h3 text-ink">Who has which role</h3>
          <p className="mt-0.5 text-caption text-muted">
            One role each. Coverage — which destinations and clients a person can
            see — is set separately under Routing &amp; Coverage.
          </p>
        </div>

        <div className="divide-y divide-edge/60 overflow-hidden rounded-lg border border-edge">
          {data.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 truncate text-meta text-ink">
                {m.full_name ?? "Unnamed"}
              </span>
              {data.can_manage ? (
                <select
                  value={m.role_id ?? ""}
                  onChange={(e) => void call({
                    action: "assign", profile_id: m.id, role_id: e.target.value,
                  })}
                  className="field shrink-0 rounded-lg py-1.5 text-meta"
                >
                  {!m.role_id && <option value="">No role</option>}
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <Chip tone="neutral">
                  {data.roles.find((r) => r.id === m.role_id)?.name ?? "No role"}
                </Chip>
              )}
            </div>
          ))}
        </div>
      </div>

      {dialog}
    </section>
  );
}

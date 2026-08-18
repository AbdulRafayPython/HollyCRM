"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "./ui/Avatar";
import Dropdown from "./ui/Dropdown";
import Icon from "./ui/Icon";
import { ROLE_LABELS, type AppRole } from "@/lib/types";

interface Member {
  id: string;
  full_name: string | null;
  role: AppRole;
  role_id: string | null;
  assigned_role: { id: string; name: string } | null;
  is_active: boolean;
  email: string | null;
  is_you: boolean;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  created_at: string;
  expires_at: string;
}

interface TeamData {
  workspace: string | null;
  you: { id: string; role: AppRole; is_owner: boolean };
  members: Member[];
  invitations: Invitation[];
}

export default function TeamPanel() {
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/team", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function linkFor(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } catch {
      setError("Could not reach the clipboard — select the link and copy it manually.");
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFreshLink(null);

    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setBusy(false);

    if (!res?.ok) {
      setError(json?.error ?? "Could not create the invitation.");
      return;
    }
    setEmail("");
    setFreshLink(linkFor(json.invitation.token));
    void copy(json.invitation.token);
    await load();
  }

  async function revoke(id: string) {
    setError(null);
    const res = await fetch(`/api/settings/team/invitations/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not revoke.");
    await load();
  }

  async function patchMember(id: string, patch: { is_active?: boolean; role?: string }) {
    setError(null);
    const res = await fetch(`/api/settings/team/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not update.");
    await load();
  }

  if (!data) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-subtle">
        Loading team workspace…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="flex items-start gap-2 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger" />
          <span>{error}</span>
        </p>
      )}

      {/* Invite Box */}
      {data.you.is_owner && (
        <section className="rounded-3xl border border-edge/80 bg-white p-6 shadow-xs space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Invite a Sales Agent</h2>
            <p className="mt-0.5 text-xs text-muted leading-relaxed">
              Generates an invitation link for <span className="font-semibold text-ink">{data.workspace}</span>. Direct links expire in 7 days and can be shared over WhatsApp.
            </p>
          </div>

          <form onSubmit={invite} className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@company.com"
              className="flex-1 basis-64 rounded-xl border border-edge bg-surface/70 px-3.5 py-2 text-xs text-ink focus:border-brand focus:bg-white focus:outline-none transition"
            />
            <Dropdown
              label="Role"
              value={role}
              onChange={setRole}
              className="rounded-xl border border-edge bg-surface/70 px-3.5 py-2 text-xs font-semibold text-ink hover:border-edge-strong"
              options={[
                { value: "sales_agent", label: "Sales Agent" },
                { value: "owner", label: "Workspace Owner" },
              ]}
            />
            <button
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition disabled:opacity-50"
            >
              {busy ? "Creating…" : "Generate Invite Link"}
            </button>
          </form>

          {freshLink && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-wa-soft bg-wa-soft px-4 py-2.5">
              <Icon name="check" size={16} className="shrink-0 text-wa-dark" />
              <code className="min-w-0 flex-1 truncate text-xs font-mono text-wa-dark">{freshLink}</code>
              <span className="shrink-0 text-[11px] font-bold text-wa-dark">Copied to clipboard ✓</span>
            </div>
          )}
        </section>
      )}

      {/* Active Members Card */}
      <section className="rounded-3xl border border-edge/80 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">
            Active Members ({data.members.filter((m) => m.is_active).length})
          </h2>
        </div>
        <ul className="divide-y divide-edge">
          {data.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3.5 px-6 py-3.5 hover:bg-surface/50 transition"
            >
              <Avatar name={m.full_name} type="agent" size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-ink">{m.full_name ?? "Unnamed Agent"}</span>
                  {m.is_you && (
                    <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand ring-1 ring-brand/20">
                      You
                    </span>
                  )}
                  {!m.is_active && (
                    <span className="rounded-md bg-chalk px-2 py-0.5 text-[10px] font-bold text-muted">
                      Deactivated
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-subtle">{m.email ?? "—"}</p>
              </div>

              {data.you.is_owner && !m.is_you ? (
                /*
                 * Role assignment moved to Settings -> Roles & permissions when
                 * 0034 made a role an editable set of permissions. A two-option
                 * dropdown here could only offer the old rungs, and would have
                 * shown "Sales Agent" for somebody holding a custom role —
                 * silently mis-describing their access, and demoting them if
                 * touched.
                 */
                <Link
                  href="/settings/roles"
                  className="shrink-0 rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-edge-strong"
                >
                  {m.assigned_role?.name ?? ROLE_LABELS[m.role] ?? m.role} · Change
                </Link>
              ) : (
                <span className="rounded-lg bg-chalk px-2.5 py-1 text-xs font-semibold text-ink-soft">
                  {m.assigned_role?.name ?? ROLE_LABELS[m.role] ?? m.role}
                </span>
              )}

              {data.you.is_owner && !m.is_you && (
                <button
                  onClick={() => patchMember(m.id, { is_active: !m.is_active })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    m.is_active
                      ? "text-danger hover:bg-danger-soft"
                      : "text-wa-dark hover:bg-wa-soft"
                  }`}
                  title={m.is_active ? "Deactivate agent" : "Restore access"}
                >
                  {m.is_active ? "Deactivate" : "Restore"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Pending Invitations */}
      {data.you.is_owner && data.invitations.length > 0 && (
        <section className="rounded-3xl border border-edge/80 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-edge px-6 py-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">
              Pending Invitations ({data.invitations.length})
            </h2>
          </div>
          <ul className="divide-y divide-edge">
            {data.invitations.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3.5 px-6 py-3.5 hover:bg-surface/50 transition"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-edge">
                  <Icon name="mail" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink">{i.email}</p>
                  <p className="text-[11px] text-subtle">
                    {ROLE_LABELS[i.role] ?? i.role} · expires {expiry(i.expires_at)}
                  </p>
                </div>
                <button
                  onClick={() => copy(i.token)}
                  className="rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition shadow-2xs"
                >
                  {copied === i.token ? "Copied ✓" : "Copy Link"}
                </button>
                <button
                  onClick={() => revoke(i.id)}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft transition"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.you.is_owner && (
        <p className="text-center text-xs text-subtle">
          Only the workspace owner can invite or adjust agent permissions.
        </p>
      )}
    </div>
  );
}

function expiry(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

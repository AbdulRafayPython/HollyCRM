"use client";

import { useCallback, useEffect, useState } from "react";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import Dropdown from "./ui/Dropdown";
import Icon from "./ui/Icon";
import { ROLE_LABELS, type AppRole } from "@/lib/types";

interface Member {
  id: string;
  full_name: string | null;
  role: AppRole;
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

/**
 * Owner + sales agents for one workspace.
 *
 * Invitations produce a link rather than an email: the workspace runs on
 * Supabase's built-in SMTP, which is rate-limited to a handful of messages an
 * hour and lands in spam, so a link the owner pastes into WhatsApp is the one
 * path that always works. Linear and Notion offer exactly this alongside email.
 */
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
    return <p className="text-body text-muted">Loading team…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-meta text-danger-dark">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {data.you.is_owner && (
        <section className="panel p-5">
          <p className="eyebrow mb-1">Add a sales agent</p>
          <p className="mb-3 text-meta text-muted">
            Creates an invite link. Send it however you like — whoever opens it joins{" "}
            <span className="font-medium text-ink">{data.workspace}</span> and sees only this
            workspace&apos;s conversations. Links are single use and expire in 7 days.
          </p>

          <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@company.com"
              className="field flex-1 basis-56 py-2"
            />
            <Dropdown
              label="Role"
              value={role}
              onChange={setRole}
              className="rounded border border-edge bg-card px-3 py-2 text-body text-ink hover:border-edge-strong"
              options={[
                { value: "sales_agent", label: "Sales agent" },
                { value: "owner", label: "Owner" },
              ]}
            />
            <button disabled={busy} className="btn-primary">
              {busy ? "Creating…" : "Create invite link"}
            </button>
          </form>

          {freshLink && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-wa/25 bg-wa-soft px-3 py-2">
              <Icon name="check" size={14} className="shrink-0 text-wa-dark" />
              <code className="min-w-0 flex-1 truncate text-meta text-wa-dark">{freshLink}</code>
              <span className="shrink-0 text-caption text-wa-dark">copied to clipboard</span>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <p className="eyebrow border-b border-edge px-5 py-3">
          Members · {data.members.filter((m) => m.is_active).length} active
        </p>
        <ul>
          {data.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 border-b border-edge px-5 py-3 last:border-b-0"
            >
              <Avatar name={m.full_name} type="agent" size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium text-ink">
                  <span className="truncate">{m.full_name ?? "Unnamed"}</span>
                  {m.is_you && <Chip tone="brand">You</Chip>}
                  {!m.is_active && <Chip tone="neutral">Deactivated</Chip>}
                </p>
                <p className="truncate text-meta text-muted">{m.email ?? "—"}</p>
              </div>

              {data.you.is_owner && !m.is_you ? (
                <Dropdown
                  label={`Role for ${m.full_name ?? "member"}`}
                  align="right"
                  value={m.role === "owner" || m.role === "super_admin" ? "owner" : "sales_agent"}
                  onChange={(next) => patchMember(m.id, { role: next })}
                  className="rounded-full border border-edge bg-surface px-2.5 py-1 text-caption font-medium text-ink hover:border-edge-strong"
                  options={[
                    { value: "sales_agent", label: "Sales agent" },
                    { value: "owner", label: "Owner" },
                  ]}
                />
              ) : (
                <Chip tone={m.role === "owner" || m.role === "super_admin" ? "bot" : "neutral"}>
                  {ROLE_LABELS[m.role] ?? m.role}
                </Chip>
              )}

              {data.you.is_owner && !m.is_you && (
                <button
                  onClick={() => patchMember(m.id, { is_active: !m.is_active })}
                  className="btn-ghost px-2 py-1 text-caption"
                  title={m.is_active ? "Deactivate — they lose access immediately" : "Restore access"}
                >
                  {m.is_active ? "Deactivate" : "Restore"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {data.you.is_owner && data.invitations.length > 0 && (
        <section className="panel">
          <p className="eyebrow border-b border-edge px-5 py-3">
            Pending invitations · {data.invitations.length}
          </p>
          <ul>
            {data.invitations.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 border-b border-edge px-5 py-3 last:border-b-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-edge">
                  <Icon name="mail" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{i.email}</p>
                  <p className="text-meta text-muted">
                    {ROLE_LABELS[i.role] ?? i.role} · expires {expiry(i.expires_at)}
                  </p>
                </div>
                <button onClick={() => copy(i.token)} className="btn-secondary px-2.5 py-1 text-caption">
                  {copied === i.token ? "Copied" : "Copy link"}
                </button>
                <button
                  onClick={() => revoke(i.id)}
                  className="btn-ghost px-2 py-1 text-caption text-danger hover:bg-danger-soft"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data.you.is_owner && (
        <p className="text-meta text-muted">
          Only the workspace owner can invite or remove people.
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

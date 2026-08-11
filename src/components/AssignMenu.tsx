"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./ui/Avatar";
import Dropdown from "./ui/Dropdown";

export interface AgentOption {
  id: string;
  full_name: string | null;
  role: string;
}

/**
 * Claim / release / reassign. The server function decides what's permitted —
 * an agent may claim an unassigned chat and release their own; only supervisors
 * may hand a chat to someone else. Errors surface verbatim.
 */
export default function AssignMenu({
  chatId,
  assignedTo,
  currentUserId,
  agents,
  isSupervisor,
}: {
  chatId: string;
  assignedTo: string | null;
  currentUserId: string;
  agents: AgentOption[];
  isSupervisor: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(agentId: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/chats/${chatId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  const mine = assignedTo === currentUserId;
  const owner = agents.find((a) => a.id === assignedTo);

  return (
    <div className="flex items-center gap-2">
      {isSupervisor ? (
        <Dropdown
          label="Assigned agent"
          value={assignedTo ?? ""}
          disabled={busy}
          onChange={(id) => assign(id || null)}
          className="rounded-full border border-edge bg-surface py-1 pl-1.5 pr-2.5 text-caption font-medium text-ink hover:border-edge-strong"
          options={[
            {
              value: "",
              label: "Unassigned",
              icon: <Avatar name={null} type="agent" size={20} />,
            },
            ...agents.map((a) => ({
              value: a.id,
              label: a.full_name ?? "Agent",
              hint: a.id === currentUserId ? "(me)" : undefined,
              icon: <Avatar name={a.full_name} type="agent" size={20} />,
            })),
          ]}
        />
      ) : (
        <span className="flex items-center gap-1.5 rounded-full border border-edge bg-surface py-1 pl-1.5 pr-2.5 text-caption font-medium text-ink">
          <Avatar name={owner?.full_name ?? null} type="agent" size={20} />
          {assignedTo ? owner?.full_name ?? "Assigned" : "Unassigned"}
        </span>
      )}

      {!isSupervisor && !assignedTo && (
        <button disabled={busy} onClick={() => assign(currentUserId)} className="btn-primary px-3 py-1.5 text-caption">
          Claim
        </button>
      )}
      {!isSupervisor && mine && (
        <button disabled={busy} onClick={() => assign(null)} className="btn-secondary px-3 py-1.5 text-caption">
          Release
        </button>
      )}

      {error && <span className="text-caption text-danger">{error}</span>}
    </div>
  );
}

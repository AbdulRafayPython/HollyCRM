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
    <div className="flex items-center gap-1.5 shrink-0">
      {isSupervisor ? (
        <Dropdown
          label="Assigned agent"
          value={assignedTo ?? ""}
          disabled={busy}
          onChange={(id) => assign(id || null)}
          className="rounded-xl border border-edge bg-white py-1.5 pl-2 pr-2.5 text-xs font-semibold text-ink-soft hover:bg-surface transition shadow-2xs"
          options={[
            {
              value: "",
              label: "Unassigned",
              icon: <Avatar name={null} type="agent" size={18} />,
            },
            ...agents.map((a) => ({
              value: a.id,
              label: a.full_name ?? "Agent",
              hint: a.id === currentUserId ? "(me)" : undefined,
              icon: <Avatar name={a.full_name} type="agent" size={18} />,
            })),
          ]}
        />
      ) : (
        <span className="flex items-center gap-1.5 rounded-xl border border-edge bg-white py-1.5 pl-2 pr-2.5 text-xs font-semibold text-ink-soft shadow-2xs">
          <Avatar name={owner?.full_name ?? null} type="agent" size={18} />
          <span>{assignedTo ? owner?.full_name ?? "Assigned" : "Unassigned"}</span>
        </span>
      )}

      {!isSupervisor && !assignedTo && (
        <button
          disabled={busy}
          onClick={() => assign(currentUserId)}
          className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-ink-soft transition"
        >
          Claim
        </button>
      )}
      {!isSupervisor && mine && (
        <button
          disabled={busy}
          onClick={() => assign(null)}
          className="rounded-xl border border-edge bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface transition"
        >
          Release
        </button>
      )}

      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}

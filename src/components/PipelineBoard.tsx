"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "./ui/Avatar";
import Chip, { Dot, type Tone } from "./ui/Chip";
import Icon from "./ui/Icon";
import { useAssistantName } from "./WorkspaceContext";
import { LEAD_STAGES, STAGE_LABELS, type Lead, type LeadStage } from "@/lib/types";

export interface BoardChat {
  id: string;
  title: string | null;
  chat_jid: string;
  chat_type: string;
  is_bot_paused: boolean;
}

const STAGE_TONE: Record<LeadStage, Tone> = {
  new_inquiry: "brand",
  requirements_gathered: "group",
  quotation_sent: "bot",
  under_negotiation: "bot",
  closed_won: "wa",
  closed_lost: "danger",
};

/** Suggested drop reasons from PRD §3.1 — one tap instead of typing mid-call. */
const DROP_PRESETS = ["Price too high", "Dates unavailable", "Went with competitor", "No response"];

/**
 * Kanban with native HTML5 drag-and-drop — no library, nothing new to break.
 *
 * Moves are optimistic: the card lands in the target column immediately, the
 * PATCH runs behind it, and a rejection (RLS, validation) snaps it back with
 * the server's reason on screen. Dropping on Closed Lost opens the drop-reason
 * dialog first, because the database constraint will refuse the move without
 * one — asking beats surfacing a constraint violation.
 */
export default function PipelineBoard({
  leads,
  chats,
}: {
  leads: Lead[];
  chats: BoardChat[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Lead[]>(leads);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ leadId: string; from: LeadStage } | null>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // router.refresh() re-serializes props; adopt the server's truth when it lands.
  useEffect(() => setRows(leads), [leads]);

  const chatById = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);

  function showError(msg: string) {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(null), 6000);
  }

  async function moveLead(leadId: string, to: LeadStage, dropReason?: string) {
    const lead = rows.find((l) => l.id === leadId);
    if (!lead || lead.stage === to) return;

    if (to === "closed_lost" && !dropReason) {
      setLostPrompt({ leadId, from: lead.stage });
      return;
    }

    const from = lead.stage;
    setRows((prev) => prev.map((l) =>
      l.id === leadId ? { ...l, stage: to, drop_reason: dropReason ?? l.drop_reason } : l
    ));
    setPending((prev) => new Set(prev).add(leadId));

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: to, ...(dropReason ? { drop_reason: dropReason } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRows((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: from } : l)));
        showError(body.error ?? "Could not move the lead.");
      } else {
        router.refresh();
      }
    } catch (err) {
      setRows((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: from } : l)));
      showError(String(err));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  }

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, Lead[]>();
    LEAD_STAGES.forEach((s) => m.set(s, []));
    rows.forEach((l) => m.get(l.stage as LeadStage)?.push(l));
    return m;
  }, [rows]);

  return (
    <div className="scroll-thin relative min-h-0 flex-1 overflow-x-auto p-5">
      {error && (
        <div className="absolute left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft px-4 py-2 text-meta text-danger-dark shadow-pop">
          <Icon name="alert" size={15} />
          {error}
        </div>
      )}

      <div className="flex h-full gap-4">
        {LEAD_STAGES.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const total = items.reduce((sum, l) => sum + Number(l.budget_amount ?? 0), 0);
          const isTarget = overStage === stage && dragId !== null;

          return (
            <div
              key={stage}
              className="flex w-[280px] shrink-0 flex-col"
              onDragOver={(e) => {
                e.preventDefault();               // required, or drop never fires
                e.dataTransfer.dropEffect = "move";
                setOverStage(stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData("text/lead-id") || dragId;
                setOverStage(null);
                setDragId(null);
                if (leadId) moveLead(leadId, stage);
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Dot tone={STAGE_TONE[stage]} />
                <span className="text-meta font-semibold text-ink">{STAGE_LABELS[stage]}</span>
                <span className="rounded-full bg-card px-1.5 py-0.5 text-caption text-muted ring-1 ring-edge">
                  {items.length}
                </span>
                {total > 0 && (
                  <span className="ml-auto text-caption text-muted">
                    SAR {total.toLocaleString()}
                  </span>
                )}
              </div>

              <div
                className={`scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg pr-1 transition-colors duration-150 ease-swift ${
                  isTarget ? "bg-brand-soft ring-2 ring-brand/40" : ""
                }`}
              >
                {items.map((l) => (
                  <Card
                    key={l.id}
                    lead={l}
                    chat={chatById.get(l.chat_id)}
                    stage={stage}
                    dragging={dragId === l.id}
                    busy={pending.has(l.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead-id", l.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(l.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                  />
                ))}

                {items.length === 0 && (
                  <p
                    className={`rounded-lg border border-dashed px-3 py-6 text-center text-caption transition-colors duration-150 ease-swift ${
                      isTarget ? "border-brand text-brand" : "border-edge text-subtle"
                    }`}
                  >
                    {isTarget ? "Drop here" : "Nothing in this stage"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {lostPrompt && (
        <DropReasonDialog
          onCancel={() => setLostPrompt(null)}
          onConfirm={(reason) => {
            const { leadId } = lostPrompt;
            setLostPrompt(null);
            moveLead(leadId, "closed_lost", reason);
          }}
        />
      )}
    </div>
  );
}

function Card({
  lead: l,
  chat,
  stage,
  dragging,
  busy,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  chat: BoardChat | undefined;
  stage: LeadStage;
  dragging: boolean;
  busy: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const assistant = useAssistantName();
  const isGroup = chat?.chat_type === "group";
  const name = chat?.title ?? `+${chat?.chat_jid?.split("@")[0] ?? "unknown"}`;

  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative overflow-hidden rounded-lg border border-edge bg-card p-3 pl-4 shadow-card transition duration-150 ease-swift ${
        dragging ? "opacity-40" : "hover:shadow-pop"
      } ${busy ? "pointer-events-none opacity-60" : "cursor-grab active:cursor-grabbing"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${isGroup ? "bg-group" : "bg-wa"}`} />

      <div className="flex items-start justify-between gap-2">
        {/* draggable={false} on the link: otherwise the browser drags the link
            itself and the card's drag payload never gets set */}
        <Link
          href={`/inbox/${l.chat_id}`}
          draggable={false}
          className="min-w-0 truncate text-body font-medium text-ink hover:text-brand"
        >
          {name}
        </Link>
        {busy ? (
          <span className="mt-1 shrink-0 text-caption text-subtle">saving…</span>
        ) : chat?.is_bot_paused === false ? (
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bot"
            title={`${assistant} is active on this chat`}
          />
        ) : null}
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-meta text-muted">
        <Icon name="calendar" size={13} className="text-subtle" />
        {l.check_in_date ?? "dates TBC"}
        {l.nights ? ` · ${l.nights}n` : ""}
      </p>

      <p className="mt-1 text-meta text-muted">
        {l.pax_count ? `${l.pax_count} pax` : "pax TBC"}
        {l.rooms_count ? ` · ${l.rooms_count} ${l.room_configuration ?? "rooms"}` : ""}
      </p>

      <div className="mt-2.5 flex items-center gap-2 border-t border-edge pt-2">
        <Avatar name={name} type={isGroup ? "group" : "direct"} size={20} />
        <span className="truncate text-caption text-muted">{isGroup ? "Group" : "Direct"}</span>
        {l.budget_amount ? (
          <span className="ml-auto text-caption font-semibold text-brand">
            ≤ {l.budget_currency} {Number(l.budget_amount).toLocaleString()}
          </span>
        ) : null}
      </div>

      {stage === "closed_lost" && l.drop_reason && (
        <div className="mt-2">
          <Chip tone="danger">{l.drop_reason}</Chip>
        </div>
      )}
    </div>
  );
}

/** §3.1: closed_lost requires a reason — the DB constraint enforces it too. */
function DropReasonDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-edge bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 text-h3 text-ink">
          <Icon name="alert" size={16} className="text-danger" />
          Why was this lead lost?
        </h2>
        <p className="mt-1 text-meta text-muted">
          A reason is required to close a lead as lost.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {DROP_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setReason(p)}
              className={`rounded-full px-2.5 py-1 text-caption transition duration-150 ease-swift ${
                reason === p
                  ? "bg-danger text-white"
                  : "border border-edge bg-card text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or type a reason…"
          autoFocus
          className="field mt-3 rounded-lg py-2.5 text-meta"
          onKeyDown={(e) => {
            if (e.key === "Enter" && reason.trim()) onConfirm(reason.trim());
            if (e.key === "Escape") onCancel();
          }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost rounded-lg px-4 py-2 text-meta">
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-lg bg-danger px-4 py-2 text-meta font-medium text-white transition duration-150 ease-swift hover:opacity-90 disabled:opacity-40"
          >
            Close as lost
          </button>
        </div>
      </div>
    </div>
  );
}

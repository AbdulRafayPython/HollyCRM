"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Chip from "./ui/Chip";
import Icon, { type IconName } from "./ui/Icon";
import type { QuoteRow } from "./QuotesPanel";
import { LEAD_STAGES, STAGE_LABELS, type Chat, type Lead, type LeadStage } from "@/lib/types";

/** The five forward stages form the progress bar; closed_lost sits outside it. */
const FORWARD: LeadStage[] = LEAD_STAGES.filter((s) => s !== "closed_lost");

const STAGE_ICON: Record<LeadStage, IconName> = {
  new_inquiry: "chat",
  requirements_gathered: "file",
  quotation_sent: "receipt",
  under_negotiation: "users",
  closed_won: "trophy",
  closed_lost: "close",
};

export default function LeadPanel({
  lead,
  chat,
  quotes = [],
}: {
  lead: Lead | null;
  chat: Chat;
  quotes?: QuoteRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!lead) {
    return (
      <div className="p-6 text-center">
        <p className="text-body text-muted">No lead on this chat yet.</p>
        <p className="mt-1 text-meta text-subtle">
          One is created as soon as the client states a requirement.
        </p>
      </div>
    );
  }

  async function setStage(stage: LeadStage) {
    if (stage === "closed_lost" && !dropReason.trim()) {
      setError("A drop reason is required to close a lead as lost.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        // §3.1: closing as lost requires a reason — enforced in the DB too.
        ...(stage === "closed_lost" ? { drop_reason: dropReason } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  const stageIndex = FORWARD.indexOf(lead.stage);
  const lost = lead.stage === "closed_lost";
  const options = quotes[0]?.payload?.options ?? [];

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4">
      {/* Stage */}
      <section>
        <h3 className="eyebrow mb-2">Pipeline stage</h3>

        <div className={`rounded-lg border p-3 ${lost ? "border-danger/25 bg-danger-soft" : "border-edge bg-surface"}`}>
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                lost ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"
              }`}
            >
              <Icon name={STAGE_ICON[lead.stage]} size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-ink">{STAGE_LABELS[lead.stage]}</p>
              <p className="text-caption text-muted">{relative(lead.updated_at)}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-1">
            {FORWARD.map((s, i) => (
              <span
                key={s}
                title={STAGE_LABELS[s]}
                className={`h-1.5 flex-1 rounded-full ${
                  lost ? "bg-edge" : i <= stageIndex ? "bg-brand" : "bg-edge"
                }`}
              />
            ))}
          </div>
        </div>

        <label className="mt-2 block">
          <span className="sr-only">Move to stage</span>
          <div className="relative">
            <select
              disabled={busy}
              value={lead.stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
              className="field appearance-none py-1.5 pr-8 text-meta disabled:opacity-50"
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  Move to · {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            <Icon
              name="chevronDown"
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
        </label>

        <input
          value={dropReason}
          onChange={(e) => setDropReason(e.target.value)}
          placeholder={lead.drop_reason ?? "Drop reason (required to close lost)"}
          className="field mt-2 py-1.5 text-meta"
        />
        {error && <p className="mt-2 text-caption text-danger">{error}</p>}
      </section>

      {/* Requirements */}
      <section className="mt-5">
        <h3 className="eyebrow mb-2">Requirements</h3>

        <div className="overflow-hidden rounded-lg border border-edge">
          <div className="grid grid-cols-2 divide-x divide-edge border-b border-edge">
            <Field label="Guests" icon="users" value={lead.pax_count ? `${lead.pax_count} pax` : "—"} />
            <Field
              label="Rooms"
              icon="inbox"
              value={
                lead.rooms_count
                  ? `${lead.rooms_count}${lead.room_configuration ? ` ${lead.room_configuration}` : ""}`
                  : "—"
              }
            />
          </div>

          <div className="grid grid-cols-2 divide-x divide-edge border-b border-edge">
            <Field label="Check-in" icon="calendar" value={lead.check_in_date ?? "—"} />
            <Field
              label="Check-out"
              icon="calendar"
              value={lead.check_out_date ?? "—"}
              hint={lead.nights ? `${lead.nights} nights` : undefined}
            />
          </div>

          {/* Destination and proximity are travel-specific. They render only
              when the lead actually carries them, so a workspace selling
              anything else never sees an empty "Haram distance" row. The
              columns stay in the schema for the travel inventory module. */}
          {(lead.makkah_hotel_pref || lead.madinah_hotel_pref) && (
            <div className="border-b border-edge p-3">
              <p className="text-caption text-muted">Destination</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lead.makkah_hotel_pref && <Chip tone="brand" icon="pin">Makkah · {lead.makkah_hotel_pref}</Chip>}
                {lead.madinah_hotel_pref && <Chip tone="brand" icon="pin">Madinah · {lead.madinah_hotel_pref}</Chip>}
              </div>
            </div>
          )}

          <div className={`grid divide-x divide-edge ${lead.max_distance_m ? "grid-cols-2" : "grid-cols-1"}`}>
            {lead.max_distance_m != null && (
              <Field
                label="Max distance"
                icon="pin"
                value={`≤ ${lead.max_distance_m} m`}
                hint={lead.shuttle_acceptable ? "Transfer OK" : undefined}
              />
            )}
            <Field
              label="Budget"
              icon="bolt"
              value={
                lead.budget_amount
                  ? `≤ ${lead.budget_currency} ${Number(lead.budget_amount).toLocaleString()}`
                  : "—"
              }
              hint={lead.budget_amount ? "per night" : undefined}
            />
          </div>
        </div>
      </section>

      {/* What the bot matched, straight from search_hotels() output */}
      <section className="mt-5">
        <h3 className="eyebrow mb-2">Proposed options</h3>

        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-meta text-muted">
            Nothing quoted yet.
          </p>
        ) : (
          <div className="space-y-2">
            {options.slice(0, 4).map((o, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-lg border border-edge bg-card p-3 pl-4 shadow-card"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-wa" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-semibold text-ink">{o.hotel_name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-caption text-muted">
                      <Icon name="star" size={12} fill className="text-bot" />
                      {o.star_rating ?? "—"} star
                      <span aria-hidden>·</span>
                      {o.distance_m != null ? `${o.distance_m} m from Haram` : "shuttle"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body font-semibold text-brand">
                      {o.currency} {Number(o.price_per_night).toLocaleString()}
                    </p>
                    <p className="text-caption text-muted">/night</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {/* total_price covers rooms_needed rooms, so the count has to be
                      visible or the agent reads it as a one-room price. Quotes
                      written before 0017 have no rooms_needed; those were
                      one-room searches. */}
                  <Chip tone="neutral">
                    {(o.rooms_needed ?? 1) > 1 ? `${o.rooms_needed}× ${o.room_type}` : o.room_type}
                  </Chip>
                  <Chip tone="wa">{o.rooms_available} available</Chip>
                  <span className="ml-auto text-caption text-muted">
                    total {o.currency} {Number(o.total_price).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-5 text-caption text-subtle">
        {chat.chat_type === "group" ? "Group-originated lead" : "Direct WhatsApp lead"} ·{" "}
        created {relative(lead.created_at)}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: IconName;
  hint?: string;
}) {
  return (
    <div className="p-3">
      <p className="text-caption text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-body font-medium text-ink">
        {icon && <Icon name={icon} size={14} className="text-subtle" />}
        <span className="truncate">{value}</span>
      </p>
      {hint && <p className="mt-0.5 text-caption text-subtle">{hint}</p>}
    </div>
  );
}

function relative(iso?: string | null) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

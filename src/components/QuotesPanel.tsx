"use client";

import Chip from "./ui/Chip";
import Icon from "./ui/Icon";
import type { HotelResult } from "@/lib/types";

export interface QuoteRow {
  id: string;
  by_bot: boolean;
  total_amount: number | null;
  currency: string;
  sent_at: string | null;
  created_at: string;
  payload: { options?: HotelResult[] } | null;
}

/**
 * What was actually quoted, and by whom.
 *
 * Every row here was produced from search_hotels() output, so an agent can see
 * the exact figures the customer received rather than reconstructing them.
 */
export default function QuotesPanel({ quotes }: { quotes: QuoteRow[] }) {
  if (quotes.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-body text-muted">No quotes sent yet.</p>
        <p className="mt-1 text-meta text-subtle">
          Prices come from inventory, never from the model.
        </p>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full space-y-3 overflow-y-auto p-3">
      {quotes.map((q) => (
        <div key={q.id} className="rounded-lg border border-edge bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-edge px-3 py-2">
            <Chip tone={q.by_bot ? "bot" : "brand"} icon={q.by_bot ? "bot" : "user"}>
              {q.by_bot ? "Hollyland AI" : "Agent"}
            </Chip>
            <span className="text-caption text-subtle">{stamp(q.sent_at ?? q.created_at)}</span>
          </div>

          <ul className="divide-y divide-edge">
            {(q.payload?.options ?? []).map((o, i) => (
              <li key={i} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-meta font-semibold text-ink">{o.hotel_name}</p>
                  <p className="shrink-0 text-meta font-semibold text-brand">
                    {o.currency} {Number(o.price_per_night).toLocaleString()}
                  </p>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-caption text-muted">
                  <Icon name="star" size={11} fill className="text-bot" />
                  {o.star_rating ?? "—"}
                  <span aria-hidden>·</span>
                  {o.distance_m != null ? `${o.distance_m} m` : "shuttle"}
                  <span aria-hidden>·</span>
                  {o.room_type}
                  <span className="ml-auto">
                    total {o.currency} {Number(o.total_price).toLocaleString()}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          {q.total_amount != null && (
            <div className="flex items-center justify-between border-t border-edge px-3 py-2">
              <span className="text-caption text-muted">Quote total</span>
              <span className="text-meta font-semibold text-ink">
                {q.currency} {Number(q.total_amount).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function stamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

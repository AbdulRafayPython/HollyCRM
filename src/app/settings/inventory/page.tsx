"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import { useConfirm } from "@/components/ui/ConfirmDialog";

import SettingsNav from "@/components/settings/SettingsNav";

interface Hotel {
  id: string; name: string; city: "Makkah" | "Madinah"; star_rating: number | null;
  distance_to_haram_m: number | null; has_shuttle: boolean; shuttle_minutes: number | null;
  description: string | null; is_active: boolean;
}
interface RoomType { id: string; hotel_id: string; name: string; config: string; capacity: number }
interface Rate {
  id: string; room_type_id: string; valid_from: string; valid_to: string;
  price_per_night: number; currency: string; allotment: number; season_label: string | null;
}

const CONFIGS = ["single", "double", "triple", "quad", "sharing"] as const;

/**
 * Settings → Inventory. What the AI quotes from — every price the bot sends a
 * customer exists as a rate row here, or it is never said at all.
 */
export default function InventoryPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showHotelForm, setShowHotelForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function load() {
    const res = await fetch("/api/settings/hotels");
    if (!res.ok) return setError("Could not load inventory");
    const j = await res.json();
    setHotels(j.hotels); setRoomTypes(j.roomTypes); setRates(j.rates);
  }
  useEffect(() => { load(); }, []);

  async function post(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/settings/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Save failed");
      return false;
    }
    await load();
    return true;
  }

  async function patch(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/settings/hotels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
    await load();
  }

  return (
    <div className="flex h-full bg-surface">
      <SettingsNav />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge/80 px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold text-ink">Hotel Inventory & Pricing</h1>
            <p className="text-xs text-subtle">Verified properties, room categories, and contracted seasonal rates</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand ring-1 ring-brand/20">
              {hotels.length} propert{hotels.length === 1 ? "y" : "ies"} live
            </span>
            <button
              onClick={() => setShowHotelForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand transition"
            >
              <Icon name="plus" size={14} />
              <span>Add Hotel</span>
            </button>
          </div>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto p-6 md:p-8 bg-surface">
          <div className="max-w-5xl mx-auto space-y-4">
            {error && (
              <p className="flex items-start gap-2 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-xs font-medium text-danger-dark">
                <Icon name="alert" size={16} className="mt-0.5 text-danger shrink-0" />
                <span>{error}</span>
              </p>
            )}

            {showHotelForm && (
              <HotelForm
                onCancel={() => setShowHotelForm(false)}
                onSave={async (h) => { if (await post({ kind: "hotel", ...h })) setShowHotelForm(false); }}
              />
            )}

          {hotels.map((h) => {
            const hRooms = roomTypes.filter((rt) => rt.hotel_id === h.id);
            const expanded = open === h.id;
            return (
              <div key={h.id} className={`panel p-0 ${h.is_active ? "" : "opacity-60"}`}>
                <button
                  onClick={() => setOpen(expanded ? null : h.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <Icon name="chevronDown" size={15}
                    className={`text-subtle transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-body font-semibold text-ink">
                      {h.name}
                      <Chip tone={h.city === "Makkah" ? "brand" : "group"}>{h.city}</Chip>
                      {!h.is_active && <Chip tone="neutral">Hidden from AI</Chip>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
                      {h.star_rating ?? "—"}★ · {h.distance_to_haram_m ?? "—"} m
                      {h.has_shuttle ? ` · shuttle ${h.shuttle_minutes ?? "?"} min` : ""}
                      · {hRooms.length} room types
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-edge p-4">
                    {hRooms.map((rt) => (
                      <RoomTypeBlock key={rt.id} rt={rt}
                        rates={rates.filter((r) => r.room_type_id === rt.id)}
                        onAddRate={(rate) => post({ kind: "rate", room_type_id: rt.id, ...rate })}
                        onDeleteRate={async (id, label) => {
                          const ok = await confirm({
                            title: "Delete this rate?",
                            body: `${label} — the AI will stop quoting ${rt.name} for those dates.`,
                            confirmLabel: "Delete rate",
                            tone: "danger",
                          });
                          if (ok) patch({ action: "delete_rate", id });
                        }}
                        onDelete={async () => {
                          const n = rates.filter((r) => r.room_type_id === rt.id).length;
                          const ok = await confirm({
                            title: `Delete ${rt.name}?`,
                            body: n
                              ? `Its ${n} rate row${n === 1 ? "" : "s"} will be deleted too.`
                              : "This room type has no rates yet.",
                            confirmLabel: "Delete room type",
                            tone: "danger",
                          });
                          if (ok) patch({ action: "delete_room_type", id: rt.id });
                        }}
                      />
                    ))}

                    <AddRoomType onAdd={(r) => post({ kind: "room_type", hotel_id: h.id, ...r })} />

                    <div className="flex justify-between border-t border-edge pt-3">
                      <button
                        onClick={() => patch({ action: "toggle_hotel", id: h.id, is_active: !h.is_active })}
                        className="text-caption font-medium text-muted hover:text-ink"
                      >
                        {h.is_active ? "Hide from AI (keep data)" : "Show to AI again"}
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete ${h.name}?`,
                            body: `Its ${hRooms.length} room type${hRooms.length === 1 ? "" : "s"} and all seasonal rates are removed too. To stop the AI offering it while keeping the data, use “Hide from AI” instead.`,
                            confirmLabel: "Delete hotel",
                            tone: "danger",
                          });
                          if (ok) patch({ action: "delete_hotel", id: h.id });
                        }}
                        className="text-caption font-medium text-danger hover:underline"
                      >
                        Delete hotel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-center text-xs text-subtle">
            The AI only quotes hotels that are visible, actively priced for the requested dates, and have allotments available.
          </p>
        </div>
      </div>

      {dialog}
    </div>
  </div>
  );
}

function HotelForm({ onSave, onCancel }: {
  onSave: (h: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({ name: "", city: "Makkah", star_rating: 4, distance_to_haram_m: 500, has_shuttle: false, shuttle_minutes: 10, description: "" });
  return (
    <div className="panel space-y-3 p-5">
      <h2 className="text-h3 text-ink">New hotel</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="mb-1 block text-meta font-medium text-ink">Name</span>
          <input className="field rounded-lg py-2.5 text-meta" value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">City</span>
          <select className="field rounded-lg py-2.5 text-meta" value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}>
            <option>Makkah</option><option>Madinah</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Stars</span>
          <input type="number" min={1} max={5} className="field rounded-lg py-2.5 text-meta" value={f.star_rating}
            onChange={(e) => setF({ ...f, star_rating: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Distance to Haram (m)</span>
          <input type="number" className="field rounded-lg py-2.5 text-meta" value={f.distance_to_haram_m}
            onChange={(e) => setF({ ...f, distance_to_haram_m: Number(e.target.value) })} />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={f.has_shuttle}
            onChange={(e) => setF({ ...f, has_shuttle: e.target.checked })} />
          <span className="text-meta text-ink">Shuttle</span>
          {f.has_shuttle && (
            <input type="number" className="field w-20 rounded-lg py-1.5 text-meta" value={f.shuttle_minutes}
              title="minutes" onChange={(e) => setF({ ...f, shuttle_minutes: Number(e.target.value) })} />
          )}
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-meta font-medium text-ink">Description (helps the AI describe it)</span>
          <textarea rows={2} className="field resize-none rounded-lg py-2.5 text-meta" value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost rounded-lg px-4 py-2 text-meta">Cancel</button>
        <button disabled={!f.name.trim()} onClick={() => onSave(f)}
          className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40">
          Add hotel
        </button>
      </div>
    </div>
  );
}

function RoomTypeBlock({ rt, rates, onAddRate, onDeleteRate, onDelete }: {
  rt: RoomType; rates: Rate[];
  onAddRate: (r: Record<string, unknown>) => void;
  onDeleteRate: (id: string, label: string) => void;
  onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [r, setR] = useState({ valid_from: "", valid_to: "", price_per_night: 500, allotment: 10, season_label: "" });

  return (
    <div className="rounded-lg border border-edge bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="text-meta font-semibold text-ink">{rt.name}</span>
        <Chip tone="neutral">{rt.config} · sleeps {rt.capacity}</Chip>
        <button onClick={() => setAdding((v) => !v)} className="ml-auto text-caption font-medium text-brand hover:underline">
          + rate
        </button>
        <button onClick={onDelete} className="btn-ghost rounded-full p-1" title="Delete room type">
          <Icon name="close" size={13} />
        </button>
      </div>

      {rates.length > 0 && (
        <table className="mt-2 w-full text-caption">
          <thead className="text-subtle">
            <tr><th className="text-left font-normal">Dates</th><th className="text-right font-normal">SAR/night</th><th className="text-right font-normal">Rooms</th><th className="text-left font-normal">Season</th><th /></tr>
          </thead>
          <tbody>
            {rates.map((x) => (
              <tr key={x.id} className="border-t border-edge/60">
                <td className="py-1">{x.valid_from} → {x.valid_to}</td>
                <td className="py-1 text-right font-medium text-ink">{Number(x.price_per_night).toLocaleString()}</td>
                <td className="py-1 text-right">{x.allotment}</td>
                <td className="py-1 pl-2 text-muted">{x.season_label ?? "—"}</td>
                <td className="py-1 text-right">
                  <button
                    onClick={() => onDeleteRate(x.id, `${x.valid_from} → ${x.valid_to}`)}
                    className="text-subtle hover:text-danger"
                    title="Delete rate"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-edge pt-2">
          <input type="date" className="field w-36 rounded-lg py-1.5 text-caption" value={r.valid_from}
            onChange={(e) => setR({ ...r, valid_from: e.target.value })} />
          <span className="pb-2 text-caption text-subtle">→</span>
          <input type="date" className="field w-36 rounded-lg py-1.5 text-caption" value={r.valid_to}
            onChange={(e) => setR({ ...r, valid_to: e.target.value })} />
          <input type="number" placeholder="SAR/night" className="field w-24 rounded-lg py-1.5 text-caption" value={r.price_per_night}
            onChange={(e) => setR({ ...r, price_per_night: Number(e.target.value) })} />
          <input type="number" placeholder="rooms" className="field w-20 rounded-lg py-1.5 text-caption" value={r.allotment}
            onChange={(e) => setR({ ...r, allotment: Number(e.target.value) })} />
          <input placeholder="Season (optional)" className="field w-28 rounded-lg py-1.5 text-caption" value={r.season_label}
            onChange={(e) => setR({ ...r, season_label: e.target.value })} />
          <button
            disabled={!r.valid_from || !r.valid_to || r.price_per_night <= 0}
            onClick={() => { onAddRate(r); setAdding(false); }}
            className="btn-primary rounded-lg px-3 py-1.5 text-caption disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function AddRoomType({ onAdd }: { onAdd: (r: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ name: "", config: "double", capacity: 2 });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-edge p-3">
      <input placeholder="Room type name (e.g. Quad Room)" className="field min-w-44 flex-1 rounded-lg py-1.5 text-caption"
        value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select className="field w-28 rounded-lg py-1.5 text-caption" value={f.config}
        onChange={(e) => { const config = e.target.value; setF({ ...f, config, capacity: { single: 1, double: 2, triple: 3, quad: 4, sharing: 1 }[config] ?? 2 }); }}>
        {CONFIGS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input type="number" min={1} title="sleeps" className="field w-20 rounded-lg py-1.5 text-caption"
        value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} />
      <button disabled={!f.name.trim()} onClick={() => { onAdd(f); setF({ name: "", config: "double", capacity: 2 }); }}
        className="btn-primary rounded-lg px-3 py-1.5 text-caption disabled:opacity-40">
        Add room type
      </button>
    </div>
  );
}

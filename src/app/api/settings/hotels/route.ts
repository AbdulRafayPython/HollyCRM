import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Inventory management (Settings → Inventory). Reads are org-wide; every write
 * is gated by the supervisor RLS policies from 0001/0007, narrowed to the
 * caller's covered destinations and suppliers by 0033. Three shapes are
 * accepted on POST via `kind`: hotel, room_type, rate — one route keeps the
 * client simple.
 *
 * A hotel is placed by `destination_id` now, not by the frozen city_name enum
 * (0031). `city` is still selected and still returned because the trigger keeps
 * it mirrored and the import path writes it, but it is NULL for anywhere the
 * enum never had a value for — every Dubai hotel — so nothing may key off it.
 */
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    { data: hotels },
    { data: roomTypes },
    { data: rates },
    { data: destinations },
    { data: suppliers },
  ] = await Promise.all([
    sb.from("hotels")
      // Ordered by name alone: the old `.order("city")` sorted on a column that
      // is now null for every destination outside the enum, which buried them.
      .select(
        "id, name, city, destination_id, supplier_id, star_rating, distance_to_haram_m, " +
        "has_shuttle, shuttle_minutes, description, is_active, " +
        "destination:destinations(id, name, anchor_label), supplier:suppliers(id, name)",
      )
      .order("name"),
    sb.from("hotel_room_types").select("id, hotel_id, name, config, capacity").order("name"),
    sb.from("hotel_rates")
      .select("id, room_type_id, valid_from, valid_to, price_per_night, currency, allotment, season_label")
      .order("valid_from"),
    // Both lists are already coverage-filtered by RLS, so a scoped agent is
    // offered exactly the markets they may actually sell.
    sb.from("destinations").select("id, name, anchor_label, is_active")
      .eq("is_active", true).order("sort_order").order("name"),
    sb.from("suppliers").select("id, name, kind").eq("is_active", true).order("name"),
  ]);

  return NextResponse.json({
    hotels: hotels ?? [],
    roomTypes: roomTypes ?? [],
    rates: rates ?? [],
    destinations: destinations ?? [],
    suppliers: suppliers ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { kind?: string } & Record<string, unknown>;

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const rls = (msg: string) =>
    /row-level security/i.test(msg) ? "Only a supervisor can edit inventory." : msg;

  if (body.kind === "hotel") {
    const { data, error } = await sb
      .from("hotels")
      .insert({
        org_id: me.org_id,
        name: String(body.name ?? "").trim(),
        // destination_id is authoritative; app.sync_hotel_destination() (0031)
        // fills in the city mirror, or leaves it null where the enum has no
        // value. Sending city here would re-impose the ceiling 0031 removed.
        destination_id: body.destination_id ? String(body.destination_id) : null,
        supplier_id: body.supplier_id ? String(body.supplier_id) : null,
        star_rating: body.star_rating ? Number(body.star_rating) : null,
        distance_to_haram_m: body.distance_to_haram_m ? Number(body.distance_to_haram_m) : null,
        has_shuttle: Boolean(body.has_shuttle),
        shuttle_minutes: body.shuttle_minutes ? Number(body.shuttle_minutes) : null,
        description: String(body.description ?? "").slice(0, 2000) || null,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: rls(error.message) }, { status: 403 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.kind === "room_type") {
    const { data, error } = await sb
      .from("hotel_room_types")
      .insert({
        hotel_id: String(body.hotel_id),
        name: String(body.name ?? "").trim(),
        config: body.config as never,
        capacity: Number(body.capacity ?? 2),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: rls(error.message) }, { status: 403 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.kind === "rate") {
    const { data, error } = await sb
      .from("hotel_rates")
      .insert({
        room_type_id: String(body.room_type_id),
        valid_from: String(body.valid_from),
        valid_to: String(body.valid_to),
        price_per_night: Number(body.price_per_night),
        allotment: Number(body.allotment ?? 0),
        season_label: String(body.season_label ?? "").trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      const msg = /exclusion|overlap/i.test(error.message)
        ? "That date range overlaps an existing rate for this room type."
        : rls(error.message);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  }

  return NextResponse.json({ error: "kind must be hotel | room_type | rate" }, { status: 400 });
}

/** Small mutations: toggle a hotel, delete a rate/room type/hotel. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    action?: "toggle_hotel" | "delete_hotel" | "delete_room_type" | "delete_rate";
    id?: string;
    is_active?: boolean;
  };
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const table =
    body.action === "delete_rate" ? "hotel_rates"
    : body.action === "delete_room_type" ? "hotel_room_types"
    : "hotels";

  const q =
    body.action === "toggle_hotel"
      ? sb.from("hotels").update({ is_active: Boolean(body.is_active) }).eq("id", body.id).select("id").maybeSingle()
      : sb.from(table).delete().eq("id", body.id).select("id").maybeSingle();

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found, or supervisors only." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

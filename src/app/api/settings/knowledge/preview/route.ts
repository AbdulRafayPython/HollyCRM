import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * The staged rows of one inventory import, for the review step.
 *
 * This is the screen that keeps a mis-parsed supplier sheet out of the prices
 * the bot quotes, so it shows the ERRORS FIRST. A preview that opens on two
 * hundred perfectly parsed rows and buries the three broken ones on page four
 * is a preview nobody reads, and the whole staging table is then just latency.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceId = searchParams.get("source_id");
  if (!sourceId) return NextResponse.json({ error: "source_id required" }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: rows }, { count: total }, { count: errors }, { count: warnings }] =
    await Promise.all([
      sb.from("inventory_import_rows")
        .select(
          "id, row_no, hotel_name, city, star_rating, distance_to_haram_m, room_type, config, capacity, valid_from, valid_to, price_per_night, currency, allotment, season_label, status, issues"
        )
        .eq("source_id", sourceId)
        // 'error' < 'ok' < 'warning' alphabetically, so a plain status sort puts
        // the rows that matter first and the rows that need a second look next.
        .order("status", { ascending: true })
        .order("row_no", { ascending: true })
        .limit(200),
      sb.from("inventory_import_rows")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId),
      sb.from("inventory_import_rows")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId).eq("status", "error"),
      sb.from("inventory_import_rows")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId).eq("status", "warning"),
    ]);

  return NextResponse.json({
    rows: rows ?? [],
    counts: {
      total: total ?? 0,
      errors: errors ?? 0,
      warnings: warnings ?? 0,
      importable: (total ?? 0) - (errors ?? 0),
    },
  });
}

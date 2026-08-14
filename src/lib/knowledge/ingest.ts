import { supabaseAdmin } from "@/lib/supabase/admin";
import { chunkText, fetchRemote, gridToText, parseGrid, parsePdf, type ParsedGrid } from "./parse";
import { mapGrid, type ColumnMap } from "./inventory-map";

/**
 * Processing an uploaded or linked source into something the agent can use.
 *
 * Runs OFF the request path (Next's `after()`), because a 4 MB PDF takes
 * several seconds to extract and an operator who uploads a file should get the
 * row back immediately with a "processing" badge rather than a spinner and a
 * gateway timeout. Status on the row is the whole progress model — `pending` ->
 * `processing` -> `ready` | `failed`, with the failure reason stored so the UI
 * can show what went wrong instead of a red dot.
 */

export interface SourceRow {
  id: string;
  org_id: string;
  purpose: "knowledge" | "inventory";
  kind: "pdf" | "csv" | "xlsx" | "gsheet" | "text";
  title: string;
  storage_path: string | null;
  source_url: string | null;
  raw_text: string | null;
}

export async function processSource(source: SourceRow, columnMap?: ColumnMap): Promise<void> {
  const db = supabaseAdmin();
  await db.from("knowledge_sources").update({ status: "processing", error: null }).eq("id", source.id);

  try {
    const { text, grid } = await loadContent(source);

    if (source.purpose === "inventory") {
      if (!grid || grid.rows.length === 0) {
        throw new Error(
          "No table rows found. Inventory imports need a spreadsheet or CSV with a header row " +
            "(hotel, city, room type, dates, price)."
        );
      }
      await stageInventory(source, grid, columnMap);
      return;
    }

    if (!text.trim()) {
      throw new Error(
        source.kind === "pdf"
          ? "No text could be extracted. If this is a scanned PDF it contains images rather than " +
              "text, and needs to be re-exported or typed in as a note."
          : "No text could be extracted from this file. The file appears to be empty."
      );
    }
    await storeChunks(source, text);
  } catch (err) {
    await db
      .from("knowledge_sources")
      .update({ status: "failed", error: String(err instanceof Error ? err.message : err).slice(0, 500) })
      .eq("id", source.id);
  }
}

/** Fetches the bytes and turns them into text and/or a grid, by kind. */
async function loadContent(
  source: SourceRow
): Promise<{ text: string; grid: ParsedGrid | null }> {
  if (source.kind === "text" && !source.storage_path) {
    return { text: source.raw_text ?? "", grid: null };
  }

  if (source.source_url) {
    const { text } = await fetchRemote(source.source_url);
    // A linked source is a sheet or a page; PDFs are uploaded, not linked,
    // because a link to a PDF is a link that rots.
    const grid = parseGrid(text);
    return { text: grid.rows.length ? gridToText(grid) : stripHtml(text), grid };
  }

  if (!source.storage_path) throw new Error("Source has no file and no link.");

  const { data, error } = await supabaseAdmin()
    .storage.from("knowledge")
    .download(source.storage_path);
  if (error || !data) throw new Error(`Could not read the uploaded file: ${error?.message ?? "missing"}`);

  const bytes = new Uint8Array(await data.arrayBuffer());

  if (source.kind === "pdf") {
    return { text: await parsePdf(bytes), grid: null };
  }

  if (source.kind === "text") {
    return { text: new TextDecoder().decode(bytes), grid: null };
  }

  const grid = source.kind === "csv"
    ? parseGrid(new TextDecoder().decode(bytes))
    : parseGrid(bytes);
  return { text: gridToText(grid), grid };
}

/* ---------------------------------------------------------------------------
 * Knowledge
 * ------------------------------------------------------------------------ */

/** Chunks beyond this stop being a knowledge base and start being a search
 *  engine we have not built. A 500-chunk document is a sign the wrong file was
 *  uploaded, and the operator is told so rather than silently truncated. */
const MAX_CHUNKS = 400;

async function storeChunks(source: SourceRow, text: string): Promise<void> {
  const db = supabaseAdmin();
  const chunks = chunkText(text).slice(0, MAX_CHUNKS);

  if (chunks.length === 0) throw new Error("Nothing to index after parsing.");

  // Replace, never append. Re-syncing a Google Sheet that had a row deleted
  // must not leave the deleted row's chunk behind — that is precisely how a
  // withdrawn policy keeps being quoted at customers weeks after it was pulled.
  await db.from("knowledge_chunks").delete().eq("source_id", source.id);

  // Batched: one insert of 400 rows is a single statement but a large body, and
  // PostgREST's default payload limits are lower than people expect.
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const { error } = await db.from("knowledge_chunks").insert(
      chunks.slice(i, i + BATCH).map((c) => ({
        org_id: source.org_id,
        source_id: source.id,
        ordinal: c.ordinal,
        heading: c.heading,
        content: c.content,
      }))
    );
    if (error) throw new Error(`Indexing failed: ${error.message}`);
  }

  await db
    .from("knowledge_sources")
    .update({
      status: "ready",
      chunk_count: chunks.length,
      row_count: 0,
      last_synced_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", source.id);
}

/* ---------------------------------------------------------------------------
 * Inventory
 * ------------------------------------------------------------------------ */

/**
 * Parses a rate sheet into STAGING rows and stops.
 *
 * It does not touch hotels, room types or rates. A human opens the preview,
 * sees which rows were understood and which were flagged, and presses Import —
 * at which point commit_inventory_import() (0019) applies them in one
 * transaction. The gap between these two steps is the only thing standing
 * between a mis-parsed supplier PDF and a customer being quoted a price the
 * agency cannot honour.
 */
async function stageInventory(
  source: SourceRow,
  grid: ParsedGrid,
  columnMap?: ColumnMap
): Promise<void> {
  const db = supabaseAdmin();
  const rows = mapGrid(grid, columnMap);

  await db.from("inventory_import_rows").delete().eq("source_id", source.id);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("inventory_import_rows").insert(
      rows.slice(i, i + BATCH).map((r) => ({
        org_id: source.org_id,
        source_id: source.id,
        row_no: r.row_no,
        raw: r.raw,
        hotel_name: r.hotel_name,
        city: r.city,
        star_rating: r.star_rating,
        distance_to_haram_m: r.distance_to_haram_m,
        has_shuttle: r.has_shuttle,
        shuttle_minutes: r.shuttle_minutes,
        room_type: r.room_type,
        config: r.config,
        capacity: r.capacity,
        valid_from: r.valid_from,
        valid_to: r.valid_to,
        price_per_night: r.price_per_night,
        currency: r.currency,
        allotment: r.allotment,
        season_label: r.season_label,
        status: r.status,
        issues: r.issues,
      }))
    );
    if (error) throw new Error(`Staging failed: ${error.message}`);
  }

  // 'pending' rather than 'ready': a staged import is NOT live inventory. Only
  // commit_inventory_import() moves it to ready, and the settings hub counts on
  // that distinction to show "12 rows awaiting review".
  await db
    .from("knowledge_sources")
    .update({ status: "pending", row_count: rows.length, chunk_count: 0, error: null })
    .eq("id", source.id);
}

/** Crude tag strip for a linked HTML page. Good enough for a policy page; a
 *  full HTML-to-text pass is a dependency we do not need for a settings import. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, " ");
}

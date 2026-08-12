import * as XLSX from "xlsx";

/**
 * Turning an uploaded file into text or rows.
 *
 * Nothing here calls a model. A parser that "understands" a document is a
 * parser that invents a column when the header is unfamiliar, and the output of
 * this module is committed straight into the prices the bot quotes.
 */

export interface ParsedGrid {
  /** Header row, lower-cased and trimmed. */
  headers: string[];
  /** Data rows as header -> cell, blank rows removed. */
  rows: Record<string, string>[];
}

/* ---------------------------------------------------------------------------
 * PDF
 * ------------------------------------------------------------------------ */

/**
 * Text out of a PDF, page by page.
 *
 * `unpdf` bundles a serverless build of pdf.js, so this runs on the Node
 * runtime without a native binary or a headless browser. Imported lazily
 * because it is a large module and the vast majority of requests to this app
 * never touch a PDF.
 */
export async function parsePdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  // `mergePages: true` narrows the return to a string in unpdf's types, but the
  // runtime still hands back an array for some documents — so the guard stays
  // and the cast is what lets it compile.
  const { text } = await extractText(doc, { mergePages: true });
  const out = text as unknown as string | string[];
  return typeof out === "string" ? out : out.join("\n\n");
}

/* ---------------------------------------------------------------------------
 * Spreadsheets
 * ------------------------------------------------------------------------ */

/**
 * CSV / XLSX / a Google Sheet's CSV export, as a header-keyed grid.
 *
 * `raw: false` matters more than it looks: with raw dates, XLSX hands back the
 * Excel serial number (45913) and every date in a supplier rate sheet becomes a
 * five-digit integer that the date parser then rejects. Formatted strings are
 * ambiguous but recoverable; serials are not recoverable without knowing the
 * workbook's epoch, which differs between Excel for Windows and Mac.
 */
export function parseGrid(input: Uint8Array | string): ParsedGrid {
  const wb =
    typeof input === "string"
      ? XLSX.read(input, { type: "string", raw: false, cellDates: false })
      : XLSX.read(input, { type: "array", raw: false, cellDates: false });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  // Supplier sheets routinely open with a title row, a blank row and a logo
  // before the real headers. The header row is the first one with at least two
  // non-empty cells that looks like labels rather than data — taking row 0 on
  // faith produces a grid keyed by "" and "Rate sheet Q3 2026".
  const headerIndex = matrix.findIndex(
    (row) => row.filter((c) => String(c ?? "").trim()).length >= 2
  );
  if (headerIndex === -1) return { headers: [], rows: [] };

  const headers = (matrix[headerIndex] ?? []).map((h) =>
    String(h ?? "").trim().toLowerCase()
  );

  const rows: Record<string, string>[] = [];
  for (const raw of matrix.slice(headerIndex + 1)) {
    const row: Record<string, string> = {};
    let filled = 0;
    headers.forEach((h, i) => {
      if (!h) return;
      const cell = String(raw[i] ?? "").trim();
      row[h] = cell;
      if (cell) filled++;
    });
    // A row with one cell filled is a section divider or a footnote, not a rate.
    if (filled >= 2) rows.push(row);
  }

  return { headers: headers.filter(Boolean), rows };
}

/* ---------------------------------------------------------------------------
 * Google Sheets
 * ------------------------------------------------------------------------ */

/**
 * Rewrites any Google Sheets URL into its CSV export endpoint.
 *
 * No OAuth, no Google Cloud project, no consent screen: the user pastes the
 * link they already have and the sheet is read as CSV, provided it is shared to
 * anyone-with-the-link. That constraint is worth stating in the UI, because the
 * failure mode is a 302 to a sign-in page whose HTML then parses as one very
 * confusing row.
 *
 * Returns null for anything that is not a Google Sheet, so the caller can fall
 * back to fetching a plain URL.
 */
export function toSheetCsvUrl(url: string): string | null {
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;

  const id = match[1];
  // The tab, if the link points at one. Without it Google exports the first
  // sheet, which is rarely the one someone deliberately linked to.
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

/** Fetches a linked source, with the Google-Sheets rewrite applied. */
export async function fetchRemote(
  url: string
): Promise<{ text: string; contentType: string }> {
  const target = toSheetCsvUrl(url) ?? url;
  const res = await fetch(target, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: { "user-agent": "HollyCRM/1.0 (+knowledge-sync)" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  // A private sheet redirects to the Google account chooser and returns 200
  // with a login page. Without this check that HTML is parsed as a one-column
  // CSV and imported as a hotel called "<!DOCTYPE html>".
  if (/text\/html/i.test(contentType) && /accounts\.google\.com|sign in/i.test(text.slice(0, 2000))) {
    throw new Error(
      "Google returned a sign-in page. Share the sheet with “Anyone with the link — Viewer” and try again."
    );
  }

  return { text, contentType };
}

/* ---------------------------------------------------------------------------
 * Chunking
 * ------------------------------------------------------------------------ */

export interface Chunk {
  ordinal: number;
  heading: string | null;
  content: string;
}

/** Big enough to hold a whole policy clause, small enough that four of them
 *  still leave room for the conversation in the prompt. */
const TARGET_CHARS = 900;
const MAX_CHARS = 1800;

/**
 * Splits a document into retrievable passages, carrying headings downward.
 *
 * Paragraph boundaries, not a fixed character window. A cancellation policy cut
 * mid-sentence retrieves as two chunks that each look like they contradict the
 * other — one says 50% is retained, the other says nothing is, and the model
 * picks whichever ranked higher.
 *
 * Every chunk keeps the last heading above it, because "48 hours before
 * arrival, 50% is retained" is worse than useless without the "Cancellation"
 * that gave it scope — it reads as a general refund rule.
 */
export function chunkText(text: string): Chunk[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    // PDF extraction leaves runs of spaces where the layout had columns.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const chunks: Chunk[] = [];

  let heading: string | null = null;
  let buffer: string[] = [];
  let bufferLen = 0;

  const flush = () => {
    const content = buffer.join("\n\n").trim();
    if (content) {
      chunks.push({ ordinal: chunks.length, heading, content: content.slice(0, MAX_CHARS) });
    }
    buffer = [];
    bufferLen = 0;
  };

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (isHeading(trimmed)) {
      // A new section starts a new chunk: merging the end of one policy with the
      // start of the next is how a retrieval hit answers the wrong question.
      flush();
      heading = trimmed.replace(/^#+\s*/, "").slice(0, 200);
      continue;
    }

    // One oversized block (a wall-of-text PDF page) is split on sentences
    // rather than truncated — the tail of a page is as likely to hold the
    // answer as the head.
    if (trimmed.length > MAX_CHARS) {
      flush();
      for (const piece of splitLong(trimmed)) {
        chunks.push({ ordinal: chunks.length, heading, content: piece });
      }
      continue;
    }

    if (bufferLen + trimmed.length > TARGET_CHARS && bufferLen > 0) flush();
    buffer.push(trimmed);
    bufferLen += trimmed.length;
  }

  flush();
  return chunks;
}

/**
 * Is this block a section heading?
 *
 * Short, unpunctuated, and either markdown-marked, numbered, or title/upper
 * case. Deliberately conservative — a false positive drops a real sentence from
 * the retrievable text and replaces it with a label nobody searches for.
 */
function isHeading(block: string): boolean {
  if (block.includes("\n")) return false;
  if (block.length > 120) return false;
  if (/^#{1,6}\s+\S/.test(block)) return true;
  if (/[.!?،؟]$/.test(block)) return false;

  const words = block.split(/\s+/).length;
  if (words > 14) return false;
  if (/^\d+[.)]\s+\S/.test(block)) return true;
  if (block === block.toUpperCase() && /[A-Z؀-ۿ]/.test(block)) return true;
  // Title Case With Most Words Capitalised.
  const capitalised = block.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length;
  return words >= 2 && capitalised >= words - 1;
}

function splitLong(text: string): string[] {
  const sentences = text.split(/(?<=[.!?؟])\s+/);
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > TARGET_CHARS && current) {
      out.push(current.trim());
      current = "";
    }
    // A single sentence longer than the cap has no natural break left; a hard
    // cut is the only option and is still better than dropping it.
    current += (current ? " " : "") + sentence.slice(0, MAX_CHARS);
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** A spreadsheet as prose, so a rate sheet uploaded as KNOWLEDGE is still
 *  searchable. One line per row, labelled — a bare grid of numbers retrieves
 *  nothing, because nobody asks a question shaped like a CSV. */
export function gridToText(grid: ParsedGrid): string {
  return grid.rows
    .map((row) =>
      grid.headers
        .map((h) => (row[h] ? `${h}: ${row[h]}` : null))
        .filter(Boolean)
        .join(" · ")
    )
    .filter(Boolean)
    .join("\n\n");
}

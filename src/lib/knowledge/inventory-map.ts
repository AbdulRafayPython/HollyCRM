import type { ParsedGrid } from "./parse";

/**
 * Maps a supplier rate sheet onto the columns search_hotels() filters on.
 *
 * Everything here is deterministic string matching. It would be far easier to
 * hand the sheet to the model and ask it for JSON, and that is exactly what
 * must not happen: these rows become the prices the bot quotes to customers,
 * and a model that silently reads 1,180 as 1,880 in one row out of two hundred
 * produces a wrong quote that nobody catches until someone tries to honour it.
 *
 * Anything ambiguous is flagged rather than guessed. The operator sees the flag
 * in the preview and fixes the sheet — which is a minute of work, against an
 * incorrect price sitting live in the inventory indefinitely.
 */

export type ImportStatus = "ok" | "warning" | "error";

export interface MappedRow {
  row_no: number;
  raw: Record<string, string>;

  hotel_name: string | null;
  city: "Makkah" | "Madinah" | null;
  star_rating: number | null;
  distance_to_haram_m: number | null;
  has_shuttle: boolean | null;
  shuttle_minutes: number | null;

  room_type: string | null;
  config: "single" | "double" | "triple" | "quad" | "sharing" | null;
  capacity: number | null;

  valid_from: string | null;
  valid_to: string | null;
  price_per_night: number | null;
  currency: string;
  allotment: number;
  season_label: string | null;

  status: ImportStatus;
  issues: string[];
}

/**
 * Header aliases, because no two agencies name these columns the same way.
 *
 * Matched as substrings against the lower-cased header, longest alias first, so
 * "check out date" wins over "date". Arabic aliases are here because a
 * Saudi-market rate sheet is as likely to be in Arabic as English.
 */
const ALIASES: Record<string, string[]> = {
  hotel_name: ["hotel name", "hotel", "property", "اسم الفندق", "الفندق"],
  city: ["city", "location", "destination", "المدينة", "المكان"],
  star_rating: ["star rating", "stars", "star", "category", "rating", "نجوم", "التصنيف"],
  distance_to_haram_m: [
    "distance to haram", "distance from haram", "distance (m)", "distance",
    "walking distance", "المسافة", "بعد عن الحرم",
  ],
  shuttle_minutes: ["shuttle minutes", "shuttle time", "shuttle mins", "shuttle"],
  room_type: ["room type", "room name", "room category", "room", "نوع الغرفة", "الغرفة"],
  config: ["configuration", "occupancy", "config", "sharing type", "نوع الإقامة"],
  capacity: ["capacity", "sleeps", "max occupancy", "pax per room", "السعة"],
  valid_from: ["valid from", "date from", "start date", "check in", "from", "من تاريخ", "من"],
  valid_to: ["valid to", "date to", "end date", "check out", "until", "to", "إلى تاريخ", "إلى"],
  price_per_night: [
    "price per night", "rate per night", "nightly rate", "price/night", "per night",
    "rate", "price", "سعر الليلة", "السعر",
  ],
  currency: ["currency", "ccy", "العملة"],
  allotment: ["allotment", "rooms available", "availability", "quantity", "qty", "rooms", "الكمية"],
  season_label: ["season", "period", "label", "الموسم"],
};

export type ColumnMap = Partial<Record<keyof typeof ALIASES, string>>;

/**
 * Guesses which sheet column feeds which field.
 *
 * Longest alias first is what stops "rate" (a price alias) from claiming the
 * "star rating" column, and "to" from claiming "hotel". Each header is consumed
 * once — two fields cannot both map to the same column, because the second
 * would silently overwrite the first with the same values.
 */
export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const taken = new Set<string>();

  const candidates = Object.entries(ALIASES)
    .flatMap(([field, aliases]) => aliases.map((alias) => ({ field, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const { field, alias } of candidates) {
    if (map[field as keyof ColumnMap]) continue;
    const header = headers.find((h) => !taken.has(h) && h.includes(alias));
    if (header) {
      map[field as keyof ColumnMap] = header;
      taken.add(header);
    }
  }
  return map;
}

export function mapGrid(grid: ParsedGrid, overrides: ColumnMap = {}): MappedRow[] {
  const cols = { ...guessColumns(grid.headers), ...overrides };

  return grid.rows.map((raw, i) => {
    const issues: string[] = [];
    const get = (field: keyof ColumnMap) => {
      const col = cols[field];
      return col ? (raw[col] ?? "").trim() : "";
    };

    const hotel_name = get("hotel_name") || null;
    if (!hotel_name) issues.push("No hotel name — this row cannot be imported.");

    const city = parseCity(get("city"));
    if (!city) {
      issues.push(
        get("city")
          ? `City "${get("city")}" is neither Makkah nor Madinah.`
          : "No city — the search filters on it, so the row cannot be imported."
      );
    }

    const price = parseMoney(get("price_per_night"));
    if (get("price_per_night") && price === null) {
      issues.push(`Price "${get("price_per_night")}" is not a number.`);
    }

    const valid_from = parseDate(get("valid_from"));
    const valid_to = parseDate(get("valid_to"));
    if (get("valid_from") && !valid_from) {
      issues.push(`Start date "${get("valid_from")}" could not be read.`);
    }
    if (get("valid_to") && !valid_to) {
      issues.push(`End date "${get("valid_to")}" could not be read.`);
    }
    if (valid_from && valid_to && valid_to < valid_from) {
      issues.push("End date is before the start date.");
    }

    const room_type = get("room_type") || null;
    // Falls back to the room-type NAME: sheets very often have a "Quad Room"
    // column and no separate configuration column at all.
    const config = parseConfig(get("config") || room_type || "");
    const capacity = parseInt10(get("capacity")) ?? (config ? CAPACITY[config] : null);

    // A rate needs all four to exist as a priced date range. Missing any of
    // them means this row can still create/update the hotel, but not a price —
    // which is a legitimate use (a hotel-details sheet) and so is a warning.
    const hasRate = Boolean(room_type && config && valid_from && valid_to && price !== null);
    if (!hasRate && hotel_name && city && issues.length === 0) {
      issues.push("Hotel details only — no complete rate on this row.");
    }

    const shuttleRaw = get("shuttle_minutes");
    const shuttleMins = parseInt10(shuttleRaw);

    const status: ImportStatus =
      !hotel_name || !city || (valid_from && valid_to && valid_to < valid_from)
        ? "error"
        : issues.length > 0
          ? "warning"
          : "ok";

    return {
      row_no: i + 1,
      raw,
      hotel_name,
      city,
      star_rating: clamp(parseInt10(get("star_rating")), 1, 5),
      distance_to_haram_m: parseDistance(get("distance_to_haram_m")),
      // A blank shuttle column means "not stated", not "no shuttle" — null so
      // the commit function's coalesce leaves an existing value alone.
      has_shuttle: shuttleRaw ? shuttleMins !== null || isTruthy(shuttleRaw) : null,
      shuttle_minutes: shuttleMins,
      room_type,
      config,
      capacity: clamp(capacity, 1, 20),
      valid_from,
      valid_to,
      price_per_night: hasRate ? price : null,
      currency: (get("currency") || "SAR").toUpperCase().slice(0, 8),
      allotment: parseInt10(get("allotment")) ?? 0,
      season_label: get("season_label") || null,
      status,
      issues,
    };
  });
}

/* ---------------------------------------------------------------------------
 * Cell parsers
 * ------------------------------------------------------------------------ */

const CAPACITY: Record<NonNullable<MappedRow["config"]>, number> = {
  single: 1, double: 2, triple: 3, quad: 4, sharing: 1,
};

function parseCity(v: string): MappedRow["city"] {
  const s = v.toLowerCase();
  if (/makk?ah|mecca|مكة|مكه/.test(s)) return "Makkah";
  if (/mad[iy]n?ah|medina|المدينة|المدينه/.test(s)) return "Madinah";
  return null;
}

function parseConfig(v: string): MappedRow["config"] {
  const s = v.toLowerCase();
  // Ordered most-specific first: "quad sharing" is a quad, and testing
  // "sharing" earlier would misfile every shared quad in the sheet as capacity 1.
  if (/quad|quadruple|رباعي/.test(s)) return "quad";
  if (/triple|tripple|ثلاثي/.test(s)) return "triple";
  if (/double|twin|dbl|ثنائي|مزدوج/.test(s)) return "double";
  if (/single|sgl|فردي|مفرد/.test(s)) return "single";
  if (/shar|bed\s*space|سرير|مشترك/.test(s)) return "sharing";
  return null;
}

/** Strips currency symbols, thousands separators and trailing notes. */
function parseMoney(v: string): number | null {
  if (!v) return null;
  // "On request" / "TBA" is a real cell value in supplier sheets and is not zero.
  if (/on\s*request|tba|n\/?a|—|-{2,}/i.test(v.trim())) return null;

  const cleaned = v.replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : null;
}

/** Metres. "1.2 km" and "800m" both appear in the same sheet, routinely. */
function parseDistance(v: string): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  const metres = /km|كم/i.test(v) ? n * 1000 : n;
  return metres > 0 && metres <= 50_000 ? Math.round(metres) : null;
}

function parseInt10(v: string): number | null {
  if (!v) return null;
  const n = Number.parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number | null, lo: number, hi: number): number | null {
  if (n === null) return null;
  return n >= lo && n <= hi ? n : null;
}

function isTruthy(v: string): boolean {
  return /^(y|yes|true|1|available|نعم)$/i.test(v.trim());
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * A date cell, or null.
 *
 * The hard case is 03/04/2026, which is 3 April in every market this product
 * serves and 4 March in the one place spreadsheet software defaults to. There
 * is no way to tell them apart from the cell alone, so day-first is assumed —
 * and the ONLY reason that is safe is that this output is reviewed before it is
 * committed. An unreviewed importer must not make this guess at all.
 *
 * ISO (2026-04-03) is unambiguous and always wins when present.
 */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  // 12 Sep 2026 / 12-Sep-26 / Sep 12 2026
  const named = s.match(/^(\d{1,2})[\s\-/]*([a-z]{3,9})[\s\-/]*(\d{2,4})?$/i);
  if (named) {
    const month = MONTHS[named[2].slice(0, 4).toLowerCase()] ?? MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return build(year(named[3]), month, +named[1]);
  }
  const namedFirst = s.match(/^([a-z]{3,9})[\s\-/]+(\d{1,2}),?[\s\-/]*(\d{2,4})?$/i);
  if (namedFirst) {
    const month = MONTHS[namedFirst[1].slice(0, 4).toLowerCase()] ?? MONTHS[namedFirst[1].slice(0, 3).toLowerCase()];
    if (month) return build(year(namedFirst[3]), month, +namedFirst[2]);
  }

  const numeric = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    let day = +numeric[1];
    let month = +numeric[2];
    // Only a value above 12 proves which field is which. When it does, believe
    // it over the day-first default — a sheet exported from US-locale Excel
    // gives 09/30/2026, and reading that as day 9 of month 30 loses the row.
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return build(year(numeric[3]), month, day);
  }

  return null;
}

/** Two-digit years are this century: a rate sheet is never for 1926. */
function year(raw: string | undefined): number {
  if (!raw) return new Date().getUTCFullYear();
  const n = Number.parseInt(raw, 10);
  return n < 100 ? 2000 + n : n;
}

function build(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February, which Date silently rolls forward to 3 March.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

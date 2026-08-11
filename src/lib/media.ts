import type { MsgType } from "./types";

/** Every attachment in the app lives in this one private bucket. */
export const MEDIA_BUCKET = "wa-media";

/**
 * How long a signed media URL lives.
 *
 * The Files tab mints 15-minute links because a document is opened once and
 * discarded. A thread is different: an agent leaves a conversation open for an
 * hour and expects the voice note halfway up to still play. One hour, and the
 * thread re-signs on a timer before they expire — see MessageThread.
 */
export const MEDIA_URL_TTL_S = 3600;

export type FileKind = "audio" | "image" | "video" | "pdf" | "word" | "sheet" | "archive" | "file";

/**
 * Classifies by MIME first and extension second. Green API reports the MIME the
 * sending phone claimed, which for documents forwarded between devices is very
 * often application/octet-stream — the extension is the only signal left.
 */
export function fileKind(mime?: string | null, name?: string | null, type?: MsgType): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = extensionOf(name).toLowerCase();

  if (m.startsWith("audio/") || type === "audio") return "audio";
  if (m.startsWith("image/") || type === "image") return "image";
  if (m.startsWith("video/") || type === "video") return "video";

  if (m.includes("pdf") || ext === "pdf") return "pdf";
  if (m.includes("word") || m.includes("officedocument.wordprocessing") || ["doc", "docx", "rtf", "odt"].includes(ext))
    return "word";
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv") || ["xls", "xlsx", "csv", "ods"].includes(ext))
    return "sheet";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "file";
}

/** Short uppercase badge for the file tile — "PDF", "DOCX", "XLSX". */
export function extensionOf(name?: string | null): string {
  const clean = (name ?? "").split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 1 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1);
}

/**
 * A display name, whatever we actually have.
 *
 * Mirrored inbound media is stored as `<message-id>.<ext>` (mirrorInboundMedia),
 * so falling back to the storage path would show a UUID. When 0009's media_name
 * is empty — messages received before it landed — name the file by its kind
 * instead, which is at least true.
 */
export function displayName(
  mediaName?: string | null,
  mediaPath?: string | null,
  mime?: string | null,
  type?: MsgType
): string {
  const explicit = mediaName?.trim();
  if (explicit) return explicit;

  const base = (mediaPath ?? "").split("/").pop() ?? "";
  const ext = extensionOf(base) || extensionOf(mime?.split("/")[1] ? `x.${mime!.split("/")[1]}` : "");
  const looksLikeId = /^[0-9a-f-]{16,}$/i.test(base.replace(/\.[^.]+$/, ""));

  if (base && !looksLikeId) return base;

  const kind = fileKind(mime, base, type);
  const label =
    kind === "audio" ? "Voice message"
    : kind === "image" ? "Photo"
    : kind === "video" ? "Video"
    : "Document";
  return ext ? `${label}.${ext}` : label;
}

/** 1.4 MB, 812 KB — one decimal, never "1024 KB". */
export function prettyBytes(bytes?: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** m:ss — voice notes are never long enough to need hours. */
export function clockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Recording format, in order of preference.
 *
 * The target is always Ogg/Opus — WhatsApp's own voice note format, and the one
 * container the Green API gateway reliably accepts for audio. So: native Ogg
 * first if a browser ever offers it, then Opus-in-WebM, which the server
 * rewraps to Ogg with no re-encode (see lib/audio/webmToOgg).
 *
 * mp4 is LAST and is a dead end, not a shortcut. Despite the `.m4a` extension
 * being documented as supported, the gateway rejects the recording outright with
 * "mime type audio/mp4 is not supported", and AAC cannot be rewrapped into Ogg
 * the way Opus can — it is a different codec, not just a different container.
 * It stays in the list only so Safari (which records nothing else) reaches the
 * voice route and gets a real explanation instead of "cannot record audio".
 *
 * Order matters, and getting it wrong is the whole bug: preferring mp4 over WebM
 * made Chromium — which records both — pick the container that cannot be sent.
 */
export const RECORDER_MIME_PREFERENCE = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDER_MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Container extension for a recorder MIME — the filename WhatsApp will show. */
export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/webm") return "webm";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/mpeg") return "mp3";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  return base.split("/")[1] || "bin";
}

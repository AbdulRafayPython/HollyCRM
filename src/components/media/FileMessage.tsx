"use client";

import Icon, { type IconName } from "../ui/Icon";
import { extensionOf, fileKind, type FileKind } from "@/lib/media";

/** Tile colour per family, so a passport PDF and a rate sheet differ at a glance. */
const TILE: Record<FileKind, { icon: IconName; className: string }> = {
  pdf: { icon: "file", className: "bg-danger-soft text-danger-dark" },
  word: { icon: "file", className: "bg-brand-soft text-brand-dark" },
  sheet: { icon: "file", className: "bg-wa-soft text-wa-dark" },
  archive: { icon: "archive", className: "bg-bot-soft text-bot-dark" },
  image: { icon: "image", className: "bg-group-soft text-brand-dark" },
  video: { icon: "video", className: "bg-group-soft text-brand-dark" },
  audio: { icon: "mic", className: "bg-brand-soft text-brand-dark" },
  file: { icon: "file", className: "bg-surface text-muted" },
};

/**
 * Document attachment.
 *
 * Two actions, deliberately separate: **Open** previews in a browser tab (PDFs
 * and images render natively) while **Download** saves the original. An agent
 * checking a passport number wants the first and never the second.
 */
export default function FileMessage({
  url,
  name,
  mime,
  onBrand = false,
}: {
  url: string | null;
  name: string;
  mime?: string | null;
  onBrand?: boolean;
}) {
  const kind = fileKind(mime, name);
  const tile = TILE[kind];
  const ext = extensionOf(name).toUpperCase();

  // Inside the violet bubble the tile's soft pastel would vanish, so the whole
  // card flips to a translucent white treatment.
  const shell = onBrand
    ? "border-white/25 bg-white/10"
    : "border-edge bg-card";
  const title = onBrand ? "text-white" : "text-ink";
  const sub = onBrand ? "text-white/70" : "text-muted";
  const action = onBrand
    ? "text-white hover:bg-white/15"
    : "text-brand hover:bg-brand-soft";

  return (
    <div className={`flex min-w-[15rem] max-w-full items-center gap-3 rounded-lg border p-2.5 ${shell}`}>
      <span
        className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded ${
          onBrand ? "bg-white/15 text-white" : tile.className
        }`}
      >
        {ext ? (
          <span className="text-[9px] font-bold leading-none tracking-tight">{ext.slice(0, 4)}</span>
        ) : (
          <Icon name={tile.icon} size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block truncate text-body font-medium ${title}`} title={name}>
          {name}
        </span>
        <span className={`block text-caption ${sub}`}>
          {kind === "file" ? "Attachment" : kind.toUpperCase()}
          {!url && " · link expired"}
        </span>
      </span>

      {url && (
        <span className="flex shrink-0 items-center gap-0.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`rounded px-2 py-1 text-caption font-medium transition-colors duration-150 ease-swift ${action}`}
          >
            Open
          </a>
          <a
            href={url}
            download={name}
            title="Download"
            className={`rounded p-1.5 transition-colors duration-150 ease-swift ${action}`}
          >
            <Icon name="download" size={14} />
          </a>
        </span>
      )}
    </div>
  );
}

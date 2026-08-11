"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";

/**
 * Photo attachment — customers send hotel screenshots, passport photos and
 * payment slips constantly, and an agent should read them without leaving the
 * thread. Click opens a full-size lightbox; the thumbnail is capped so a tall
 * portrait scan cannot push the rest of the conversation off screen.
 *
 * Rendered with a plain <img>: next/image would need the Supabase host in
 * remotePatterns, and these are signed one-hour URLs on a private bucket, so
 * the optimizer could neither cache nor re-fetch them usefully.
 */
export default function ImageMessage({
  url,
  name,
  onBrand = false,
}: {
  url: string | null;
  name: string;
  onBrand?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!url || broken) {
    return (
      <span
        className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-caption ${
          onBrand ? "border-white/30 text-white/80" : "border-edge-strong text-muted"
        }`}
      >
        <Icon name="image" size={14} />
        {name} — preview unavailable
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block overflow-hidden rounded-lg"
        title="Open full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          onError={() => setBroken(true)}
          className="max-h-72 w-auto max-w-full object-cover transition duration-150 ease-swift group-hover:opacity-95"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-ink/80 p-6"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="close" size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain shadow-pop"
          />
          <a
            href={url}
            download={name}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-body text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <Icon name="download" size={16} />
            Download
          </a>
        </div>
      )}
    </>
  );
}

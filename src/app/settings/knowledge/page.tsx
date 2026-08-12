"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/**
 * Settings → Knowledge. Where a workspace uploads what the agent should know.
 *
 * The page is deliberately two lists rather than one, because the two kinds of
 * source have different consequences. A rate sheet becomes prices quoted to
 * customers and gets a mandatory review step; a policy document only ever
 * informs prose and goes live as soon as it parses. Presenting them together
 * would invite an operator to treat both as "upload and forget".
 */

type Purpose = "knowledge" | "inventory";
type Status = "pending" | "processing" | "ready" | "failed";

interface Source {
  id: string;
  purpose: Purpose;
  kind: "pdf" | "csv" | "xlsx" | "gsheet" | "text";
  title: string;
  storage_path: string | null;
  source_url: string | null;
  status: Status;
  error: string | null;
  byte_size: number | null;
  chunk_count: number;
  row_count: number;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface PreviewRow {
  id: string; row_no: number;
  hotel_name: string | null; city: string | null; star_rating: number | null;
  distance_to_haram_m: number | null;
  room_type: string | null; config: string | null; capacity: number | null;
  valid_from: string | null; valid_to: string | null;
  price_per_night: number | null; currency: string; allotment: number;
  season_label: string | null;
  status: "ok" | "warning" | "error"; issues: string[];
}

interface Preview {
  rows: PreviewRow[];
  counts: { total: number; errors: number; warnings: number; importable: number };
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; data: Preview } | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/knowledge");
    if (!res.ok) return setError("Could not load sources");
    setSources((await res.json()).sources);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Parsing happens in the background, so the row arrives as "processing" and
  // changes underneath the page. Polling only while something is actually in
  // flight — a settings screen that polls forever is a settings screen that
  // keeps a laptop awake.
  const pending = sources.some((s) => s.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [pending, load]);

  async function call(init: RequestInit & { url?: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(init.url ?? "/api/settings/knowledge", init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return null;
      }
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(id: string) {
    const res = await fetch(`/api/settings/knowledge/preview?source_id=${id}`);
    if (!res.ok) return setError("Could not load the preview");
    setPreview({ id, data: await res.json() });
  }

  const inventory = sources.filter((s) => s.purpose === "inventory");
  const knowledge = sources.filter((s) => s.purpose === "knowledge");

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/settings" className="btn-ghost rounded-full p-1.5" title="Back to settings">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-h1 text-ink">Knowledge & imports</h1>
        <span className="text-meta text-muted">{sources.length} sources</span>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <section className="space-y-3">
            <SectionHeading
              icon="receipt"
              title="Rate sheets"
              blurb="Excel, CSV or a Google Sheet of hotels, room types and seasonal prices. Parsed into a preview you check before anything goes live — the agent only ever quotes prices from the reviewed result."
            />
            <AddSource purpose="inventory" onDone={load} setError={setError} />
            {inventory.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                busy={busy}
                onPreview={() => openPreview(s.id)}
                onResync={() => call({
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "resync", id: s.id }),
                })}
                onToggle={() => call({
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "toggle", id: s.id, is_active: !s.is_active }),
                })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete “${s.title}”?`,
                    body: "The file and its staged rows are removed. Hotels and rates already imported from it stay — delete those from Inventory if you want them gone.",
                    confirmLabel: "Delete source",
                    tone: "danger",
                  });
                  if (ok) call({ url: `/api/settings/knowledge?id=${s.id}`, method: "DELETE" });
                }}
              />
            ))}
            {inventory.length === 0 && <Empty>No rate sheets imported yet.</Empty>}
          </section>

          <section className="space-y-3">
            <SectionHeading
              icon="file"
              title="Knowledge base"
              blurb="Visa rules, transport, payment terms, cancellation policy, FAQs — PDF, text or a link. The agent answers questions from these documents, and says a colleague will confirm when they don't cover it. Never used as a price source."
            />
            <AddSource purpose="knowledge" onDone={load} setError={setError} />
            {knowledge.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                busy={busy}
                onResync={s.source_url ? () => call({
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "resync", id: s.id }),
                }) : undefined}
                onToggle={() => call({
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "toggle", id: s.id, is_active: !s.is_active }),
                })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete “${s.title}”?`,
                    body: "The agent will stop answering from this document immediately.",
                    confirmLabel: "Delete source",
                    tone: "danger",
                  });
                  if (ok) call({ url: `/api/settings/knowledge?id=${s.id}`, method: "DELETE" });
                }}
              />
            ))}
            {knowledge.length === 0 && <Empty>No documents yet — the agent hands every non-price question to a human.</Empty>}
          </section>
        </div>
      </div>

      {preview && (
        <PreviewModal
          preview={preview.data}
          busy={busy}
          onClose={() => setPreview(null)}
          onCommit={async () => {
            const result = await call({
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "commit", id: preview.id }),
            });
            if (result) setPreview(null);
          }}
        />
      )}

      {dialog}
    </div>
  );
}

function SectionHeading({ icon, title, blurb }: {
  icon: "receipt" | "file"; title: string; blurb: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-h3 text-ink">
        <Icon name={icon} size={16} className="text-brand" />
        {title}
      </h2>
      <p className="mt-1 text-meta text-muted">{blurb}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-edge p-4 text-center text-caption text-subtle">
      {children}
    </p>
  );
}

/** Upload a file, link a sheet, or paste a note — one control, three tabs. */
function AddSource({ purpose, onDone, setError }: {
  purpose: Purpose;
  onDone: () => void;
  setError: (e: string | null) => void;
}) {
  const [tab, setTab] = useState<"file" | "link" | "text">("file");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const accept =
    purpose === "inventory"
      ? ".csv,.xlsx,.xls"
      : ".pdf,.csv,.xlsx,.xls,.txt,.md";

  async function submit(body: BodyInit, headers?: HeadersInit) {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/settings/knowledge", { method: "POST", body, headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Upload failed");
      setUrl(""); setTitle(""); setText("");
      if (fileInput.current) fileInput.current.value = "";
      onDone();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex gap-1">
        {(["file", "link", "text"] as const)
          // Pasted notes are prose; there is no such thing as a pasted rate sheet
          // we would trust enough to price from.
          .filter((t) => !(purpose === "inventory" && t === "text"))
          .map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-caption font-medium ${
                tab === t ? "bg-brand/10 text-brand" : "text-muted hover:text-ink"
              }`}
            >
              {t === "file" ? "Upload file" : t === "link" ? "Google Sheet / link" : "Paste text"}
            </button>
          ))}
      </div>

      {tab === "file" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={accept}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set("file", file);
              form.set("purpose", purpose);
              submit(form);
            }}
            className="text-caption text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-caption file:font-medium file:text-white"
          />
          <span className="text-caption text-subtle">
            {purpose === "inventory" ? "CSV or Excel · max 25 MB" : "PDF, Excel, CSV or text · max 25 MB"}
          </span>
        </div>
      )}

      {tab === "link" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="field min-w-64 flex-1 rounded-lg py-2 text-meta"
            />
            <input
              placeholder="Name (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field w-40 rounded-lg py-2 text-meta"
            />
            <button
              disabled={uploading || !url.trim()}
              onClick={() => submit(
                JSON.stringify({ purpose, url, title }),
                { "Content-Type": "application/json" }
              )}
              className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
            >
              {uploading ? "Reading…" : "Add"}
            </button>
          </div>
          <p className="text-caption text-subtle">
            Share the sheet as <strong>Anyone with the link — Viewer</strong>. A private sheet
            returns Google&rsquo;s sign-in page instead of your data. Re-sync any time to pull the
            latest version.
          </p>
        </div>
      )}

      {tab === "text" && (
        <div className="space-y-2">
          <input
            placeholder="Title, e.g. Cancellation policy"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field w-full rounded-lg py-2 text-meta"
          />
          <textarea
            rows={5}
            placeholder="Paste policies, FAQs, or anything the agent should be able to answer…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field w-full resize-y rounded-lg py-2 text-meta"
          />
          <button
            disabled={uploading || !text.trim()}
            onClick={() => submit(
              JSON.stringify({ purpose: "knowledge", text, title }),
              { "Content-Type": "application/json" }
            )}
            className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
          >
            {uploading ? "Saving…" : "Save note"}
          </button>
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, busy, onPreview, onResync, onToggle, onDelete }: {
  source: Source;
  busy: boolean;
  onPreview?: () => void;
  onResync?: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const tone =
    source.status === "ready" ? "wa"
    : source.status === "failed" ? "danger"
    : source.status === "processing" ? "bot"
    : "neutral";

  const label =
    source.status === "ready"
      ? source.purpose === "inventory"
        ? `Imported · ${source.row_count} rows`
        : `Live · ${source.chunk_count} passages`
      : source.status === "processing" ? "Reading…"
      : source.status === "failed" ? "Failed"
      : `${source.row_count} rows awaiting review`;

  return (
    <div className={`panel space-y-2 p-4 ${source.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <Icon
          name={source.kind === "pdf" ? "file" : source.kind === "text" ? "compose" : "receipt"}
          size={16}
          className="mt-0.5 shrink-0 text-subtle"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body font-semibold text-ink">{source.title}</span>
            <Chip tone={tone}>{label}</Chip>
            {!source.is_active && <Chip tone="neutral">Hidden from AI</Chip>}
          </div>
          <p className="mt-0.5 text-caption text-muted">
            {source.kind.toUpperCase()}
            {source.byte_size ? ` · ${(source.byte_size / 1024).toFixed(0)} KB` : ""}
            {source.last_synced_at
              ? ` · synced ${new Date(source.last_synced_at).toLocaleDateString()}`
              : ""}
          </p>
          {source.error && (
            <p className="mt-1.5 rounded-lg border border-danger/25 bg-danger-soft p-2 text-caption text-danger-dark">
              {source.error}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-2 text-caption font-medium">
        {onPreview && source.row_count > 0 && (
          <button onClick={onPreview} className="text-brand hover:underline">
            Review {source.row_count} rows
          </button>
        )}
        {onResync && (
          <button disabled={busy} onClick={onResync} className="text-muted hover:text-ink disabled:opacity-40">
            Re-sync
          </button>
        )}
        <button disabled={busy} onClick={onToggle} className="text-muted hover:text-ink disabled:opacity-40">
          {source.is_active ? "Hide from AI" : "Show to AI"}
        </button>
        <button onClick={onDelete} className="ml-auto text-danger hover:underline">
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * The review step. Errors are listed first by the API, and the commit button
 * states the number of rows it will actually write — an operator who imports
 * "200 rows" and finds 187 hotels afterwards has lost confidence in the whole
 * feature, whether or not the 13 were legitimately skipped.
 */
function PreviewModal({ preview, busy, onClose, onCommit }: {
  preview: Preview; busy: boolean; onClose: () => void; onCommit: () => void;
}) {
  const { counts, rows } = preview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="panel flex max-h-[85vh] w-full max-w-4xl flex-col p-0">
        <header className="flex shrink-0 items-center gap-3 border-b border-edge p-4">
          <h2 className="text-h3 text-ink">Review before importing</h2>
          <div className="flex gap-1.5">
            <Chip tone="wa">{counts.importable} importable</Chip>
            {counts.warnings > 0 && <Chip tone="bot">{counts.warnings} with warnings</Chip>}
            {counts.errors > 0 && <Chip tone="danger">{counts.errors} skipped</Chip>}
          </div>
          <button onClick={onClose} className="btn-ghost ml-auto rounded-full p-1.5">
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full text-caption">
            <thead className="sticky top-0 bg-card text-subtle">
              <tr className="text-left">
                <th className="font-normal">#</th>
                <th className="font-normal">Hotel</th>
                <th className="font-normal">City</th>
                <th className="font-normal">Room</th>
                <th className="font-normal">Dates</th>
                <th className="text-right font-normal">Price</th>
                <th className="text-right font-normal">Rooms</th>
                <th className="font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-edge/60 ${r.status === "error" ? "bg-danger-soft/40" : ""}`}
                >
                  <td className="py-1.5 text-subtle">{r.row_no}</td>
                  <td className="py-1.5 font-medium text-ink">{r.hotel_name ?? "—"}</td>
                  <td className="py-1.5">{r.city ?? "—"}</td>
                  <td className="py-1.5">
                    {r.room_type ?? "—"}
                    {r.config ? <span className="text-subtle"> · {r.config}</span> : null}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    {r.valid_from && r.valid_to ? `${r.valid_from} → ${r.valid_to}` : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.price_per_night !== null ? `${r.currency} ${Number(r.price_per_night).toLocaleString()}` : "—"}
                  </td>
                  <td className="py-1.5 text-right">{r.allotment}</td>
                  <td className="py-1.5 text-muted">{r.issues.join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-6 text-center text-caption text-subtle">
              No rows were parsed from this file.
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-edge p-4">
          <p className="text-caption text-muted">
            Importing updates hotels and room types it already knows, and replaces any existing
            price for the same room and dates.
          </p>
          <button onClick={onClose} className="btn-ghost ml-auto rounded-lg px-4 py-2 text-meta">
            Cancel
          </button>
          <button
            disabled={busy || counts.importable === 0}
            onClick={onCommit}
            className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
          >
            {busy ? "Importing…" : `Import ${counts.importable} rows`}
          </button>
        </footer>
      </div>
    </div>
  );
}

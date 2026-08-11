"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Chip from "./ui/Chip";
import Icon from "./ui/Icon";

interface DocRow {
  id: string;
  kind: string;
  storage_path: string;
  created_at: string;
  url: string | null;
}

const KINDS = ["passport", "visa", "voucher", "receipt", "other"] as const;

/**
 * Passports, visas, vouchers, receipts.
 *
 * Everything lands in a private bucket; the links below are 15-minute signed
 * URLs. "Send to WhatsApp" mints a separate short-lived URL per send — the file
 * is never published at a permanent public address.
 */
export default function DocumentsPanel({
  chatId,
  leadId,
}: {
  chatId: string;
  leadId: string | null;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [kind, setKind] = useState<string>("passport");
  const [send, setSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/chats/${chatId}/documents`);
    if (res.ok) setDocs((await res.json()).documents ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    form.append("send", String(send));
    if (leadId) form.append("leadId", leadId);

    const res = await fetch(`/api/chats/${chatId}/documents`, { method: "POST", body: form });
    setBusy(false);
    e.target.value = "";

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Upload failed");
    if (json.error) setError(`Uploaded, but not sent: ${json.error}`);
    await load();
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-edge p-3">
        <div className="relative">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="field appearance-none py-1.5 pr-8 text-meta"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>

        <label className="flex items-center gap-2 text-meta text-muted">
          <input
            type="checkbox"
            checked={send}
            onChange={(e) => setSend(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-edge-strong text-brand focus:ring-brand/30"
          />
          Also send to this WhatsApp chat
        </label>

        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-edge-strong px-3 py-4 text-center transition duration-150 ease-swift hover:border-brand hover:bg-brand-soft">
          <Icon name="paperclip" size={18} className="text-muted" />
          <span className="text-meta font-medium text-ink">
            {busy ? "Uploading…" : "Choose a file"}
          </span>
          <span className="text-caption text-subtle">Private storage · links expire in 15 min</span>
          <input type="file" className="hidden" onChange={upload} disabled={busy} />
        </label>

        {error && <p className="text-caption text-bot-dark">{error}</p>}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {docs.length === 0 && <p className="text-meta text-muted">No documents yet.</p>}
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 rounded-lg border border-edge bg-card p-2.5 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-surface text-muted">
              <Icon name="file" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-meta font-medium text-ink">
                {d.storage_path.split("/").pop()}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <Chip tone="neutral">{d.kind}</Chip>
                <span className="text-caption text-subtle">{stamp(d.created_at)}</span>
              </p>
            </div>
            {d.url && (
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost px-2 py-1 text-caption text-brand hover:bg-brand-soft"
              >
                Open
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function stamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

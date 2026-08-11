"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface InstanceRow {
  id: string;
  instance_id: string;
  api_url: string | null;
  phone: string | null;
  own_jid: string | null;
  state: string;
  is_active: boolean;
}

/**
 * Settings → WhatsApp. Connect a Green API instance with three fields; the
 * server validates the credentials live and pushes the webhook configuration
 * to Green API automatically. Multiple numbers can be registered; the radio
 * chooses which one the CRM sends from.
 */
export default function WhatsAppSettingsPage() {
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [idInstance, setIdInstance] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookBase, setWebhookBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function load() {
    const res = await fetch("/api/settings/instances");
    if (res.ok) setInstances((await res.json()).instances ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // Prefill the webhook base with the current origin — right when deployed,
    // needs replacing with the tunnel URL in local dev.
    setWebhookBase(window.location.origin.startsWith("https") ? window.location.origin : "");
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/settings/instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiUrl, idInstance, apiToken, webhookBaseUrl: webhookBase }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Connection failed");
      return;
    }
    setNotice(json.hint ?? "Connected.");
    setShowForm(false);
    setApiToken("");
    load();
  }

  async function activate(id: string) {
    setError(null);
    const res = await fetch(`/api/settings/instances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: true }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
    load();
  }

  async function remove(id: string, label: string) {
    const ok = await confirm({
      title: "Remove this WhatsApp connection?",
      body: `${label} will be disconnected from the CRM. Conversations, leads and message history are all kept — only the connection is removed.`,
      confirmLabel: "Remove connection",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/settings/instances/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
    load();
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/settings" className="btn-ghost rounded-full p-1.5" title="Back to settings">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-h1 text-ink">WhatsApp connections</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-meta"
        >
          <Icon name="plus" size={15} />
          Connect a number
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {notice && (
            <p className="flex items-start gap-2 rounded-lg border border-wa/25 bg-wa-soft p-3 text-meta text-ink">
              <Icon name="check" size={15} className="mt-px text-wa" />
              {notice}
            </p>
          )}
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px" />
              {error}
            </p>
          )}

          {showForm && (
            <form onSubmit={connect} className="panel space-y-3 p-5">
              <h2 className="text-h3 text-ink">Connect a Green API instance</h2>
              <ol className="list-decimal space-y-1 pl-5 text-meta text-muted">
                <li>Create an instance at <span className="text-ink">console.green-api.com</span> and scan the QR with the WhatsApp you want to use.</li>
                <li>Copy the three values from the instance page into the fields below.</li>
                <li>We check them live and set up message delivery automatically — nothing to paste back into the console.</li>
              </ol>

              <Field label="apiUrl" hint="e.g. https://7107.api.greenapi.com">
                <input className="field rounded-lg py-2.5 text-meta" value={apiUrl} required
                  placeholder="https://7107.api.greenapi.com"
                  onChange={(e) => setApiUrl(e.target.value)} />
              </Field>
              <Field label="idInstance">
                <input className="field rounded-lg py-2.5 text-meta" value={idInstance} required
                  placeholder="7107123456" onChange={(e) => setIdInstance(e.target.value)} />
              </Field>
              <Field label="apiTokenInstance">
                <input className="field rounded-lg py-2.5 text-meta" value={apiToken} required
                  type="password" placeholder="••••••••••••" onChange={(e) => setApiToken(e.target.value)} />
              </Field>
              <Field
                label="Public app URL"
                hint="Where WhatsApp messages are delivered. Local dev: paste your tunnel URL (https://…trycloudflare.com)."
              >
                <input className="field rounded-lg py-2.5 text-meta" value={webhookBase} required
                  placeholder="https://your-app.example.com"
                  onChange={(e) => setWebhookBase(e.target.value)} />
              </Field>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost rounded-lg px-4 py-2 text-meta">
                  Cancel
                </button>
                <button disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40">
                  {busy ? "Checking with Green API…" : "Test & connect"}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-center text-meta text-muted">Loading…</p>
          ) : instances.length === 0 && !showForm ? (
            <div className="panel p-8 text-center">
              <Icon name="chat" size={28} className="mx-auto text-subtle" />
              <p className="mt-3 text-body text-muted">No WhatsApp connected yet.</p>
              <p className="mt-1 text-meta text-subtle">
                Click “Connect a number” — it takes about two minutes.
              </p>
            </div>
          ) : (
            instances.map((i) => (
              <div key={i.id} className="panel flex items-center gap-4 p-4">
                <input
                  type="radio"
                  name="active-instance"
                  checked={i.is_active}
                  onChange={() => activate(i.id)}
                  title="Use this number for sending"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-body font-medium text-ink">
                    {i.phone ? `+${i.phone}` : `Instance ${i.instance_id}`}
                    {i.is_active && <Chip tone="brand">In use</Chip>}
                  </p>
                  <p className="mt-0.5 text-caption text-muted">
                    {i.instance_id} · {i.api_url ?? "default host"}
                  </p>
                </div>
                <Chip tone={i.state === "authorized" ? "wa" : "danger"}>
                  {i.state === "authorized" ? "Connected" : i.state}
                </Chip>
                {i.state !== "authorized" && (
                  <span className="text-caption text-muted">scan QR in console</span>
                )}
                <button
                  onClick={() => remove(i.id, i.phone ? `+${i.phone}` : `Instance ${i.instance_id}`)}
                  className="btn-ghost rounded-full p-1.5"
                  title="Remove connection"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))
          )}

          <p className="text-center text-caption text-subtle">
            The AI replies from whichever number is marked “In use”. Switching takes effect within 30 seconds.
          </p>
        </div>
      </div>

      {dialog}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2">
        <span className="text-meta font-medium text-ink">{label}</span>
        {hint && <span className="text-caption text-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

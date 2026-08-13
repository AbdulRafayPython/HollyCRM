"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface Provider {
  id: string; provider: string; label: string | null; model: string;
  base_url: string | null; key_hint: string | null; is_active: boolean;
  max_tokens: number; temperature: number;
  /** "environment" entries come from the server's .env and are read-only here. */
  source?: "workspace" | "environment";
}

interface ConnectionTest {
  ok: boolean;
  provider?: string;
  model?: string;
  source?: "workspace" | "deployment";
  latencyMs: number;
  error?: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
  custom: "Custom (OpenAI-compatible)",
};

/**
 * Settings → Model. Which model answers customers, and with whose key.
 *
 * The key is write-only by design: it goes into Vault through a database
 * function and comes back only as a four-character hint. Nothing on this page —
 * or in the route behind it — can read one out again.
 */
export default function LlmPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<ConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/llm");
    if (!res.ok) {
      setError(res.status === 403 ? "Only a supervisor can configure the model." : "Could not load");
      return;
    }
    const j = await res.json();
    setProviders(j.providers); setModels(j.models); setConnected(Boolean(j.connected));
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * Verify on open, not on request.
   *
   * "Connected" claimed from the presence of a key is a claim that survives a
   * revoked key, an empty balance and a wrong base URL. Running the check when
   * the page loads means the badge reflects what a customer would actually get.
   */
  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/llm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      setTest(res.ok ? await res.json() : null);
    } catch {
      setTest(null);
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => { if (connected) runTest(); }, [connected, runTest]);

  async function send(method: string, body: unknown, url = "/api/settings/llm") {
    setError(null); setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Failed");
        return false;
      }
      await load();
      return true;
    } finally { setBusy(false); }
  }

  const active = providers.find((p) => p.is_active);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-card px-6">
        <Link href="/settings" className="btn-ghost rounded-full p-1.5" title="Back to settings">
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </Link>
        <h1 className="text-h1 text-ink">Model & API keys</h1>
        {/* The badge reports the LIVE check where one has run, and falls back to
            configuration state before it completes — never "not configured"
            while a working key is answering customers. */}
        {testing ? (
          <Chip tone="neutral">Checking connection…</Chip>
        ) : test ? (
          test.ok ? (
            <Chip tone="wa">
              Connected · {PROVIDER_LABEL[test.provider ?? ""] ?? test.provider} · {test.model}
            </Chip>
          ) : (
            <Chip tone="danger">Connection failed</Chip>
          )
        ) : active ? (
          <Chip tone="wa">{PROVIDER_LABEL[active.provider]} · {active.model}</Chip>
        ) : connected ? (
          <Chip tone="wa">Connected</Chip>
        ) : (
          <Chip tone="danger">No model configured</Chip>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            disabled={testing || !connected}
            onClick={runTest}
            className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-2 text-meta disabled:opacity-40"
          >
            <Icon name="bolt" size={14} />
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button onClick={() => setAdding((v) => !v)}
            className="btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-meta">
            <Icon name="plus" size={14} />Add model
          </button>
        </span>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft p-3 text-meta text-danger-dark">
              <Icon name="alert" size={15} className="mt-px shrink-0" />{error}
            </p>
          )}

          {test && (
            <p className={`flex items-start gap-2 rounded-lg border p-3 text-meta ${
              test.ok
                ? "border-wa/25 bg-wa-soft text-wa-dark"
                : "border-danger/25 bg-danger-soft text-danger-dark"
            }`}>
              <Icon name={test.ok ? "check" : "alert"} size={15} className="mt-px shrink-0" />
              <span>
                {test.ok ? (
                  <>
                    <strong>The agent is connected and replying.</strong>{" "}
                    Live check answered in {(test.latencyMs / 1000).toFixed(1)}s using{" "}
                    {PROVIDER_LABEL[test.provider ?? ""] ?? test.provider} {test.model}
                    {test.source === "deployment" ? ", via the deployment key." : ", via this workspace's key."}
                  </>
                ) : (
                  <>
                    <strong>The agent cannot reach the model.</strong> {test.error}{" "}
                    Customers will not get AI replies until this is fixed.
                  </>
                )}
              </span>
            </p>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-edge bg-card p-3 text-caption text-muted">
            <Icon name="lock" size={14} className="mt-px shrink-0 text-muted" />
            <span>
              Keys are encrypted at rest in Supabase Vault and are never sent back to this
              page — only the last four characters, so you can tell two keys apart. To
              change a key, paste a new one; there is no way to reveal the old one.
            </span>
          </p>

          {adding && (
            <AddForm
              models={models}
              busy={busy}
              onCancel={() => setAdding(false)}
              onSave={async (p) => { if (await send("POST", p)) setAdding(false); }}
            />
          )}

          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              models={models}
              busy={busy}
              onActivate={() => send("PATCH", { action: "activate", id: p.id })}
              onKey={(api_key) => send("PATCH", { action: "key", id: p.id, api_key })}
              onUpdate={(patch) => send("PATCH", { action: "update", id: p.id, ...patch })}
              onDelete={async () => {
                const ok = await confirm({
                  title: `Delete this ${PROVIDER_LABEL[p.provider]} configuration?`,
                  body: p.is_active
                    ? "It's the active model. The agent will fall back to the deployment's shared key, or stop replying if there isn't one."
                    : "The stored key is destroyed. This cannot be undone.",
                  confirmLabel: "Delete",
                  tone: "danger",
                });
                if (ok) send("DELETE", null, `/api/settings/llm?id=${p.id}`);
              }}
            />
          ))}

          {providers.length === 0 && !adding && (
            <p className="rounded-lg border border-dashed border-danger/30 bg-danger-soft/40 p-6 text-center text-meta text-danger-dark">
              No model configured. The agent cannot reply to anyone until you add one.
            </p>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
}

function ProviderCard({ provider: p, models, busy, onActivate, onKey, onUpdate, onDelete }: {
  provider: Provider;
  models: Record<string, string[]>;
  busy: boolean;
  onActivate: () => void;
  onKey: (key: string) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const options = models[p.provider] ?? [];
  const fromEnv = p.source === "environment";

  return (
    <div className={`panel p-0 ${p.is_active ? "ring-2 ring-wa/25" : ""}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          p.is_active ? "bg-wa-soft text-wa-dark" : "bg-surface text-muted"
        }`}>
          <Icon name="bot" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">
              {p.label || PROVIDER_LABEL[p.provider]}
            </span>
            {p.is_active && <Chip tone="wa">Active</Chip>}
            {fromEnv && <Chip tone="neutral">From server environment</Chip>}
            {!p.key_hint && <Chip tone="danger">No key</Chip>}
          </div>
          <p className="mt-0.5 text-caption text-muted">
            {p.model}
            {p.key_hint ? ` · key ${p.key_hint}` : ""}
            {p.base_url ? ` · ${p.base_url}` : ""}
          </p>
        </div>
        {!p.is_active && !fromEnv && (
          <button disabled={busy || !p.key_hint} onClick={onActivate}
            title={p.key_hint ? undefined : "Add an API key first"}
            className="btn-primary rounded-lg px-3 py-1.5 text-caption disabled:opacity-40">
            Make active
          </button>
        )}
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost rounded-full p-1.5">
          <Icon name="chevronDown" size={15} className={open ? "" : "-rotate-90"} />
        </button>
      </div>

      {/* The deployment key is a view of the server's environment, so it opens
          to an explanation rather than to editable fields — controls that
          silently do nothing are worse than no controls. */}
      {open && fromEnv && (
        <div className="space-y-2 border-t border-edge p-4">
          <dl className="grid gap-1.5 text-caption sm:grid-cols-2">
            {[
              ["Provider", PROVIDER_LABEL[p.provider]],
              ["Model", p.model],
              ["Endpoint", p.base_url ?? "provider default"],
              ["Key", p.key_hint ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-20 shrink-0 text-subtle">{k}</dt>
                <dd className="min-w-0 flex-1 truncate font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-lg border border-edge bg-surface p-3 text-caption leading-relaxed text-muted">
            This key is set in the server environment and is shared by everything running on
            this deployment. It works and it is answering customers now. To give this
            workspace its own key, billing and model — and to manage it from here rather
            than from a config file — add a model above; it takes over automatically.
          </p>
        </div>
      )}

      {open && !fromEnv && (
        <div className="space-y-3 border-t border-edge p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-52 flex-1">
              <span className="mb-1 block text-caption font-medium text-ink">
                {p.key_hint ? "Replace API key" : "API key"}
              </span>
              <input
                type="password"
                autoComplete="off"
                placeholder={p.key_hint ? `Currently ${p.key_hint}` : "sk-…"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="field w-full rounded-lg py-2 text-meta"
              />
            </label>
            <button
              disabled={busy || key.trim().length < 8}
              onClick={() => { onKey(key.trim()); setKey(""); }}
              className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
            >
              Save key
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Model</span>
              {options.length ? (
                <select className="field w-full rounded-lg py-2 text-meta" defaultValue={p.model}
                  onChange={(e) => onUpdate({ model: e.target.value })}>
                  {options.map((m) => <option key={m}>{m}</option>)}
                  {!options.includes(p.model) && <option>{p.model}</option>}
                </select>
              ) : (
                <input className="field w-full rounded-lg py-2 text-meta" defaultValue={p.model}
                  onBlur={(e) => onUpdate({ model: e.target.value })} />
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Max tokens</span>
              <input type="number" min={64} max={8000} className="field w-full rounded-lg py-2 text-meta"
                defaultValue={p.max_tokens} onBlur={(e) => onUpdate({ max_tokens: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-caption font-medium text-ink">Temperature</span>
              <input type="number" min={0} max={2} step={0.1} className="field w-full rounded-lg py-2 text-meta"
                defaultValue={p.temperature} onBlur={(e) => onUpdate({ temperature: Number(e.target.value) })} />
            </label>
          </div>
          <p className="text-caption text-subtle">
            These are defaults. Steps that need a specific setting keep it — the extractor
            always runs at temperature 0, because a creative JSON extractor is a broken one.
          </p>

          <div className="flex justify-end border-t border-edge pt-3">
            <button onClick={onDelete} className="text-caption font-medium text-danger hover:underline">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({ models, busy, onSave, onCancel }: {
  models: Record<string, string[]>;
  busy: boolean;
  onSave: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState(models.deepseek?.[0] ?? "deepseek-chat");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const options = models[provider] ?? [];

  return (
    <div className="panel space-y-3 p-5">
      <h2 className="text-h3 text-ink">Add a model</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Provider</span>
          <select
            className="field w-full rounded-lg py-2.5 text-meta"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel(models[e.target.value]?.[0] ?? "");
            }}
          >
            {Object.keys(PROVIDER_LABEL).map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Model</span>
          {options.length ? (
            <select className="field w-full rounded-lg py-2.5 text-meta" value={model}
              onChange={(e) => setModel(e.target.value)}>
              {options.map((m) => <option key={m}>{m}</option>)}
            </select>
          ) : (
            <input className="field w-full rounded-lg py-2.5 text-meta" value={model}
              placeholder="model-name" onChange={(e) => setModel(e.target.value)} />
          )}
        </label>
        {provider === "custom" && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-meta font-medium text-ink">Base URL</span>
            <input className="field w-full rounded-lg py-2.5 text-meta" value={baseUrl}
              placeholder="https://your-endpoint/v1" onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-meta font-medium text-ink">API key</span>
          <input type="password" autoComplete="off" className="field w-full rounded-lg py-2.5 text-meta"
            placeholder="sk-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <span className="mt-1 block text-caption text-subtle">
            Encrypted into Vault immediately. It will never be shown again.
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost rounded-lg px-4 py-2 text-meta">Cancel</button>
        <button
          disabled={busy || !model.trim() || apiKey.trim().length < 8}
          onClick={() => onSave({ provider, model, api_key: apiKey, base_url: baseUrl || undefined })}
          className="btn-primary rounded-lg px-4 py-2 text-meta disabled:opacity-40"
        >
          Add model
        </button>
      </div>
    </div>
  );
}

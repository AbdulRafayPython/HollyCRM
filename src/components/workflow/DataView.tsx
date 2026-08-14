"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";

/**
 * The real payload a node received or produced, the way n8n shows it: the JSON
 * itself, or a flattened table of fields, switchable, and copyable.
 *
 * A prose summary tells you what a step decided; it does not tell you the city
 * the extractor actually read or the five hotel rows SQL actually returned.
 * Those are what someone tuning the agent needs, so they are shown as data
 * rather than described.
 *
 * The JSON is tokenised into elements rather than highlighted with a regex into
 * innerHTML — every value here comes from customer messages and the database,
 * and none of it should ever be interpreted as markup.
 */

type Tab = "json" | "table";

export interface DataPacket {
  /** Which node this came from / went to. */
  label: string;
  status?: "ok" | "skipped" | "failed";
  ms?: number;
  summary?: string;
  data?: Record<string, unknown>;
}

export default function DataView({
  packets,
  empty,
}: {
  packets: DataPacket[];
  empty: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("json");
  const [copied, setCopied] = useState(false);

  const json = useMemo(
    () => JSON.stringify(packets.length === 1 ? packets[0] : packets, null, 2),
    [packets]
  );

  if (packets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-edge p-4 text-center text-caption leading-relaxed text-subtle">
        {empty}
      </p>
    );
  }

  const itemCount = packets.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the JSON is on screen and selectable anyway */
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-edge">
      <div className="flex items-center gap-2 border-b border-edge bg-surface px-2 py-1.5">
        <span className="text-caption tabular-nums text-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-card p-0.5 ring-1 ring-edge">
          {(["json", "table"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-caption font-medium uppercase tracking-wide transition-colors duration-150 ease-swift ${
                tab === t ? "bg-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={copy}
          title="Copy JSON"
          aria-label="Copy JSON"
          className="rounded-md p-1 text-muted transition-colors duration-150 ease-swift hover:bg-card hover:text-ink"
        >
          <Icon name={copied ? "check" : "file"} size={13} />
        </button>
      </div>

      <div className="scroll-thin max-h-72 overflow-auto bg-card">
        {tab === "json" ? (
          <pre className="p-3 font-mono text-[11px] leading-[1.6] text-ink">
            <Json text={json} />
          </pre>
        ) : (
          <TableView packets={packets} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   JSON syntax colouring, tokenised into spans.
   --------------------------------------------------------------------------- */

const TOKEN =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

function Json({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    const [raw, propKey, str, num, bool, nul] = match;
    const cls = propKey
      ? "text-brand-dark"
      : str
        ? "text-wa-dark"
        : num
          ? "text-bot-dark"
          : bool
            ? "text-brand"
            : nul
              ? "text-subtle"
              : "";

    parts.push(
      <span key={key++} className={cls}>
        {raw}
      </span>
    );
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return <>{parts}</>;
}

/* ---------------------------------------------------------------------------
   Table view — every leaf value, with its path.
   --------------------------------------------------------------------------- */

function TableView({ packets }: { packets: DataPacket[] }) {
  const rows = packets.flatMap((p, i) =>
    flatten(p.data ?? {}).map((r) => ({
      ...r,
      scope: packets.length > 1 ? p.label : null,
      i,
    }))
  );

  if (rows.length === 0) {
    return (
      <p className="p-4 text-center text-caption text-subtle">
        This step carried no field data — see the JSON tab for its status and timing.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-caption">
      <thead>
        <tr className="border-b border-edge text-left text-subtle">
          <th className="px-3 py-1.5 font-semibold">Field</th>
          <th className="px-3 py-1.5 font-semibold">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-edge/60 last:border-0 align-top">
            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted">
              {r.scope ? <span className="text-subtle">{r.scope}.</span> : null}
              {r.path}
            </td>
            <td className="px-3 py-1.5 font-medium text-ink">
              <span className="break-words">{r.value}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Depth-first walk to leaf values, keeping the dotted path to each. */
function flatten(value: unknown, prefix = ""): { path: string; value: string }[] {
  if (value === null || value === undefined) {
    return prefix ? [{ path: prefix, value: "null" }] : [];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path: prefix, value: "[]" }];
    return value.flatMap((v, i) => flatten(v, `${prefix}[${i}]`));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ path: prefix, value: "{}" }];
    return entries.flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }

  return [{ path: prefix, value: String(value) }];
}

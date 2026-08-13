"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import {
  defaultPosition, EDGES, edgePath, KIND_STYLES, NODE_H, NODE_TOGGLE, NODE_W,
  NODES,
} from "@/lib/workflow";

export type NodeStatus = "ready" | "attention" | "neutral";
export type Layout = Record<string, { x: number; y: number }>;

export interface WorkflowCanvasProps {
  statuses: Record<string, { status: NodeStatus; detail: string }>;
  /** Which optional branches are switched on, keyed by settings column. */
  toggles: Record<string, boolean>;
  layout: Layout;
  selected: string | null;
  /** Node currently lit by a running test, so the trace animates on the canvas. */
  activeNode?: string | null;
  onSelect: (id: string | null) => void;
  onLayoutChange: (next: Layout) => void;
  onToggle: (column: string, next: boolean) => void;
  readOnly?: boolean;
}

const GRID = 8;

/**
 * The pipeline as an editable canvas.
 *
 * Nodes are draggable and their positions persist per workspace, because a team
 * argues about its funnel together and the arrangement is part of how they
 * think about it. What is NOT editable is the wiring: the edges describe what
 * the orchestrator actually does, and a canvas that let you draw an edge the
 * code does not honour would be lying — worse, a canvas that let you delete the
 * inventory step would produce a bot quoting prices it invented.
 */
export default function WorkflowCanvas({
  statuses, toggles, layout, selected, activeNode,
  onSelect, onLayoutChange, onToggle, readOnly,
}: WorkflowCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDrag = useRef<{
    id: string; dx: number; dy: number;
    /** Where the press started, so pointerup can tell a click from a drag. */
    startX: number; startY: number; moved: boolean;
  } | null>(null);
  /** Live positions during a drag, so we re-render at 60fps without a network
   *  round trip per frame. Committed to the server on pointer-up only. */
  const [draft, setDraft] = useState<Layout | null>(null);

  const positions = useMemo(() => {
    const out: Layout = {};
    for (const n of NODES) {
      out[n.id] = draft?.[n.id] ?? layout[n.id] ?? defaultPosition(n);
    }
    return out;
  }, [layout, draft]);

  const extent = useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x);
    const ys = Object.values(positions).map((p) => p.y);
    return {
      width: Math.max(...xs) + NODE_W + 120,
      height: Math.max(...ys) + NODE_H + 120,
      minX: Math.min(...xs),
      minY: Math.min(...ys),
    };
  }, [positions]);

  /* --- pointer: click vs drag ------------------------------------------ *
   *
   * Selection is decided HERE, on pointerup, and not by an onClick handler on
   * the node.
   *
   * setPointerCapture redirects the compatibility mouse events to the capture
   * target, so `click` fires on this frame rather than on the node that was
   * pressed — with an onClick on the node, nothing ever opened. Measuring the
   * distance travelled between down and up is also simply the correct way to
   * tell a click from a drag: a node you can drag will always receive small
   * accidental movements, and a 2px wobble must still count as a click.
   */
  const MOVE_THRESHOLD = 4;

  const onPointerDown = (e: React.PointerEvent) => {
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    // A press on a control inside a node (the on/off toggle) is that control's.
    if (nodeEl && !(e.target as HTMLElement).closest("[data-nodrag]")) {
      const id = nodeEl.dataset.node!;
      const pos = positions[id];
      nodeDrag.current = {
        id,
        dx: e.clientX / zoom - pos.x,
        dy: e.clientY / zoom - pos.y,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (nodeEl) return;
    panDrag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const nd = nodeDrag.current;
    if (nd) {
      if (!nd.moved) {
        const far =
          Math.abs(e.clientX - nd.startX) > MOVE_THRESHOLD ||
          Math.abs(e.clientY - nd.startY) > MOVE_THRESHOLD;
        if (!far) return;
        // Only now is this a drag. Deferring means a plain click never paints
        // the lifted/scaled drag state for a frame before opening the panel.
        if (readOnly) { nodeDrag.current = null; return; }
        nd.moved = true;
        setDragId(nd.id);
      }
      // Snapped to an 8px grid: freehand placement makes a diagram that looks
      // almost aligned, which reads worse than one that obviously isn't.
      const x = Math.round((e.clientX / zoom - nd.dx) / GRID) * GRID;
      const y = Math.round((e.clientY / zoom - nd.dy) / GRID) * GRID;
      setDraft((prev) => ({ ...(prev ?? {}), [nd.id]: { x, y } }));
      return;
    }
    const pd = panDrag.current;
    if (pd) setPan({ x: pd.panX + (e.clientX - pd.x), y: pd.panY + (e.clientY - pd.y) });
  };

  const endDrag = () => {
    const nd = nodeDrag.current;
    if (nd) {
      if (nd.moved && draft) {
        // Commit the whole map, not just the moved node: the server stores one
        // blob, and sending a partial would drop every other node's position.
        onLayoutChange({ ...layout, ...draft });
      } else if (!nd.moved) {
        onSelect(selected === nd.id ? null : nd.id);
      }
    }
    nodeDrag.current = null;
    panDrag.current = null;
    setDragId(null);
    setDraft(null);
  };

  /* --- zoom ------------------------------------------------------------ */
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.002, 0.4, 1.8));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const tidy = useCallback(() => {
    // Back to the shipped arrangement. Worth a button: a canvas you can drag is
    // a canvas you can make illegible, and undoing that by hand is miserable.
    const next: Layout = {};
    for (const n of NODES) next[n.id] = defaultPosition(n);
    onLayoutChange(next);
  }, [onLayoutChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSelect(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  const lit = activeNode ?? hover ?? selected;

  return (
    <div
      ref={frame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`relative h-full w-full overflow-hidden bg-surface ${
        dragId ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgb(203 213 225 / 0.7) 1px, transparent 0)",
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: extent.width,
          height: extent.height,
          // No transition while dragging, or the node lags the cursor.
          transition: dragId ? "none" : "transform 100ms ease-out",
        }}
      >
        <svg width={extent.width} height={extent.height} className="pointer-events-none absolute inset-0">
          <defs>
            <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-edge-strong" />
            </marker>
            <marker id="wf-arrow-live" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-brand" />
            </marker>
          </defs>

          {EDGES.map((edge) => {
            const a = positions[edge.from];
            const b = positions[edge.to];
            if (!a || !b) return null;

            const fromPort = { x: a.x + NODE_W, y: a.y + NODE_H / 2 };
            const toPort = { x: b.x, y: b.y + NODE_H / 2 };
            const live = lit === edge.from || lit === edge.to;
            const off = isOff(edge.from, toggles) || isOff(edge.to, toggles);
            const mid = midpoint(fromPort, toPort);

            return (
              <g key={`${edge.from}-${edge.to}`} opacity={off ? 0.3 : 1}>
                <path
                  d={edgePath(fromPort, toPort)}
                  fill="none"
                  strokeWidth={live ? 2 : 1.5}
                  strokeLinecap="round"
                  markerEnd={live ? "url(#wf-arrow-live)" : "url(#wf-arrow)"}
                  className={`transition-[stroke,stroke-width] duration-300 ease-swift ${
                    live ? "stroke-brand" : edge.muted ? "stroke-edge-strong/60" : "stroke-edge-strong"
                  }`}
                  strokeDasharray={live ? "6 6" : off ? "4 4" : undefined}
                  style={live ? { animation: "dash-flow 900ms linear infinite" } : undefined}
                />
                {edge.label && (
                  <g opacity={live ? 1 : 0.75} className="transition-opacity duration-300">
                    <rect
                      x={mid.x - edge.label.length * 3.1 - 6} y={mid.y - 9}
                      width={edge.label.length * 6.2 + 12} height={18} rx={9}
                      className={live ? "fill-brand-soft" : "fill-card"}
                    />
                    <text x={mid.x} y={mid.y + 4} textAnchor="middle"
                      className={`text-[10px] font-medium ${live ? "fill-brand-dark" : "fill-muted"}`}>
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {NODES.map((node) => {
          const pos = positions[node.id];
          const style = KIND_STYLES[node.kind];
          const state = statuses[node.id] ?? { status: "neutral" as NodeStatus, detail: "" };
          const isSelected = selected === node.id;
          const isDragging = dragId === node.id;
          const isActive = activeNode === node.id;
          const toggleKey = NODE_TOGGLE[node.id];
          const disabled = toggleKey ? toggles[toggleKey] === false : false;

          return (
            <div
              key={node.id}
              data-node={node.id}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              role="button"
              aria-pressed={isSelected}
              tabIndex={0}
              // Keyboard still needs its own path: pointerup never fires for
              // someone tabbing through the canvas.
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(isSelected ? null : node.id);
                }
              }}
              className={`absolute flex select-none flex-col justify-center gap-1 rounded-xl border-2 bg-card p-3 text-left shadow-card ${
                readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
              } ${
                isSelected ? "border-brand ring-4 ring-brand/15"
                : isActive ? "border-brand ring-4 ring-brand/25"
                : style.ring
              } ${disabled ? "opacity-45" : ""} ${
                isDragging ? "z-20 scale-[1.03] shadow-pop" : "hover:-translate-y-0.5 hover:shadow-pop"
              }`}
              style={{
                left: pos.x, top: pos.y, width: NODE_W, height: NODE_H,
                transition: isDragging
                  ? "none"
                  : "transform 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms, border-color 200ms, opacity 200ms",
              }}
            >
              <span className="flex items-center gap-2">
                <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${style.chip}`}>
                  <Icon name={node.icon} size={13} />
                  {state.status === "attention" && !disabled && (
                    <>
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-bot" />
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse-ring rounded-full bg-bot" />
                    </>
                  )}
                  {isActive && (
                    <span className="absolute -inset-1 animate-pulse-ring rounded-lg bg-brand/40" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-meta font-semibold text-ink">
                  {node.title}
                </span>
                {toggleKey && !readOnly && (
                  <button
                    data-nodrag
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle(toggleKey, disabled); }}
                    title={disabled ? "Switch this step on" : "Switch this step off"}
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ease-swift ${
                      disabled ? "bg-edge-strong" : "bg-wa"
                    }`}
                  >
                    <span
                      className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-card transition-all duration-200 ease-swift"
                      style={{ left: disabled ? 2 : 14 }}
                    />
                  </button>
                )}
              </span>
              <span className="line-clamp-2 text-caption font-normal leading-tight text-muted">
                {disabled ? "Switched off — this step is skipped." : state.detail || node.summary}
              </span>
            </div>
          );
        })}
      </div>

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 left-4 flex items-center gap-1 rounded-xl border border-edge bg-card/90 p-1 shadow-pop backdrop-blur"
      >
        <button onClick={() => setZoom((z) => clamp(z - 0.15, 0.4, 1.8))}
          className="btn-ghost rounded-lg px-2.5 py-1.5 text-meta" title="Zoom out">−</button>
        <span className="w-12 text-center text-caption tabular-nums text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom((z) => clamp(z + 0.15, 0.4, 1.8))}
          className="btn-ghost rounded-lg px-2.5 py-1.5 text-meta" title="Zoom in">+</button>
        <span className="mx-1 h-4 w-px bg-edge" />
        <button onClick={reset} className="btn-ghost rounded-lg px-2.5 py-1.5 text-caption font-medium">
          Recentre
        </button>
        {!readOnly && (
          <button onClick={tidy} className="btn-ghost rounded-lg px-2.5 py-1.5 text-caption font-medium">
            Tidy up
          </button>
        )}
      </div>

      <p className="pointer-events-none absolute bottom-5 right-4 text-caption text-subtle">
        Drag nodes to arrange · drag the background to pan · ⌘/Ctrl + scroll to zoom
      </p>
    </div>
  );
}

/** A node whose branch is switched off, for dimming its edges. */
function isOff(nodeId: string, toggles: Record<string, boolean>): boolean {
  const key = NODE_TOGGLE[nodeId];
  return key ? toggles[key] === false : false;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

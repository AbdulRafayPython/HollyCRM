import type { IconName } from "@/components/ui/Icon";

/**
 * The pipeline, as data.
 *
 * This is a map of the code in lib/bot/orchestrator.ts, not a program the canvas
 * executes. The distinction is the whole design: an arbitrary node graph would
 * let an operator delete or reorder the step that guarantees every price comes
 * out of SQL, and the model would start quoting rates it invented. Those
 * guarantees are load-bearing, so the SHAPE is fixed and the BEHAVIOUR of each
 * node is configurable — thresholds, wording, keywords, which model, who routes
 * where.
 *
 * Each node points at the settings that actually drive it, so the canvas can
 * show real state ("3 documents", "no key set") instead of decoration.
 */

export type NodeKind = "trigger" | "ai" | "data" | "decision" | "action" | "exit";

export interface WorkflowNode {
  id: string;
  title: string;
  /** One line, present tense, describing what this step does to a message. */
  summary: string;
  kind: NodeKind;
  icon: IconName;
  /** Grid position on the canvas: column, row. Rendered at COL_W / ROW_H apart. */
  col: number;
  row: number;
  /** Where this node's settings live, if it has any. */
  settings?: "ai" | "knowledge" | "inventory" | "routing" | "llm" | "whatsapp" | "rules";
  /** Source of the "is this set up?" badge. */
  status?: "instance" | "llm" | "knowledge" | "inventory" | "routing" | "rules" | "always";
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** Branch label rendered on the connector — "no match", "found", "human". */
  label?: string;
  /** Dimmed styling for the unhappy path, so the main flow reads first. */
  muted?: boolean;
}

export const COL_W = 268;
export const ROW_H = 132;
export const NODE_W = 208;
export const NODE_H = 84;
export const PAD = 56;

/** Where a node sits when the workspace has never moved it. */
export function defaultPosition(node: WorkflowNode): { x: number; y: number } {
  return { x: PAD + node.col * COL_W, y: PAD + node.row * ROW_H };
}

/**
 * Which switch turns this node off, if any.
 *
 * Nodes without an entry cannot be disabled, and that is the guardrail: the
 * inventory search and the quote composer are what guarantee every price comes
 * out of SQL. Making them optional would let a workspace end up with a model
 * answering price questions from a PDF, which is the one failure this product
 * cannot ship.
 */
export const NODE_TOGGLE: Record<string, string> = {
  greet: "smalltalk_enabled",
  knowledge: "knowledge_enabled",
  inventory: "inventory_enabled",
  route: "auto_assign_enabled",
};

export const NODES: WorkflowNode[] = [
  {
    id: "trigger",
    title: "WhatsApp message",
    summary: "An inbound message arrives on the connected number.",
    kind: "trigger",
    icon: "chat",
    col: 0, row: 1,
    settings: "whatsapp",
    status: "instance",
  },
  {
    id: "understand",
    title: "Understand",
    summary: "Classifies intent and extracts city, dates and party size.",
    kind: "ai",
    icon: "bot",
    col: 1, row: 1,
    settings: "llm",
    status: "llm",
  },
  {
    id: "rules",
    title: "Your rules",
    summary: "Your own if/else, checked before the built-in flow decides anything.",
    kind: "decision",
    icon: "filter",
    col: 2, row: 4,
    settings: "rules",
    status: "rules",
  },
  {
    id: "greet",
    title: "Greeting & small talk",
    summary: "Answers hello, salam and thanks at any point in the conversation.",
    kind: "action",
    icon: "smile",
    col: 2, row: 0,
    settings: "ai",
    status: "always",
  },
  {
    id: "knowledge",
    title: "Knowledge base",
    summary: "Searches your uploaded documents for a non-price answer.",
    kind: "data",
    icon: "file",
    col: 2, row: 1,
    settings: "knowledge",
    status: "knowledge",
  },
  {
    id: "inventory",
    title: "Inventory search",
    summary: "Exact SQL over live rates. The only source of a price.",
    kind: "data",
    icon: "receipt",
    col: 2, row: 2,
    settings: "inventory",
    status: "inventory",
  },
  {
    id: "quote",
    title: "Send quote",
    summary: "Writes the reply from the rows SQL returned, and nothing else.",
    kind: "exit",
    icon: "send",
    col: 3, row: 2,
    settings: "ai",
    status: "always",
  },
  {
    id: "answer",
    title: "Answer from documents",
    summary: "Replies using the retrieved passages only.",
    kind: "exit",
    icon: "send",
    col: 3, row: 1,
    settings: "ai",
    status: "always",
  },
  {
    id: "route",
    title: "Route & assign",
    summary: "Finds the customer's region, then an available agent on that desk.",
    kind: "decision",
    icon: "users",
    col: 3, row: 3,
    settings: "routing",
    status: "routing",
  },
  {
    id: "assigned",
    title: "Assigned to an agent",
    summary: "Bot pauses, the agent owns the chat, the customer is told.",
    kind: "exit",
    icon: "check",
    col: 4, row: 3,
    settings: "routing",
    status: "always",
  },
  {
    id: "fallback",
    title: "Fallback",
    summary: "Nobody is available — the customer gets your out-of-hours wording.",
    kind: "exit",
    icon: "clock",
    col: 4, row: 4,
    settings: "routing",
    status: "always",
  },
];

export const EDGES: WorkflowEdge[] = [
  { from: "trigger", to: "understand" },
  // Rules sit between understanding and deciding: they can read what the
  // customer meant, and they can override what the bot would have done.
  { from: "understand", to: "rules", label: "check rules" },
  { from: "rules", to: "route", label: "rule matched", muted: true },
  { from: "understand", to: "greet", label: "greeting" },
  { from: "understand", to: "knowledge", label: "question" },
  { from: "understand", to: "inventory", label: "booking" },
  { from: "understand", to: "route", label: "asks for a human", muted: true },
  { from: "knowledge", to: "answer", label: "found" },
  { from: "knowledge", to: "route", label: "no match", muted: true },
  { from: "inventory", to: "quote", label: "rates found" },
  { from: "inventory", to: "route", label: "no availability", muted: true },
  { from: "route", to: "assigned", label: "agent online" },
  { from: "route", to: "fallback", label: "nobody online", muted: true },
];

/** Palette per node kind. Colour carries meaning here, as everywhere else in
 *  the product: amber is AI-authored, emerald is a successful exit, indigo is
 *  a decision, slate is data the bot reads rather than writes. */
export const KIND_STYLES: Record<NodeKind, { ring: string; chip: string; dot: string }> = {
  trigger:  { ring: "border-group/40",  chip: "bg-group-soft text-brand-dark",  dot: "bg-group" },
  ai:       { ring: "border-bot/40",    chip: "bg-bot-soft text-bot-dark",      dot: "bg-bot" },
  data:     { ring: "border-edge-strong", chip: "bg-surface text-muted",        dot: "bg-subtle" },
  decision: { ring: "border-brand/40",  chip: "bg-brand-soft text-brand-dark",  dot: "bg-brand" },
  action:   { ring: "border-bot/40",    chip: "bg-bot-soft text-bot-dark",      dot: "bg-bot" },
  exit:     { ring: "border-wa/40",     chip: "bg-wa-soft text-wa-dark",        dot: "bg-wa" },
};

/**
 * A cubic bezier between two node ports.
 *
 * Horizontal control points rather than a straight line: with eleven edges
 * converging on "Route & assign" from three different rows, straight segments
 * overlap into an unreadable star. Easing the curve out of the source and into
 * the target keeps each strand separable by eye.
 */
export function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  const dx = Math.max(60, Math.abs(to.x - from.x) * 0.55);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

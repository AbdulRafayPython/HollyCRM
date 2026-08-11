"use client";

import { createContext, useContext } from "react";

export interface Workspace {
  /** Company/team name of the workspace the signed-in person belongs to. */
  name: string | null;
  /** What this workspace calls its AI — "Hollyland AI", "Sales Bot", anything. */
  assistant: string;
  user: { name: string | null; email: string | null; role: string | null; avatar?: string | null };
}

const FALLBACK: Workspace = {
  name: null,
  assistant: "AI Assistant",
  user: { name: null, email: null, role: null, avatar: null },
};

const WorkspaceCtx = createContext<Workspace>(FALLBACK);

export const WorkspaceProvider = WorkspaceCtx.Provider;

/**
 * Workspace identity for client components.
 *
 * Fed by the poll the shell already makes for WhatsApp health, so this costs no
 * extra request. Before it resolves, `assistant` is the generic default rather
 * than a blank — a bubble labelled with nothing reads as a bug.
 *
 * The product is not a hotel CRM: the assistant's name belongs to the customer
 * who set it up, and hardcoding one company's name into the thread, the chat
 * list, the pipeline and the bot toggle made it look like one.
 */
export function useWorkspace(): Workspace {
  return useContext(WorkspaceCtx);
}

/** The assistant's display name on its own — the common case. */
export function useAssistantName(): string {
  return useContext(WorkspaceCtx).assistant;
}

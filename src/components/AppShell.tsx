"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import NavRail from "./NavRail";
import type { ProfileUser } from "./ProfileMenu";
import { WorkspaceProvider, type Presence, type Workspace } from "./WorkspaceContext";
import Icon from "./ui/Icon";

/** Auth screens: no chrome, but still locked to the viewport like the workspace. */
const BARE = ["/login", "/signup", "/invite", "/forgot-password", "/reset-password"];

/**
 * Marketing routes: no chrome and no viewport lock — a landing page is a long
 * document and has to scroll the window, so it gets neither the rail nor the
 * `h-screen` clamp the workstation depends on.
 */
const MARKETING = ["/landing"];

const isMarketing = (pathname: string) =>
  pathname === "/" || MARKETING.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * D5: WhatsApp session health lives here rather than in a page, because when the
 * Green API instance drops to notAuthorized/blocked/sleepMode messages simply
 * stop arriving — no error, no exception, nothing in the logs. One poll feeds
 * both the banner and the rail's connection dot.
 */
export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  /** Session identity for the rail's account menu — supplied by the server layout. */
  user?: ProfileUser;
}) {
  const pathname = usePathname() ?? "";
  const chromeless = isMarketing(pathname) || BARE.some((p) => pathname.startsWith(p));
  const [state, setState] = useState<string | null>(null);
  const [healthy, setHealthy] = useState(true);
  const [presence, setPresenceState] = useState<Presence>("available");

  /**
   * Flipping the switch writes through immediately rather than waiting for the
   * next poll. Going Away has to take effect now — the whole point is to stop
   * receiving chats before you step out, and a minute of latency defeats it.
   * The UI updates optimistically and reverts only if the write fails.
   */
  const setPresence = useCallback((next: Presence) => {
    setPresenceState(next);
    fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presence: next }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.presence) setPresenceState(j.presence); })
      .catch(() => setPresenceState((p) => (p === next ? (next === "away" ? "available" : "away") : p)));
  }, []);

  const [workspace, setWorkspace] = useState<Workspace>({
    name: null,
    assistant: "AI Assistant",
    user: { name: null, email: null, role: null, avatar: null },
    presence: "available",
    setPresence: () => {},
  });

  useEffect(() => {
    // The landing and auth screens have no rail, no banner and — on the public
    // pages — no session. Polling there would only produce 401s every minute.
    if (chromeless) return;

    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/instance", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setState(json.state ?? null);
        setHealthy(Boolean(json.healthy));
        // Same poll carries who and where we are — see WorkspaceContext.
        setWorkspace((prev) => ({
          ...prev,
          name: json.workspace ?? null,
          assistant: json.assistant || "AI Assistant",
          user: json.user ?? { name: null, email: null, role: null, avatar: null },
        }));
      } catch {
        /* transient — the next tick retries */
      }
    };

    /*
     * The presence heartbeat rides the same tick.
     *
     * No `presence` in the body: this is a liveness ping, not an opinion. If it
     * carried the client's idea of the current value, an agent who set
     * themselves Away in another tab would be dragged back to Available by this
     * one every sixty seconds.
     */
    const beat = async () => {
      try {
        const res = await fetch("/api/presence", { method: "POST" });
        if (!res.ok || !alive) return;
        const json = await res.json();
        if (json?.presence) setPresenceState(json.presence);
      } catch {
        /* a missed beat is survivable — the timeout allows for two */
      }
    };

    check();
    beat();
    const id = setInterval(() => { check(); beat(); }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [chromeless]);

  // Memoised so a provider value identity change doesn't re-render every
  // consumer on each 60s poll tick — the thread and chat list both read it.
  const ctxValue = useMemo<Workspace>(
    () => ({ ...workspace, presence, setPresence }),
    [workspace, presence, setPresence]
  );

  // The marketing site owns its own background and page flow — hand the document
  // straight through so nothing above it caps the height.
  if (isMarketing(pathname)) {
    return <>{children}</>;
  }

  // Auth screens: chrome-free, but the cards inside size against a full viewport.
  if (BARE.some((p) => pathname.startsWith(p))) {
    return <div className="h-screen overflow-hidden bg-surface">{children}</div>;
  }

  const down = !healthy && Boolean(state);

  return (
    <WorkspaceProvider value={ctxValue}>
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {down && (
        <div className="z-50 flex shrink-0 items-center justify-center gap-2 border-b border-danger/20 bg-danger-soft px-4 py-2 text-danger-dark">
          <Icon name="wifiOff" size={16} />
          <span className="text-body font-medium">
            WhatsApp instance {state} — incoming messages are not being received.
          </span>
          <span className="text-meta text-danger-dark/70">
            Re-link by scanning the QR in the Green API console.
          </span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <NavRail
          connected={healthy && Boolean(state)}
          user={user ?? { name: workspace.user.name, email: workspace.user.email, avatar: workspace.user.avatar }}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
    </WorkspaceProvider>
  );
}

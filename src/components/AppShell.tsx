"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NavRail from "./NavRail";
import type { ProfileUser } from "./ProfileMenu";
import { WorkspaceProvider, type Workspace } from "./WorkspaceContext";
import Icon from "./ui/Icon";

/** Routes that render without the workspace chrome. */
const BARE = ["/login", "/signup", "/invite", "/forgot-password", "/reset-password"];

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
  const [state, setState] = useState<string | null>(null);
  const [healthy, setHealthy] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace>({
    name: null,
    assistant: "AI Assistant",
    user: { name: null, email: null, role: null, avatar: null },
  });

  useEffect(() => {
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
        setWorkspace({
          name: json.workspace ?? null,
          assistant: json.assistant || "AI Assistant",
          user: json.user ?? { name: null, email: null, role: null, avatar: null },
        });
      } catch {
        /* transient — the next tick retries */
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (BARE.some((p) => pathname.startsWith(p))) {
    return <div className="h-screen bg-surface">{children}</div>;
  }

  const down = !healthy && Boolean(state);

  return (
    <WorkspaceProvider value={workspace}>
    <div className="flex h-screen flex-col bg-surface">
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

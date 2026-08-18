import { checkRouteAccess } from "@/lib/access-server";
import AccessDenied from "@/components/AccessDenied";

/**
 * Access gate for /ai.
 *
 * A layout rather than a check inside the page, so one guard covers both the
 * server pages and the "use client" ones. The rule lives in src/lib/access.ts
 * so this file and the two navigations cannot drift apart.
 */
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  const { allowed } = await checkRouteAccess("/ai");
  if (!allowed) {
    return <AccessDenied what="The AI agent" permissionLabel="Configure the AI" />;
  }
  return <>{children}</>;
}

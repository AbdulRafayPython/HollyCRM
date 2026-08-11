/**
 * Loading placeholders shown by the route-level loading.tsx files.
 *
 * These exist so tab switches are INSTANT: with a loading.tsx in a segment,
 * the App Router swaps the URL and paints this immediately, then streams the
 * server component in behind it. Without one, Next holds the user on the old
 * page until the new page's data resolves — which reads as a frozen tab bar.
 *
 * Server-safe (no hooks) so loading.tsx stays a server component.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-edge/70 ${className}`} />;
}

/** Header bar matching the h-16 page headers used across the app. */
export function HeaderSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
      <Skeleton className="h-6 w-28" />
      {wide && <Skeleton className="h-4 w-40" />}
    </header>
  );
}

/** One fake chat row for list sidebars. */
export function ChatRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  );
}

/** Chat-thread bubbles, alternating sides like a real conversation. */
export function ThreadSkeleton() {
  const widths = ["w-56", "w-72", "w-44", "w-64", "w-52"];
  return (
    <div className="flex-1 space-y-3 overflow-hidden p-6">
      {widths.map((w, i) => (
        <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
          <Skeleton className={`h-14 ${w} rounded-xl`} />
        </div>
      ))}
    </div>
  );
}

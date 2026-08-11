import { Skeleton, ThreadSkeleton } from "@/components/ui/Skeleton";

/**
 * Instant paint when opening a conversation. The chat-list sidebar is owned by
 * the layout and stays interactive; only this page slot shows the skeleton.
 */
export default function ChatLoading() {
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-edge bg-card px-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>

        <ThreadSkeleton />

        <div className="border-t border-edge bg-card p-4">
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>

      <aside className="hidden w-[340px] shrink-0 border-l border-edge bg-card xl:block">
        <div className="flex gap-2 border-b border-edge p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 flex-1 rounded-md" />
          ))}
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </aside>
    </div>
  );
}

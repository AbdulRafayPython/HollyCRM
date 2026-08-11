import { Skeleton } from "@/components/ui/Skeleton";

/** Instant paint for /inbox while the empty-state page streams in. */
export default function InboxLoading() {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-edge bg-card px-6">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-24 w-24 rounded-full" />
      </div>
    </div>
  );
}

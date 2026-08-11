import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Instant paint for the settings section while data streams in. */
export default function SettingsLoading() {
  return (
    <div className="flex h-full flex-col bg-surface">
      <HeaderSkeleton />
      <div className="min-h-0 flex-1 overflow-hidden p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="panel flex items-center gap-4 p-5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

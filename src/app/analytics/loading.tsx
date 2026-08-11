import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Instant paint for /analytics: stat tiles + funnel bars. */
export default function AnalyticsLoading() {
  return (
    <div className="flex h-full flex-col bg-surface">
      <HeaderSkeleton wide />
      <div className="min-h-0 flex-1 overflow-hidden p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="panel space-y-2.5 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>

        <div className="panel space-y-4 p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

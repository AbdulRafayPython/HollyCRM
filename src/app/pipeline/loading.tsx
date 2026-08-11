import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Instant paint for /pipeline: six-column board matching the real Kanban. */
export default function PipelineLoading() {
  return (
    <div className="flex h-full flex-col bg-surface">
      <HeaderSkeleton wide />
      <div className="min-h-0 flex-1 overflow-hidden p-5">
        <div className="flex h-full gap-4">
          {Array.from({ length: 6 }, (_, col) => (
            <div key={col} className="flex w-72 shrink-0 flex-col gap-3">
              <Skeleton className="h-5 w-36" />
              {Array.from({ length: 3 - (col % 2) }, (_, card) => (
                <div key={card} className="panel space-y-2.5 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="h-7 w-32" />
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 rounded-xl border p-3">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <SkeletonLines rows={2} className="mt-2" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-3/4" />
            <Skeleton className="mt-2 h-7 w-1/3" />
            <SkeletonLines rows={3} className="mt-4" />
          </div>
        </div>
      </main>
    </div>
  );
}

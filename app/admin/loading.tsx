import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-1 h-4 w-72" />
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <SkeletonLines rows={4} className="mt-6" />
    </div>
  );
}

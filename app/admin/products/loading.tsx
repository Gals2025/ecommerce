import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-1 h-4 w-72" />
      <Skeleton className="mb-4 mt-3 h-24 w-full rounded-lg" />
      <SkeletonLines rows={8} className="mt-2" />
    </div>
  );
}

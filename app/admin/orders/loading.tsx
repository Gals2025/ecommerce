import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-1 h-4 w-64" />
      <SkeletonLines rows={6} className="mt-4" />
    </div>
  );
}

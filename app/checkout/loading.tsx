import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Skeleton className="h-7 w-40" />
      <SkeletonLines rows={5} className="mt-4" />
    </main>
  );
}

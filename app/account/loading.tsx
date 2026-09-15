import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="h-8 w-48" />
        <SkeletonLines rows={2} className="mt-2" />
        <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        <Skeleton className="mt-4 h-32 w-full rounded-xl" />
      </main>
    </div>
  );
}

import { SkeletonCards } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 py-4">
        <SkeletonCards count={8} />
      </main>
    </div>
  );
}

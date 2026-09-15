"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-sm text-gray-600">
        This section failed to load. Try again — no data was changed.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={() => reset()}>Try again</Button>
        <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>Dashboard</Link>
      </div>
    </div>
  );
}

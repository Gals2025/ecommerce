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
      <h1 className="text-xl font-bold">Couldn&apos;t load this product</h1>
      <p className="mt-1 text-sm text-gray-600">
        The product may have saved — check the product list before retrying, to avoid duplicate edits.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={() => reset()}>Try again</Button>
        <Link href="/admin/products" className={cn(buttonVariants({ variant: "outline" }))}>Back to products</Link>
      </div>
      {error?.digest && (
        <p className="mt-4 font-mono text-xs text-gray-400">
          Error digest: {error.digest} — include this when reporting, and match it in Vercel → Logs.
        </p>
      )}
    </div>
  );
}

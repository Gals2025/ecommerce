"use client";
import { useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";

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
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-xl font-bold sm:text-2xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-600">
          We couldn&apos;t load this page. Please try again or continue shopping.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => reset()}>Try again</Button>
          <Link href="/shop" className={cn(buttonVariants({ variant: "outline" }))}>Shop</Link>
        </div>
      </main>
    </div>
  );
}

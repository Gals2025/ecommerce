import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Page not found</h1>
      <p className="mt-2 text-sm text-stone-500">
        The page you’re looking for doesn’t exist or was moved.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800">
        Back to shop
      </Link>
    </main>
  );
}

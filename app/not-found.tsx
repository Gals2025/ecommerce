import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-gray-600">
        The page you’re looking for doesn’t exist or was moved.
      </p>
      <Link href="/" className="mt-6 inline-block rounded bg-black px-4 py-2 text-sm text-white">
        Back to shop
      </Link>
    </main>
  );
}

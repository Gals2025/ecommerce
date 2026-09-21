"use client";
import { Suspense, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { getPostLoginPath } from "@/actions/auth";
import { Button, Input } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const expired = search.get("expired") === "1";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <>
      {expired && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
          Admin session expired after 8 hours. Please log in again.
        </p>
      )}
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          const fd = new FormData(e.currentTarget);
          const res = await signIn.email({
            email: String(fd.get("email")),
            password: String(fd.get("password")),
          });
          if (res.error) {
            setLoading(false);
            setError("Invalid email or password");
            return;
          }
          // Honor ?next= (e.g. /admin after expiry) when it is a safe local path.
          if (next?.startsWith("/") && !next.startsWith("//")) {
            router.push(next);
            return;
          }
          try {
            const path = await getPostLoginPath();
            router.push(path);
          } catch {
            router.push("/");
          }
        }}
      >
        <Input name="email" type="email" required placeholder="Email" autoComplete="email" aria-label="Email" />
        <Input name="password" type="password" required placeholder="Password" autoComplete="current-password" aria-label="Password" />
        <Button disabled={loading} className="w-full">
          {loading ? "Logging in…" : "Log in"}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="mt-4 flex justify-between text-sm">
        <a href="/register" className="underline">Create an account</a>
        <a href="/forgot-password" className="underline">Forgot password?</a>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold sm:text-2xl">Log in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

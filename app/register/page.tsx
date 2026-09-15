"use client";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold sm:text-2xl">Create account</h1>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          const fd = new FormData(e.currentTarget);
          const res = await signUp.email({
            email: String(fd.get("email")),
            password: String(fd.get("password")),
            name: String(fd.get("name")),
          });
          setLoading(false);
          if (res.error) setError(res.error.message ?? "Registration failed");
          else router.push("/");
        }}
      >
        <Input name="name" required placeholder="Full name" autoComplete="name" aria-label="Full name" />
        <Input name="email" type="email" required placeholder="Email" autoComplete="email" aria-label="Email" />
        <Input name="password" type="password" required minLength={8} placeholder="Password (min 8 chars)" autoComplete="new-password" aria-label="Password" />
        <Button disabled={loading} className="w-full">
          {loading ? "Creating…" : "Register"}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <p className="mt-4 text-sm"><a href="/login" className="underline">Already have an account? Log in</a></p>
    </main>
  );
}

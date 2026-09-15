"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold">Forgot password</h1>
      {done ? (
        <p className="mt-4 text-sm">If an account exists for that email, a reset link is on its way. Check your inbox.</p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const fd = new FormData(e.currentTarget);
            // Generic message regardless of outcome — no user enumeration.
            await authClient.requestPasswordReset({
              email: String(fd.get("email")),
              redirectTo: "/reset-password",
            });
            setLoading(false);
            setDone(true);
          }}
        >
          <input name="email" type="email" required placeholder="Email" autoComplete="email" className="w-full rounded border p-2 text-sm" />
          <button disabled={loading} className="w-full rounded bg-black px-4 py-2 text-sm text-white">
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm"><a href="/login" className="underline">Back to login</a></p>
    </main>
  );
}

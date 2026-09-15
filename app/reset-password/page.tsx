"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = params.get("token") ?? "";

  if (!token) return <p className="mt-4 text-sm text-red-600">Missing or invalid reset link. Request a new one.</p>;

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const fd = new FormData(e.currentTarget);
        const pw = String(fd.get("password"));
        const pw2 = String(fd.get("confirm"));
        if (pw !== pw2) {
          setError("Passwords do not match");
          return;
        }
        setLoading(true);
        const res = await authClient.resetPassword({ newPassword: pw, token });
        setLoading(false);
        if (res.error) setError(res.error.message ?? "Reset failed — the link may have expired");
        else router.push("/login");
      }}
    >
      <input name="password" type="password" required minLength={8} placeholder="New password (min 8 chars)" autoComplete="new-password" className="w-full rounded border p-2 text-sm" />
      <input name="confirm" type="password" required minLength={8} placeholder="Confirm password" autoComplete="new-password" className="w-full rounded border p-2 text-sm" />
      <button disabled={loading} className="w-full rounded bg-black px-4 py-2 text-sm text-white">
        {loading ? "Resetting…" : "Reset password"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold">Reset password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}

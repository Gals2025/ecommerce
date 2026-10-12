"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function AdminForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-xl font-bold">Reset admin password</h1>
      <p className="mt-2 text-sm text-gray-600">
        Locked out of the admin console? Enter your staff email and we&apos;ll send a 1-hour,
        single-use reset link. Admin sessions expire after 8 hours and never auto-renew.
      </p>
      {done ? (
        <p className="mt-4 text-sm">
          If a staff account exists for that email, a reset link is on its way. Check your inbox,
          then sign in again.
        </p>
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
              redirectTo: "/admin",
              context: "admin",
            });
            setLoading(false);
            setDone(true);
          }}
        >
          <input
            name="email"
            type="email"
            required
            placeholder="Staff email"
            autoComplete="email"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
          <button
            disabled={loading}
            className="w-full rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send admin reset link"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <a href="/login?next=/admin" className="underline">Back to login</a>
      </p>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionUser = { id: string; email: string; name: string };
export type SessionData = { user: SessionUser } | null;

async function req(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: { message: data.error ?? "Request failed" } as { message: string }, data: null };
  return { error: null, data };
}

export async function signInWithPassword(email: string, password: string) {
  return req("/api/auth/login", { email, password });
}

export async function signUpWithPassword(email: string, password: string, name: string) {
  return req("/api/auth/signup", { email, password, name });
}

export async function signOut() {
  return req("/api/auth/logout", {});
}

// Compat shims so existing pages keep working with minimal edits.
export const signIn = {
  email: async (args: { email: string; password: string }) =>
    signInWithPassword(args.email, args.password),
};
export const signUp = {
  email: async (args: { email: string; password: string; name: string }) =>
    signUpWithPassword(args.email, args.password, args.name),
};
export const authClient = {
  requestPasswordReset: async (args: { email: string; redirectTo?: string }) =>
    req("/api/auth/request-reset", { email: args.email }),
  resetPassword: async (args: { newPassword: string; token: string }) =>
    req("/api/auth/reset", { password: args.newPassword, token: args.token }),
};

export function useSession(strict = false) {
  const [data, setData] = useState<SessionData>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(strict ? "/api/auth/session?strict=1" : "/api/auth/session");
      const json = await res.json().catch(() => ({}));
      setData(res.ok ? (json as SessionData) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [strict]);
  useEffect(() => {
    // Session fetch on mount is the canonical exception: no cascading render,
    // single request, guarded UI via isPending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);
  return { data, isPending: loading, refresh };
}

"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { adminRequestPasswordReset } from "@/actions/users";

export function SendResetEmailButton({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    setDone(null);
    try {
      await adminRequestPasswordReset({ userId });
      setDone(`Reset link sent to ${userEmail} (1 hour, single-use).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <Button variant="utility" onClick={onClick} disabled={pending}>
        {pending ? "Sending…" : "Send reset email"}
      </Button>
      {done && <p className="mt-1 text-xs text-green-700" role="status">{done}</p>}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

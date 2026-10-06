"use client";
import { useState } from "react";
import { Input, Button, Card } from "@/components/ui";
import { changeOwnPassword } from "@/actions/auth";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setPending(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setDone("Password changed. Other devices have been signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  const input = "mt-1 w-full rounded-md border px-3 py-2 text-sm font-normal";
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Change password</h2>
      <p className="mb-3 text-xs text-gray-500">
        Enter your current password, then choose a new one (min 8 characters).
      </p>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
        <label className={field}>Current password *
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={input}
            required
            maxLength={128}
            autoComplete="current-password"
          />
        </label>
        <label className={field}>New password (min 8 chars) *
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={input}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label className={field}>Confirm new password *
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
          {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
          {done && <p className="mt-2 text-xs text-green-700" role="status">{done}</p>}
        </div>
      </form>
    </Card>
  );
}

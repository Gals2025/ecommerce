"use client";
import { useState } from "react";
import { Input, Button } from "@/components/ui";
import { adminSetPassword } from "@/actions/users";

export function SetPasswordForm({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [open, setOpen] = useState(false);
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
      await adminSetPassword({ userId, newPassword });
      setDone(`Password set for ${userEmail} — their other devices have been signed out. Share it securely; it is never shown again.`);
      setNewPassword("");
      setConfirm("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-2">
        <Button variant="utility" onClick={() => { setOpen(true); setError(null); setDone(null); }}>
          Set password
        </Button>
        {done && <p className="mt-1 text-xs text-green-700" role="status">{done}</p>}
        {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
      </div>
    );
  }

  const input = "mt-1 w-full rounded-md border px-3 py-2 text-sm font-normal";
  return (
    <form onSubmit={onSubmit} className="mt-2 max-w-sm rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="text-xs font-medium">Set new password for {userEmail}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        Takes effect immediately. Min 8 characters.
      </p>
      <label className="mt-2 block text-xs font-medium">New password *
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
      <label className="mt-2 block text-xs font-medium">Confirm new password *
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
      <div className="mt-2 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Setting…" : "Set password"}
        </Button>
        <Button type="button" variant="utility" disabled={pending} onClick={() => { setOpen(false); setError(null); setNewPassword(""); setConfirm(""); }}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
    </form>
  );
}

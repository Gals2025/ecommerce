"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { createUser } from "@/actions/users";
import type { AppRole } from "@/lib/auth";

export function CreateUserForm({ grantable }: { grantable: AppRole[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<AppRole[]>(["ORDER_STAFF"]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function toggle(role: AppRole) {
    setSelected((s) => (s.includes(role) ? s.filter((r) => r !== role) : [...s, role]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (selected.length === 0) {
      setError("Select at least one role");
      return;
    }
    setPending(true);
    try {
      const res = await createUser({ name, email, password, roles: selected });
      setDone(`Created ${res.email} — share the temporary password securely`);
      setName("");
      setEmail("");
      setPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  const input = "mt-1 w-full rounded-md border px-3 py-2 text-sm font-normal";
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Create user</h2>
      <p className="mb-3 text-xs text-gray-500">
        You may only assign roles below your own level. The new user signs in with this temporary password.
      </p>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>Name *
          <Input value={name} onChange={(e) => setName(e.target.value)} className={input} required maxLength={120} />
        </label>
        <label className={field}>Email *
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required maxLength={255} />
        </label>
        <label className={field}>Temporary password (min 8 chars) *
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} required minLength={8} maxLength={128} autoComplete="new-password" />
        </label>
        <fieldset className={field}>Roles *
          <div className="mt-1 flex flex-wrap gap-2 font-normal">
            {grantable.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
                <input type="checkbox" checked={selected.includes(r)} onChange={() => toggle(r)} />
                {r}
              </label>
            ))}
            {grantable.length === 0 && <span className="text-xs text-gray-500">Your role cannot create users.</span>}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || grantable.length === 0}>
            {pending ? "Creating…" : "Create user"}
          </Button>
          {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
          {done && <p className="mt-2 text-xs text-green-700" role="status">{done}</p>}
        </div>
      </form>
    </Card>
  );
}

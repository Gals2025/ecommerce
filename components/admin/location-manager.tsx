"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { createLocation, updateLocation, setLocationActive } from "@/actions/inventory";

export type LocationRow = {
  id: string; code: string; name: string; type: string;
  address: string | null; isActive: boolean; deletedAt: Date | null;
};

export function LocationManager({ rows }: { rows: LocationRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("warehouse");
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  function startEdit(r: LocationRow) {
    setEditing(r.id); setCode(r.code); setName(r.name);
    setType(r.type); setAddress(r.address ?? ""); setShowNew(true);
  }
  function reset() {
    setEditing(null); setCode(""); setName(""); setType("warehouse"); setAddress(""); setShowNew(false);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setPending(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), type: type as "warehouse" | "store", address: address.trim() || null };
      if (editing) await updateLocation(editing, payload);
      else await createLocation(payload);
      reset(); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function onToggle(id: string, active: boolean) {
    setPending(true);
    try {
      await setLocationActive(id, active);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-3">{!showNew && <Button onClick={() => { reset(); setShowNew(true); }}>New location</Button>}</div>
      {showNew && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">{editing ? "Edit location" : "New location"}</h2>
          <form onSubmit={onSave} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">Code *<Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WH-QC" required /></label>
            <label className="text-xs font-medium">Name *<Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label className="text-xs font-medium">Type
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
                <option value="warehouse">Warehouse</option>
                <option value="store">Store</option>
              </select>
            </label>
            <label className="text-xs font-medium">Address<Input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
            {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save" : "Create"}</Button>
              <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr><th className="px-3 py-2 font-medium">Code</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium"></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-xs">{r.type}</td>
                <td className="px-3 py-2 text-xs">{r.isActive ? "active" : "inactive"}</td>
                <td className="px-3 py-2 text-right text-xs">
                  <button onClick={() => startEdit(r)} className="hover:underline">Edit</button>{" · "}
                  {r.isActive
                    ? <button onClick={() => onToggle(r.id, false)} className="text-red-600 hover:underline">Deactivate</button>
                    : <button onClick={() => onToggle(r.id, true)} className="hover:underline">Activate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-gray-500">No locations yet.</p>}
    </div>
  );
}

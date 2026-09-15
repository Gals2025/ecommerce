"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { receiveStockAction } from "@/actions/inventory";

export type StockOption = { id: string; sku: string; productName: string };
export type LocOption = { id: string; code: string; name: string };

export function ReceivingForm({ variants, locations }: { variants: StockOption[]; locations: LocOption[] }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(false); setPending(true);
    try {
      const q = Number(qty);
      if (!variantId || !locationId || !Number.isInteger(q) || q <= 0) throw new Error("Variant, location, and positive quantity are required");
      const cost = unitCost.trim() === "" ? null : Math.round(Number(unitCost) * 100);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error("Invalid unit cost");
      await receiveStockAction({
        variantId, locationId, qty: q, unitCost: cost,
        supplier: supplier.trim() || null, reference: reference.trim() || null, notes: notes.trim() || null,
      });
      setDone(true);
      setQty(""); setUnitCost(""); setSupplier(""); setReference(""); setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receiving failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Receive stock</h2>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={field}>Variant *
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal" required>
            <option value="">— Select —</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.productName} — {v.sku}</option>)}
          </select>
        </label>
        <label className={field}>Location *
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal" required>
            <option value="">— Select —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </label>
        <label className={field}>Quantity *<Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" required /></label>
        <label className={field}>Unit cost (₱)<Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="optional" /></label>
        <label className={field}>Supplier<Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="optional" /></label>
        <label className={field}>Reference (PO / DR no.)<Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" /></label>
        <label className={`${field} sm:col-span-2`}>Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {done && <p className="text-sm text-green-700 sm:col-span-2">Stock received — STOCK_RECEIVED movement recorded.</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Receiving…" : "Receive stock"}</Button></div>
      </form>
    </Card>
  );
}

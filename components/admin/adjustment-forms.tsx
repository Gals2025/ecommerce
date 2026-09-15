"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card } from "@/components/ui";
import { adjustStockAction, transferStockAction } from "@/actions/inventory";
import type { LocOption, StockOption } from "./receiving-form";

const REASONS = [
  { value: "physical_count", label: "Physical count correction" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "expired", label: "Expired" },
  { value: "data_correction", label: "Data correction" },
  { value: "other", label: "Other" },
] as const;

export function AdjustmentForm({ variants, locations }: { variants: StockOption[]; locations: LocOption[] }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string>("physical_count");
  const [notes, setNotes] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(null); setPending(true);
    try {
      const q = Number(qty);
      if (!variantId || !locationId || !Number.isInteger(q) || q <= 0) throw new Error("Variant, location, and positive quantity are required");
      const res = await adjustStockAction({
        variantId, locationId, direction, qty: q,
        reason: reason as "physical_count" | "damaged" | "lost" | "expired" | "data_correction" | "other",
        notes: notes.trim() || null, allowNegative,
      });
      setDone(res.overrideUsed ? "Adjustment applied WITH administrative override (logged as inventory.override)." : "Adjustment applied — movement recorded.");
      setQty(""); setNotes(""); setAllowNegative(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Stock adjustment</h2>
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
        <label className={field}>Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as "increase" | "decrease")} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </select>
        </label>
        <label className={field}>Quantity *<Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" required /></label>
        <label className={field}>Reason (required)
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal">
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className={field}>Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className={`${field} flex items-center gap-2 font-normal sm:col-span-2`}>
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Administrative override: bypass available-stock gate (explicit, reasoned, audit-logged; DB checks still fail closed)
        </label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {done && <p className="text-sm text-green-700 sm:col-span-2">{done}</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Applying…" : "Apply adjustment"}</Button></div>
      </form>
    </Card>
  );
}

export function TransferForm({ variants, locations }: { variants: StockOption[]; locations: LocOption[] }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(false); setPending(true);
    try {
      const q = Number(qty);
      if (!variantId || !fromId || !toId || !Number.isInteger(q) || q <= 0) throw new Error("Variant, locations, and positive quantity are required");
      await transferStockAction({ variantId, fromLocationId: fromId, toLocationId: toId, qty: q, notes: notes.trim() || null });
      setDone(true);
      setQty(""); setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setPending(false);
    }
  }

  const field = "text-xs font-medium";
  const locOpts = (exclude: string) => locations.filter((l) => l.id !== exclude);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Transfer between locations</h2>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={`${field} sm:col-span-2`}>Variant *
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal" required>
            <option value="">— Select —</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.productName} — {v.sku}</option>)}
          </select>
        </label>
        <label className={field}>From *
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal" required>
            <option value="">— Select —</option>
            {locOpts(toId).map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </label>
        <label className={field}>To *
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-normal" required>
            <option value="">— Select —</option>
            {locOpts(fromId).map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </label>
        <label className={field}>Quantity *<Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" required /></label>
        <label className={field}>Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        {done && <p className="text-sm text-green-700 sm:col-span-2">Transferred — TRANSFER_OUT + TRANSFER_IN pair recorded.</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Transferring…" : "Transfer"}</Button></div>
      </form>
    </Card>
  );
}

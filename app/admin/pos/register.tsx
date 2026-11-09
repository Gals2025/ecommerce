"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Trash2, ShoppingBag, CheckCircle2 } from "lucide-react";
import { getPosCatalog, recordPosSale } from "@/actions/pos";
import { Button, Input, Select, Textarea, Card } from "@/components/ui";
import { formatPHP } from "@/lib/money";

type Catalog = Awaited<ReturnType<typeof getPosCatalog>>;
type Sale = Parameters<typeof recordPosSale>[0];

export function PosRegister({ catalog: initial }: { catalog: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [location, setLocation] = useState(initial.locations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<{ variantId: string; qty: number }[]>([]);
  const [method, setMethod] = useState("pay_at_store");
  const [cash, setCash] = useState("");
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ orderId: string; orderNo: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const key = useRef<string | null>(null);
  const retry = useRef<Sale | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const total = lines.reduce((sum, line) => sum + catalog.products.find(p => p.id === line.variantId)!.price * line.qty, 0);
  const tendered = Math.round(Number(cash || 0) * 100);
  const stock = (id: string) => Number(catalog.balances.find(b => b.variantId === id && b.locationId === location)?.available ?? 0);
  const visible = catalog.products.filter(p => `${p.name} ${p.variant ?? ""} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 60);
  const locked = pending || uncertain;

  function add(id: string) {
    setLines(previous => {
      const found = previous.find(l => l.variantId === id);
      return found ? previous.map(l => l.variantId === id ? { ...l, qty: Math.min(999, l.qty + 1) } : l) : [...previous, { variantId: id, qty: 1 }];
    });
    setReceipt(null);
    setError("");
  }

  function submit() {
    setError("");
    key.current ??= crypto.randomUUID();
    const payload = retry.current ?? { key: key.current, locationId: location, items: lines, expectedTotal: total, customerName: customer, notes, method, reference, tendered: method === "pay_at_store" ? tendered : total };
    retry.current = payload;
    startTransition(async () => {
      try {
        const result = await recordPosSale(payload);
        if ("error" in result) {
          setError(result.error);
          setUncertain(!!result.retry);
          if (!result.retry) retry.current = null;
          return;
        }
        setReceipt(result); setLines([]); setCash(""); setReference(""); setCustomer(""); setNotes(""); setUncertain(false);
        key.current = null; retry.current = null;
        // Refresh stock after success; a failed refresh must not hide the receipt.
        try { setCatalog(await getPosCatalog()); } catch { setError("Sale recorded. Reload the catalog before the next sale to see current stock."); }
      } catch {
        setUncertain(true);
        setError("The connection was interrupted. Retry to confirm this same sale before starting another.");
      }
    });
  }

  return <div className="mt-6 space-y-4">
    {receipt && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-lime-300 bg-lime-50 p-4 text-brand-navy"><CheckCircle2 className="h-5 w-5" /><span>Sale recorded successfully.</span><Link className="break-all font-semibold underline" href={`/admin/orders/${receipt.orderId}`}>View {receipt.orderNo}</Link></div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_420px]">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-sm font-medium">Stock location<Select value={location} onChange={e => setLocation(e.target.value)} disabled={locked} className="mt-1">{catalog.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></label>
          <Button variant="outline" disabled={locked} onClick={() => startTransition(async () => { try { const fresh = await getPosCatalog(); setLines(current => current.filter(line => fresh.products.some(product => product.id === line.variantId))); setCatalog(fresh); setError("Catalog refreshed. Review quantities and current prices before recording the sale."); } catch { setError("Catalog refresh failed. Try again."); } })}>Refresh stock</Button>
        </div>
        <label className="relative mt-4 block"><span className="sr-only">Search products, SKU or barcode</span><Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, SKU or barcode" className="pl-9" /></label>
        <p className="mt-2 text-xs text-stone-500">Catalog prices • No automatic storefront promotions or membership discounts</p>
        {!catalog.locations.length && <p className="mt-5 text-sm text-red-700">Create an active inventory location before recording a sale.</p>}
        <div className="mt-4 grid max-h-[640px] gap-2 overflow-y-auto sm:grid-cols-2">
          {visible.map(product => { const available = stock(product.id); const qty = lines.find(l => l.variantId === product.id)?.qty ?? 0; return <button key={product.id} disabled={locked || !location || (product.tracked && available <= qty)} onClick={() => add(product.id)} className="rounded-xl border border-stone-200 p-4 text-left transition hover:border-brand-navy hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45">
            <span className="block font-semibold">{product.name}</span><span className="block text-sm text-stone-500">{product.variant || "Default"} · {product.sku}</span>
            <span className="mt-3 flex items-center justify-between gap-2"><span className="font-semibold">{formatPHP(product.price)}</span><Plus className="h-4 w-4" /></span><span className="mt-1 block text-xs text-stone-500">{product.tracked ? `${available} available here` : "Stock not tracked"}</span>
          </button>; })}
        </div>
        {!visible.length && <p className="py-10 text-center text-sm text-stone-500">No active products match your search.</p>}
      </Card>
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ShoppingBag className="h-5 w-5" /> Current sale</h2>
        <fieldset disabled={locked} className="min-w-0">
          {!lines.length && <p className="py-8 text-center text-sm text-stone-500">Choose products to start a sale.</p>}
          <div className="mt-3 space-y-3">{lines.map(line => { const product = catalog.products.find(p => p.id === line.variantId)!; return <div key={line.variantId} className="border-b border-stone-100 pb-3">
            <p className="text-sm font-semibold">{product.name}</p><p className="text-xs text-stone-500">{product.variant} · {product.sku}</p>
            <div className="mt-2 flex items-center gap-2"><Input aria-label={`Quantity for ${product.sku}`} type="number" min={1} max={999} value={line.qty} onChange={e => setLines(current => current.map(l => l.variantId === line.variantId ? { ...l, qty: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) } : l))} className="w-20" /><span className="ml-auto text-sm font-medium">{formatPHP(product.price * line.qty)}</span><Button variant="utilityDanger" aria-label={`Remove ${product.sku}`} onClick={() => setLines(current => current.filter(l => l.variantId !== line.variantId))}><Trash2 className="h-4 w-4" /></Button></div>
            {product.tracked && line.qty > stock(product.id) && <p className="mt-1 text-xs text-red-700">Not enough stock at this location.</p>}
          </div>; })}</div>
          <div className="my-5 flex justify-between text-xl font-bold"><span>Total</span><span>{formatPHP(total)}</span></div>
          <label className="block text-sm">Customer name (optional)<Input value={customer} maxLength={120} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in customer" className="mt-1" /></label>
          <label className="mt-3 block text-sm">Payment received<Select value={method} onChange={e => setMethod(e.target.value)} className="mt-1"><option value="pay_at_store">Cash</option><option value="gcash_manual">GCash</option><option value="bank_transfer">Bank transfer</option></Select></label>
          {method === "pay_at_store" ? <label className="mt-3 block text-sm">Cash received (₱)<Input type="number" min="0" step="0.01" value={cash} onChange={e => setCash(e.target.value)} className="mt-1" /><span className="mt-1 block text-xs text-stone-500">Change: {formatPHP(Math.max(0, tendered - total))}</span></label> : <label className="mt-3 block text-sm">Payment reference (required)<Input value={reference} maxLength={120} onChange={e => setReference(e.target.value)} className="mt-1" /></label>}
          <label className="mt-3 block text-sm">Sale notes (optional)<Textarea value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} className="mt-1" /></label>
        </fieldset>
        <p className="mt-4 text-xs text-stone-500">Record only after payment is received and goods are handed over. This completes the sale and deducts inventory immediately.</p>
        <Button variant="primary" className="mt-4 w-full" disabled={pending || !lines.length || !location || (!uncertain && (method === "pay_at_store" ? !cash || tendered < total : !reference.trim()))} onClick={submit}>{pending ? "Recording…" : uncertain ? "Retry / confirm this sale" : `Record paid sale · ${formatPHP(total)}`}</Button>
      </Card>
    </div>
  </div>;
}

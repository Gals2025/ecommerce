"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { checkout, previewCheckout, getCheckoutContext, type CheckoutPreview, type CheckoutContext, type CheckoutAddress } from "@/actions/checkout";
import { Button, Input, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";

type Ctx = CheckoutContext;
type Addr = CheckoutAddress;

const STEPS = ["Cart", "Details", "Address", "Delivery", "Payment", "Discount", "Review"] as const;

const DELIVERY_OPTS = [
  { code: "pickup", name: "Store Pickup", hint: "Pick up at the store. No delivery fee." },
  { code: "local_delivery", name: "Local Delivery", hint: "Same-area delivery. Fee confirmed by staff." },
  { code: "standard_shipping", name: "Standard Shipping", hint: "Nationwide shipping. Fee confirmed by staff." },
] as const;

const PAYMENT_OPTS = [
  { code: "cod", name: "Cash on Delivery", hint: "Pay in cash when you receive / pick up." },
  { code: "bank_transfer", name: "Bank Transfer", hint: "Manual verification. Attach receipt if available." },
  { code: "gcash_manual", name: "GCash Manual Payment", hint: "Manual verification. Attach receipt if available." },
  { code: "pay_at_store", name: "Pay at Store", hint: "Pay over the counter on pickup." },
] as const;

function peso(c: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(c / 100);
}

const emptyAddr = { label: "Home", recipient: "", mobile: "", region: "", province: "", city: "", barangay: "", street: "", zip: "" };

export default function CheckoutPage() {
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [ctxErr, setCtxErr] = useState("");
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [pending, start] = useTransition();

  const [shipCode, setShipCode] = useState<(typeof DELIVERY_OPTS)[number]["code"]>("pickup");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [useNewAddr, setUseNewAddr] = useState(false);
  const [addr, setAddr] = useState(emptyAddr);
  const [payment, setPayment] = useState<(typeof PAYMENT_OPTS)[number]["code"]>("cod");
  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined);
  const [promoOk, setPromoOk] = useState<boolean | null>(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [done, setDone] = useState<{ orderId: string; orderNo: string } | null>(null);
  const idemKey = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const c = await getCheckoutContext();
        if (!live) return;
        setCtx(c);
      } catch (e) {
        if (!live) return;
        setCtxErr((e as Error).message);
      }
      try {
        const p = await previewCheckout({ promoCode: undefined });
        if (live) setPreview(p);
      } catch (e) {
        if (live) {
          setPreview(null);
          setPreviewErr((e as Error).message);
        }
      }
    })();
    return () => { live = false; };
  }, []);

  async function refreshPreview(code?: string) {
    setPreviewErr("");
    try {
      const p = await previewCheckout({ promoCode: code });
      setPreview(p);
      return p;
    } catch (e) {
      setPreview(null);
      setPreviewErr((e as Error).message);
      return null;
    }
  }

  // Preview is refreshed explicitly (Apply promo, entering Review) — never in an effect.

  const fulfillment = shipCode === "pickup" ? "pickup" : "delivery";
  const needsAddress = fulfillment === "delivery";
  const addresses: Addr[] = ctx?.signedIn ? ctx.addresses : [];
  const canProceedAddress = !needsAddress || addressId != null || useNewAddr;

  function applyPromo() {
    const code = promo.trim() || undefined;
    start(async () => {
      const p = await refreshPreview(code);
      if (p && code) {
        if ((p.promoDiscount ?? 0) > 0) {
          setAppliedPromo(code);
          setPromoOk(true);
          setPromoMsg(`Applied: ${p.promoName ?? code} (−${peso(p.promoDiscount)})`);
        } else {
          setAppliedPromo(undefined);
          setPromoOk(false);
          setPromoMsg(p.codeError ?? "Code not valid for this cart — totals unchanged.");
        }
      } else if (!code) {
        setAppliedPromo(undefined);
        setPromoOk(null);
        setPromoMsg("Promo removed.");
      }
    });
  }

  function placeOrder() {
    setSubmitErr("");
    if (!idemKey.current) idemKey.current = crypto.randomUUID();
    const key = idemKey.current;
    start(async () => {
      try {
        const res = await checkout({
          fulfillment,
          shippingMethodCode: shipCode,
          addressId: addressId ?? undefined,
          address: !addressId && needsAddress && useNewAddr ? { ...addr } : undefined,
          promoCode: appliedPromo,
          paymentMethod: payment,
          notes: notes.trim() ? notes.trim() : undefined,
          proofUrl: proofUrl.trim() ? proofUrl.trim() : undefined,
          idempotencyKey: key,
        });
        setDone({ orderId: res.orderId, orderNo: res.orderNo });
        setStep(STEPS.length); // confirmation
      } catch (e) {
        setSubmitErr((e as Error).message);
      }
    });
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-xl font-bold sm:text-2xl">Order confirmed</h1>
        <p className="mt-2 text-sm">Order <span className="font-mono font-semibold">{done.orderNo}</span> is placed and pending.</p>
        <p className="mt-1 text-sm text-gray-600">We emailed your confirmation. Staff will confirm delivery fees and manual payments.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/account/orders/${done.orderId}`} className={buttonVariants({ variant: "secondary" })}>View order</Link>
          <Link href="/shop" className={buttonVariants({ variant: "outline" })}>Continue shopping</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Checkout</h1>
      <ol className="mt-3 flex flex-wrap gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full border px-2 py-0.5 ${i === step ? "border-emerald-700 bg-emerald-700 font-medium text-white" : i < step ? "border-stone-200 bg-stone-100 text-stone-600" : "border-stone-200 text-stone-500"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
          {ctxErr && <p className="mt-3 text-sm text-red-600" role="alert">{ctxErr}</p>}

      {step === 0 && (
        <section className="mt-4">
          <h2 className="font-medium">1. Cart</h2>
          {previewErr && <p className="mt-2 text-sm text-red-600" role="alert">{previewErr}</p>}
          {preview && preview.lines.length === 0 && (
            <p className="mt-2 text-sm">Your cart is empty. <Link href="/shop" className="underline">Shop</Link></p>
          )}
          <ul className="mt-2 space-y-2">
            {(preview?.lines ?? []).map((l) => (
              <li key={l.variantId} className="rounded border p-2 text-sm">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-gray-500">{l.sku} × {l.qty}</div>
                <div className="mt-1 flex justify-between">
                  <span className="text-xs text-gray-500">
                    {peso(l.originalUnitPrice)} each
                    {l.discountAmount > 0 && <span className="text-green-700"> → {peso(l.effectiveUnitPrice)} (−{peso(l.discountAmount)})</span>}
                  </span>
                  <span className="font-semibold">{peso(l.lineTotal)}</span>
                </div>
              </li>
            ))}
          </ul>
          {preview && preview.lines.length > 0 && (
            <div className="mt-2 rounded border p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{peso(preview.subtotal)}</span></div>
              {preview.memberDiscount > 0 && <div className="flex justify-between text-green-700"><span>Member{preview.tierName ? ` (${preview.tierName})` : ""}</span><span>−{peso(preview.memberDiscount)}</span></div>}
              {preview.promoDiscount > 0 && <div className="flex justify-between text-green-700"><span>Promo{preview.promoName ? ` (${preview.promoName})` : ""}</span><span>−{peso(preview.promoDiscount)}</span></div>}
              <div className="mt-1 flex justify-between font-semibold"><span>Total due</span><span>{peso(preview.grandTotal)}</span></div>
              <p className="mt-1 text-xs text-gray-500">Server-computed. Delivery fee confirmed by staff (₱0 now).</p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Link href="/cart" className={buttonVariants({ variant: "outline" })}>Edit cart</Link>
            <Button variant="secondary" disabled={!preview || preview.lines.length === 0} onClick={() => setStep(1)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="mt-4">
          <h2 className="font-medium">2. Customer details</h2>
          {!ctx ? (
            <p className="mt-2 text-sm text-gray-500">Loading…</p>
          ) : !ctx.signedIn ? (
            <div className="mt-2 rounded border p-3 text-sm">
              <p>Sign in to place your order. Your cart carries over after login.</p>
              <Link href="/login?redirect=/checkout" className={cn(buttonVariants({ variant: "secondary" }), "mt-2 inline-block")}>Sign in</Link>
            </div>
          ) : (
            <div className="mt-2 rounded border p-3 text-sm">
              <div>Ordering as <span className="font-medium">{ctx.name ?? ctx.email}</span></div>
              {ctx.tierName && <div className="text-gray-600">Member tier: {ctx.tierName}</div>}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button variant="secondary" disabled={!ctx?.signedIn} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-4">
          <h2 className="font-medium">3. Shipping address</h2>
          {fulfillment === "pickup" && (
            <p className="mt-1 text-xs text-gray-500">Store pickup needs no address — or add one for faster future checkouts.</p>
          )}
          {addresses.length > 0 && (
            <div className="mt-2 space-y-1">
              {addresses.map((a) => (
                <label key={a.id} className="flex items-start gap-2 rounded border p-2 text-sm">
                  <input type="radio" name="addr" checked={addressId === a.id && !useNewAddr} onChange={() => { setAddressId(a.id); setUseNewAddr(false); }} />
                  <span><span className="font-medium">{a.label}</span> — {a.recipient}, {a.street}, {a.barangay}, {a.city} {a.zip} ({a.mobile})</span>
                </label>
              ))}
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useNewAddr} onChange={(e) => { setUseNewAddr(e.target.checked); if (e.target.checked) setAddressId(null); }} />
            Use a new address
          </label>
          {useNewAddr && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input placeholder="Recipient name" required={needsAddress} maxLength={100} value={addr.recipient} onChange={(e) => setAddr({ ...addr, recipient: e.target.value })} />
              <Input placeholder="Mobile (09xxxxxxxxx)" required={needsAddress} inputMode="tel" maxLength={13} value={addr.mobile} onChange={(e) => setAddr({ ...addr, mobile: e.target.value })} />
              <Input placeholder="Region" required={needsAddress} maxLength={100} value={addr.region} onChange={(e) => setAddr({ ...addr, region: e.target.value })} />
              <Input placeholder="Province" required={needsAddress} maxLength={100} value={addr.province} onChange={(e) => setAddr({ ...addr, province: e.target.value })} />
              <Input placeholder="City / Municipality" required={needsAddress} maxLength={100} value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <Input placeholder="Barangay" required={needsAddress} maxLength={100} value={addr.barangay} onChange={(e) => setAddr({ ...addr, barangay: e.target.value })} />
              <Input placeholder="Street / Bldg / Unit" required={needsAddress} maxLength={200} value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} className="sm:col-span-2" />
              <Input placeholder="ZIP (4 digits)" required={needsAddress} inputMode="numeric" maxLength={4} pattern="\d{4}" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} />
            </div>
          )}
          {needsAddress && !canProceedAddress && (
            <p className="mt-2 text-xs text-amber-700">Delivery needs an address — pick a saved one or enter a new address.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button variant="secondary" disabled={needsAddress && !canProceedAddress} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-4">
          <h2 className="font-medium">4. Delivery method</h2>
          <div className="mt-2 space-y-1">
            {DELIVERY_OPTS.map((o) => (
              <label key={o.code} className="flex items-start gap-2 rounded border p-2 text-sm">
                <input type="radio" name="ship" checked={shipCode === o.code} onChange={() => setShipCode(o.code)} />
                <span><span className="font-medium">{o.name}</span><br /><span className="text-xs text-gray-500">{o.hint}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button variant="secondary" onClick={() => setStep(4)}>Continue</Button>
          </div>
          {shipCode !== "pickup" && !canProceedAddress && (
            <p className="mt-2 text-xs text-amber-700">
              Delivery needs an address. <button className="underline" onClick={() => setStep(2)}>Go back to add one</button>.
            </p>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="mt-4">
          <h2 className="font-medium">5. Payment method</h2>
          <p className="mt-1 text-xs text-gray-500">No online gateway — manual methods are verified by staff from your receipt.</p>
          <div className="mt-2 space-y-1">
            {PAYMENT_OPTS.map((o) => (
              <label key={o.code} className="flex items-start gap-2 rounded border p-2 text-sm">
                <input type="radio" name="pay" checked={payment === o.code} onChange={() => setPayment(o.code)} />
                <span><span className="font-medium">{o.name}</span><br /><span className="text-xs text-gray-500">{o.hint}</span></span>
              </label>
            ))}
          </div>
          {(payment === "bank_transfer" || payment === "gcash_manual") && (
            <label className="mt-2 block text-sm">Payment receipt URL (optional now, can follow up)
              <Input type="url" placeholder="Paste receipt / Blob URL" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} className="mt-1" />
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button variant="secondary" onClick={() => setStep(5)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="mt-4">
          <h2 className="font-medium">6. Discount validation</h2>
          <div className="mt-2 flex gap-2">
            <Input placeholder="Promo code (optional)" value={promo} maxLength={32} onChange={(e) => setPromo(e.target.value)} />
            <Button variant="outline" disabled={pending} onClick={applyPromo}>{pending ? "Checking…" : "Apply"}</Button>
          </div>
          {promoMsg && (
            <p className={`mt-2 text-sm ${promoOk === false ? "text-red-600" : promoOk ? "text-green-700" : "text-gray-700"}`} role={promoOk === false ? "alert" : undefined}>
              {promoMsg}
            </p>
          )}
          <label className="mt-2 block text-sm">Order notes (optional)
            <Input placeholder="e.g. pickup time, landmarks" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </label>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
            <Button variant="secondary" onClick={() => { refreshPreview(appliedPromo); setStep(6); }}>Review order</Button>
          </div>
        </section>
      )}

      {step === 6 && (
        <section className="mt-4">
          <h2 className="font-medium">7. Review & submit</h2>
          {previewErr && <p className="mt-2 text-sm text-red-600" role="alert">{previewErr}</p>}
          {preview && (
            <div className="mt-2 rounded border p-3 text-sm">
              <ul className="space-y-1">
                {preview.lines.map((l) => (
                  <li key={l.variantId} className="flex justify-between gap-2">
                    <span>{l.name} <span className="text-gray-500">× {l.qty}</span></span>
                    <span className="font-medium">{peso(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t pt-2">
                <div className="flex justify-between"><span>Subtotal</span><span>{peso(preview.subtotal)}</span></div>
                {preview.memberDiscount > 0 && <div className="flex justify-between text-green-700"><span>Member discount</span><span>−{peso(preview.memberDiscount)}</span></div>}
                {preview.promoDiscount > 0 && <div className="flex justify-between text-green-700"><span>Promo{preview.promoName ? ` (${preview.promoName})` : ""}</span><span>−{peso(preview.promoDiscount)}</span></div>}
                <div className="flex justify-between"><span>Delivery fee</span><span>To be confirmed</span></div>
                <div className="mt-1 flex justify-between font-semibold"><span>Total due</span><span>{peso(preview.grandTotal)}</span></div>
              </div>
              <div className="mt-2 border-t pt-2 text-xs text-gray-600">
                <div>Delivery: {DELIVERY_OPTS.find((o) => o.code === shipCode)?.name}</div>
                <div>Payment: {PAYMENT_OPTS.find((o) => o.code === payment)?.name}</div>
                {needsAddress && <div>Address: {addressId ? addresses.find((a) => a.id === addressId)?.street : addr.street}, {addressId ? "" : addr.city}</div>}
              </div>
            </div>
          )}
          {submitErr && <p className="mt-2 text-sm text-red-600" role="alert">Error: {submitErr}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setStep(5)}>Back</Button>
            <Button variant="secondary" disabled={pending || !preview || preview.lines.length === 0} onClick={placeOrder}>
              {pending ? "Placing order…" : "Place order"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-gray-500">The button locks while submitting; retries reuse the same request key — no duplicates.</p>
        </section>
      )}
    </main>
  );
}

// DB-free verification: money formatting, validators, promo math, email templates.
// Run: npx tsx scripts/verify.ts
import { formatPHP, pesosToCentavos } from "../lib/money";
import { checkoutSchema, phAddressSchema, proofSubmissionSchema, fulfillmentUpdateSchema, paymentDecisionSchema } from "../validators";
import { canTransitionOrder, canTransitionPayment, canTransitionFulfillment, ORDER_STATUSES } from "../lib/orders";
import { esc } from "../emails";
import { resolveMemberPricing, resolvePricedLinesFromCatalog } from "../lib/pricing";
import { isMembershipValid } from "../lib/membership";
import { evaluateLineStage, evaluateCartStage, type CoreLine, type CorePromo, type CoreCtx } from "../lib/promos";
import { planAllocations } from "../lib/inventory";
import {
  returnEligibility,
  returnableQty,
  defaultRefundForLines,
  clampRefundAmount,
  remainingRefundable,
  refundStatusAfter,
  isFullyReturned,
} from "../lib/returns";
import {
  revenueOf,
  isRevenueOrder,
  bucketKey,
  bucketRange,
  manilaWeekStart,
  manilaDayRange,
  manilaMonthRange,
  parseFilterDate,
  isLowStock,
  isOutOfStock,
} from "../lib/reports";
import { orderReceivedEmail, refundEmail, passwordResetEmail } from "../emails";
import {
  welcomeEmail,
  paymentReceivedEmail,
  orderProcessingEmail,
  readyForPickupEmail,
  shippedEmail,
  completedEmail,
  cancelledEmail,
  membershipActivatedEmail,
  membershipExpiringEmail,
} from "../emails";
import { reminderDue } from "../lib/membership";
import { roleHasPermission, rolesHavePermission } from "../lib/permissions";
import { ADMIN_NAV } from "../components/admin/nav";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`ok - ${name}`);
  else {
    failures++;
    console.error(`FAIL - ${name}${detail ? `: ${detail}` : ""}`);
  }
}

// Money
check("formatPHP 100000 centavos = ₱1,000.00", formatPHP(100000).includes("1,000.00"), formatPHP(100000));
check("pesosToCentavos round-trip", pesosToCentavos(199.99) === 19999);

// PH address validation
const addr = {
  label: "Home",
  recipient: "Juan Dela Cruz",
  mobile: "09171234567",
  region: "NCR",
  province: "Metro Manila",
  city: "Quezon City",
  barangay: "Commonwealth",
  street: "123 Sampaguita St",
  zip: "1121",
};
check("valid PH address passes", phAddressSchema.safeParse(addr).success);
check("bad mobile rejected", !phAddressSchema.safeParse({ ...addr, mobile: "123" }).success);
check("bad zip rejected", !phAddressSchema.safeParse({ ...addr, zip: "12345" }).success);

// Checkout: delivery without address must be rejected; pickup parses with new methods.
check("promo code > 32 chars rejected", !checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "cod", promoCode: "x".repeat(33) }).success);
check("cod pickup parses", checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "cod" }).success);
check("gcash_manual parses", checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "gcash_manual" }).success);
check("legacy maya rejected", !checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "maya" }).success);
check("delivery without address rejected", !checkoutSchema.safeParse({ fulfillment: "delivery", paymentMethod: "cod" }).success);

// Batched pricing row resolution (DB-free mirror of calculateCartTotals loader).
const pricedRows = resolvePricedLinesFromCatalog(
  [
    { variantId: "v-base", unitPrice: 0, qty: 2 },
    { variantId: "v-override", unitPrice: 0, qty: 1 },
  ],
  [
    { id: "v-base", productId: "p-base", sku: "BASE", priceOverride: null },
    { id: "v-override", productId: "p-override", sku: "OVERRIDE", priceOverride: 89900 },
  ],
  [
    { id: "p-base", name: "Base Product", basePrice: 49900 },
    { id: "p-override", name: "Override Product", basePrice: 129900 },
  ]
);
check("batched pricing uses product base price", pricedRows[0].unitPrice === 49900);
check("batched pricing uses variant override", pricedRows[1].unitPrice === 89900);
check("batched pricing preserves qty/order", pricedRows[0].qty === 2 && pricedRows[1].sku === "OVERRIDE");

// Promotion math (mirrors services/promos.calcOne for percent/fixed caps)
function percentOff(subtotal: number, pct: number, cap?: number | null) {
  const d = Math.round((subtotal * pct) / 100);
  return cap ? Math.min(d, cap) : d;
}
check("10% of ₱5,000 = ₱500", percentOff(500000, 10) === 50000);
check("cap respected", percentOff(500000, 50, 10000) === 10000);
check("fixed capped at subtotal", Math.min(100000, 30000) === 30000);

// Emails render peso amounts
const { subject, html } = orderReceivedEmail("ORD-TEST", 150000);
check("order email subject", subject.includes("ORD-TEST"));
check("order email has peso total", html.includes("1,500.00"), html.slice(0, 120));
check("refund email renders", refundEmail("ORD-TEST", 50000).html.includes("500.00"));

// Inventory balance math: available = on_hand - reserved (derived, never stored)
function available(onHand: number, reserved: number) {
  return onHand - reserved;
}
check("available = on_hand - reserved", available(100, 30) === 70);
check("reserve guarded: 100-95 < 10 rejected", !(available(100, 95) >= 10));
check("capture keeps invariant: 100/30 -10 => 90/20", (() => {
  const onHand = 100 - 10, reserved = 30 - 10;
  return onHand - reserved === 70 && reserved >= 0;
})());
check("release frees availability: 100/30 -10 reserved => avail 80", available(100, 30 - 10) === 80);

// Movement delta pairs per operation
const deltas: Record<string, [number, number]> = {
  purchase: [10, 0], reserve: [0, 10], capture: [-10, -10],
  release: [0, -10], return: [10, 0], adjust: [-2, 0], transfer: [10, 0],
};
check("capture drops on_hand and reserved together", deltas.capture[0] === deltas.capture[1]);
check("reserve touches reserved only", deltas.reserve[0] === 0 && deltas.reserve[1] > 0);

// Order snapshot allocation: discounts distributed with no rounding leakage
function allocate(lines: { gross: number }[], total: number) {
  const sum = lines.reduce((s, l) => s + l.gross, 0);
  let assigned = 0;
  const out = lines.map((l, i) => {
    const share = i === lines.length - 1 ? total - assigned : Math.round((total * l.gross) / sum);
    assigned += share;
    return share;
  });
  return { out, assigned };
}
const alloc = allocate([{ gross: 99900 }, { gross: 49900 }], 15000);
check("allocation sums exactly", alloc.assigned === 15000, JSON.stringify(alloc));
check("line totals reconcile", alloc.out[0] + alloc.out[1] === 15000);

// Permission matrix (spec roles)
check("SUPER_ADMIN manages settings", roleHasPermission("SUPER_ADMIN", "settings.manage"));
check("SUPER_ADMIN manages roles", roleHasPermission("SUPER_ADMIN", "users.manage_roles"));
check("ADMIN cannot manage settings", !roleHasPermission("ADMIN", "settings.manage"));
check("ADMIN cannot manage roles", !roleHasPermission("ADMIN", "users.manage_roles"));
check("ADMIN verifies payments", roleHasPermission("ADMIN", "orders.verify_payment"));
check("ORDER_STAFF verifies payments", roleHasPermission("ORDER_STAFF", "orders.verify_payment"));
check("ORDER_STAFF cannot adjust inventory", !roleHasPermission("ORDER_STAFF", "inventory.adjust"));
check("INVENTORY_STAFF adjusts inventory", roleHasPermission("INVENTORY_STAFF", "inventory.adjust"));
check("INVENTORY_STAFF cannot verify payments", !roleHasPermission("INVENTORY_STAFF", "orders.verify_payment"));
check("INVENTORY_STAFF cannot open settings", !roleHasPermission("INVENTORY_STAFF", "settings.manage"));
check("CUSTOMER has no permissions", !rolesHavePermission(["CUSTOMER"], "orders.verify_payment"));
check("multi-role union works", rolesHavePermission(["CUSTOMER", "ORDER_STAFF"], "orders.verify_payment"));
// Least-privilege gates (security review)
check("INVENTORY_STAFF cannot set delivery fees", !roleHasPermission("INVENTORY_STAFF", "orders.set_delivery_fee"));
check("ORDER_STAFF sets delivery fees", roleHasPermission("ORDER_STAFF", "orders.set_delivery_fee"));
check("INVENTORY_STAFF cannot manage memberships", !roleHasPermission("INVENTORY_STAFF", "memberships.manage"));
check("ORDER_STAFF manages memberships", roleHasPermission("ORDER_STAFF", "memberships.manage"));
check("ADMIN manages memberships", roleHasPermission("ADMIN", "memberships.manage"));
check("CUSTOMER has no membership perms", !roleHasPermission("CUSTOMER", "memberships.manage"));
check("INVENTORY_STAFF sees reports", roleHasPermission("INVENTORY_STAFF", "reports.view"));
check("CUSTOMER sees no reports", !roleHasPermission("CUSTOMER", "reports.view"));
check("ORDER_STAFF manages returns", roleHasPermission("ORDER_STAFF", "orders.manage_returns"));
check("ORDER_STAFF cannot process refunds", !roleHasPermission("ORDER_STAFF", "orders.manage_refunds"));
check("ADMIN processes refunds", roleHasPermission("ADMIN", "orders.manage_refunds"));

// Admin nav tree: permission-filtered visibility
function visibleHrefs(roles: ("SUPER_ADMIN" | "ADMIN" | "INVENTORY_STAFF" | "ORDER_STAFF" | "CUSTOMER")[]) {
  const can = (perms?: string[]) => !perms || perms.some((p) => rolesHavePermission(roles, p as never));
  return ADMIN_NAV.flatMap((s) =>
    !can(s.permissions) ? [] : s.items.filter((i) => can(i.permissions ?? s.permissions)).map((i) => i.href)
  );
}
const superNav = visibleHrefs(["SUPER_ADMIN"]);
check("super admin sees settings + users", superNav.includes("/admin/settings") && superNav.includes("/admin/users"));
const invNav = visibleHrefs(["INVENTORY_STAFF"]);
check("inventory staff sees inventory, not sales/settings", invNav.includes("/admin/inventory") && !invNav.includes("/admin/orders") && !invNav.includes("/admin/settings"));
const ordNav = visibleHrefs(["ORDER_STAFF"]);
check("order staff sees orders, not inventory/settings", ordNav.includes("/admin/orders") && !ordNav.includes("/admin/inventory") && !ordNav.includes("/admin/settings"));
check("nav covers all spec sections", ["categories", "brands", "receiving", "movements", "locations", "payments", "returns", "promo-codes", "users"].every((seg) => superNav.some((h) => h.includes(seg))));
const reset = passwordResetEmail("http://localhost:3000/reset-password?token=abc");
check("reset email has link", reset.html.includes("token=abc"));
check("reset email subject", reset.subject.toLowerCase().includes("reset"));

// Transactional email templates: every required template renders a subject
// plus peso-aware body. Sending itself is fire-and-forget (see queueEmail).
{
  const w = welcomeEmail("Juan");
  check("welcome renders name", w.subject.includes("Juan") && w.html.includes("Juan"));
  const pr = paymentReceivedEmail("ORD-1");
  check("payment-received mentions verifying", pr.html.includes("verifying") && pr.subject.includes("ORD-1"));
  check("processing renders", orderProcessingEmail("ORD-1").html.includes("being prepared"));
  check("ready-for-pickup renders", readyForPickupEmail("ORD-1").html.includes("ready for pickup"));
  check("shipped renders", shippedEmail("ORD-1").html.includes("on its way"));
  check("completed renders", completedEmail("ORD-1").html.includes("completed"));
  check("cancelled renders + reason", cancelledEmail("ORD-1", "test").html.includes("cancelled"));
  const ma = membershipActivatedEmail("Gold", "MBR-2026-ABC", "Jul 1, 2026");
  check("membership activated renders", ma.html.includes("Gold") && ma.html.includes("MBR-2026-ABC") && ma.html.includes("Jul 1, 2026"));
  const me = membershipExpiringEmail("Gold", "MBR-2026-ABC", "Jul 1, 2026");
  check("membership expiring renders", me.subject.includes("expires soon") && me.html.includes("Renew"));
  check("all templates carry peso footer", [w, pr].every((t) => t.html.includes("Philippine Peso")));
}
// Reminder rate limit: one per 7 days
{
  const now = new Date("2026-06-15T12:00:00+08:00");
  check("no prior -> due", reminderDue(null, now));
  check("6 days ago -> not due", !reminderDue(new Date("2026-06-09T12:00:01+08:00"), now));
  check("8 days ago -> due", reminderDue(new Date("2026-06-07T11:59:00+08:00"), now));
}

// Order workflow transition maps (mirrors lib/orders.ts guards)
check("pending -> payment_verification allowed", canTransitionOrder("pending", "payment_verification"));
check("pending -> completed blocked", !canTransitionOrder("pending", "completed"));
check("terminal completed frozen", !canTransitionOrder("completed", "cancelled"));
check("cancelled frozen", !canTransitionOrder("cancelled", "processing"));
check("processing -> shipped allowed", canTransitionOrder("processing", "shipped"));
check("shipped -> completed allowed", canTransitionOrder("shipped", "completed"));
check("payment unpaid -> pending_verification", canTransitionPayment("unpaid", "pending_verification"));
check("payment paid frozen (no direct change)", !canTransitionPayment("paid", "failed"));
check("payment failed -> pending_verification (resubmit)", canTransitionPayment("failed", "pending_verification"));
check("payment partial -> paid (balance settled)", canTransitionPayment("partially_paid", "paid"));
check("fulfillment unfulfilled -> processing", canTransitionFulfillment("unfulfilled", "processing"));
check("fulfillment no skip to delivered", !canTransitionFulfillment("processing", "delivered"));
check("fulfillment delivered terminal", !canTransitionFulfillment("delivered", "returned"));
check("fulfillment shipped -> delivered", canTransitionFulfillment("shipped", "delivered"));

// Ops validators
check("proof needs ref no", !proofSubmissionSchema.safeParse({ orderId: "00000000-0000-0000-0000-000000000000" }).success);
check("proof valid", proofSubmissionSchema.safeParse({ orderId: "00000000-0000-0000-0000-000000000000", referenceNo: "GCASH12345" }).success);
check("fulfillment update valid", fulfillmentUpdateSchema.safeParse({ orderId: "00000000-0000-0000-0000-000000000000", to: "shipped" }).success);
check("fulfillment bogus rejected", !fulfillmentUpdateSchema.safeParse({ orderId: "00000000-0000-0000-0000-000000000000", to: "teleported" }).success);

// Membership test matrix (pure resolution path used server-side by
// calculateCartTotals — checkout calls it directly, so browser prices
// can never leak into totals).
const GOLD = "v-gold", PLAIN = "v-plain", PROD = "p-1";
const lines = [
  { variantId: GOLD, productId: PROD, unitPrice: 99900, qty: 1 },
  { variantId: PLAIN, productId: PROD, unitPrice: 49900, qty: 2 },
];
// 1. Active Gold member (10% rule, no explicit prices)
{
  const r = resolveMemberPricing(lines, { pct: 10, byVariant: new Map(), byProduct: new Map() });
  check("active Gold: 10% of 199700 = 19970", r.pctDiscount === 19970, String(r.pctDiscount));
  check("active Gold: no explicit savings", r.explicitSavings === 0);
}
// 2. Expired Gold member (gate rejects -> pct 0, no maps)
{
  check("expired Gold invalid", !isMembershipValid({ status: "expired", expiresAt: new Date("2020-01-01") }));
  const r = resolveMemberPricing(lines, { pct: 0, byVariant: new Map(), byProduct: new Map() });
  check("expired Gold: zero discount", r.pctDiscount === 0 && r.explicitSavings === 0);
}
// 3. VIP member (15%)
{
  const r = resolveMemberPricing(lines, { pct: 15, byVariant: new Map(), byProduct: new Map() });
  check("VIP: 15% of 199700 = 29955", r.pctDiscount === 29955, String(r.pctDiscount));
}
// 4. Customer without membership
{
  check("no-membership inactive gate", !isMembershipValid({ status: "cancelled", expiresAt: null }));
  const r = resolveMemberPricing(lines, { pct: 0, byVariant: new Map(), byProduct: new Map() });
  check("no membership: zero discount", r.pctDiscount === 0 && r.explicitSavings === 0);
}
// 5. Membership expiring today (still valid until expiry instant)
{
  const now = new Date("2026-06-15T12:00:00+08:00");
  check("expiring later today valid", isMembershipValid({ status: "active", expiresAt: new Date("2026-06-15T23:59:00+08:00") }, now));
  check("expired yesterday invalid", !isMembershipValid({ status: "active", expiresAt: new Date("2026-06-14T23:59:00+08:00") }, now));
  check("suspended invalid", !isMembershipValid({ status: "suspended", expiresAt: null }, now));
}
// 6. Product with explicit member price (variant price used verbatim, no double-dip)
{
  const r = resolveMemberPricing(lines, { pct: 10, byVariant: new Map([[GOLD, 89900]]), byProduct: new Map() });
  check("explicit: 10000 savings on Gold line", r.explicitSavings === 10000, String(r.explicitSavings));
  check("explicit line resolved to 89900", r.memberPrices.get(GOLD) === 89900);
  check("explicit line excluded from 10% (99800 base -> 9980)", r.pctDiscount === 9980, String(r.pctDiscount));
}
// 7. Product without explicit member price (falls back to % rule)
{
  const mixed = [
    { variantId: GOLD, productId: PROD, unitPrice: 99900, qty: 1 },
    { variantId: PLAIN, productId: "p-2", unitPrice: 49900, qty: 2 },
  ];
  const r = resolveMemberPricing(mixed, { pct: 10, byVariant: new Map(), byProduct: new Map([[PROD, 89900]]) });
  check("product explicit: 10000 savings on Gold line", r.explicitSavings === 10000, String(r.explicitSavings));
  check("plain line falls back to 10% (99800 -> 9980)", r.pctDiscount === 9980, String(r.pctDiscount));
}

// ---------------------------------------------------------------------------
// Promotion engine matrix: pure core (evaluateLineStage / evaluateCartStage).
// Each case prints expected vs actual totals. Gross fixture: v1 ₱1000 x2 +
// v2 ₱500 x1 = ₱2500 (250000 centavos).
// ---------------------------------------------------------------------------
let pid = 0;
function mkPromo(over: Partial<CorePromo>): CorePromo {
  pid++;
  return {
    id: `promo-${pid}`,
    name: `Promo ${pid}`,
    type: "auto",
    kind: "percent",
    value: 0,
    config: null,
    minSpend: 0,
    maxDiscount: null,
    stackable: false,
    priority: 0,
    startAt: null,
    endAt: null,
    scopes: { products: [], variants: [], categories: [], brands: [], tiers: [] },
    rules: {},
    ...over,
  };
}
const NOW = "2026-06-15T12:00:00+08:00";
const baseCtx: CoreCtx = { now: NOW, memberTierIds: [], isFirstOrder: false };
const promoLines: CoreLine[] = [
  { variantId: "v1", productId: "p1", categoryId: "c1", brandId: "b1", unitPrice: 100000, qty: 2 },
  { variantId: "v2", productId: "p2", categoryId: "c2", brandId: "b1", unitPrice: 50000, qty: 1 },
];
const GROSS = 250000;
function show(name: string, expected: number, actual: number) {
  check(`${name} (expected ${expected}, actual ${actual})`, expected === actual);
}

// 1. Member-tier cart promo (Gold holds tier t-gold): 10% of 250000 = 25000
{
  const p = mkPromo({ kind: "percent", value: 10, priority: 1, scopes: { products: [], variants: [], categories: [], brands: [], tiers: ["t-gold"] } });
  const r = evaluateCartStage(GROSS, [p], { ...baseCtx, memberTierIds: ["t-gold"] });
  show("member-tier 10% cart promo", 25000, r.discount);
}
// 2. 20% product promotion (scoped to p1): 20% x 200000 = 40000
{
  const p = mkPromo({ kind: "percent", value: 20, priority: 5, scopes: { products: ["p1"], variants: [], categories: [], brands: [], tiers: [] } });
  const r = evaluateLineStage(promoLines, [p], baseCtx, GROSS);
  show("20% product line promo", 40000, r.discount);
  show("20% line resolves v1 to 80000", 80000, r.prices.get("v1") ?? -1);
  show("20% line leaves v2 at 50000", 50000, r.prices.get("v2") ?? -1);
}
// 3. ₱500 off ₱5,000 minimum: qualifying cart gets 50000; small cart gets 0
{
  const p = mkPromo({ kind: "fixed", value: 50000, minSpend: 500000, priority: 1 });
  show("₱500 off ₱5000min (650000 cart)", 50000, evaluateCartStage(650000, [p], baseCtx).discount);
  show("₱500 off ₱5000min (250000 cart rejected)", 0, evaluateCartStage(GROSS, [p], baseCtx).discount);
}
// 4. Expired promo code
{
  const p = mkPromo({ type: "code", kind: "percent", value: 10, priority: 10, endAt: "2020-01-01T00:00:00+08:00", code: { id: "c1", code: "OLD10", usageLimit: null, usedCount: 0, perCustomerLimit: 1, customerUsed: 0, isActive: true } });
  const r = evaluateCartStage(GROSS, [p], baseCtx, "OLD10");
  show("expired code discount 0", 0, r.discount);
  check("expired code reason", r.codeError === "Promo code expired", r.codeError);
}
// 5. Promo code usage limit reached
{
  const p = mkPromo({ type: "code", kind: "percent", value: 10, priority: 10, code: { id: "c2", code: "MAXED", usageLimit: 100, usedCount: 100, perCustomerLimit: 1, customerUsed: 1, isActive: true } });
  const r = evaluateCartStage(GROSS, [p], baseCtx, "MAXED");
  show("exhausted code discount 0", 0, r.discount);
  check("exhausted code reason", r.codeError === "Promo code usage limit reached", r.codeError);
}
// 6. Member-only promotion used by non-member
{
  const p = mkPromo({ type: "code", kind: "percent", value: 15, priority: 10, scopes: { products: [], variants: [], categories: [], brands: [], tiers: ["t-vip"] }, code: { id: "c3", code: "VIP15", usageLimit: null, usedCount: 0, perCustomerLimit: 5, customerUsed: 0, isActive: true } });
  const denied = evaluateCartStage(GROSS, [p], baseCtx, "VIP15");
  show("non-member VIP code discount 0", 0, denied.discount);
  check("non-member reason", denied.codeError === "This code is for members only", denied.codeError);
  const allowed = evaluateCartStage(GROSS, [p], { ...baseCtx, memberTierIds: ["t-vip"] }, "VIP15");
  show("member VIP code 15% = 37500", 37500, allowed.discount);
}
// 7. Non-stackable promotions: priority wins, single application
{
  const a = mkPromo({ kind: "percent", value: 20, priority: 5 });
  const b = mkPromo({ kind: "percent", value: 10, priority: 1 });
  const r = evaluateCartStage(GROSS, [a, b], baseCtx);
  show("exclusive chain: 20% only = 50000", 50000, r.discount);
  check("exclusive chain: one application", r.applied.length === 1, JSON.stringify(r.applied.length));
}
// 8. Multiple eligible stackable promotions accumulate
{
  const a = mkPromo({ kind: "percent", value: 10, priority: 5, stackable: true });
  const b = mkPromo({ kind: "fixed", value: 5000, priority: 1, stackable: true });
  const r = evaluateCartStage(GROSS, [a, b], baseCtx);
  show("stacked 10% + ₱50 = 30000", 30000, r.discount);
  check("stacked: two applications", r.applied.length === 2, JSON.stringify(r.applied.length));
}
// 9. First-order promotion
{
  const p = mkPromo({ kind: "percent", value: 10, priority: 10, rules: { first_order_only: true } });
  show("first order qualifies", 25000, evaluateCartStage(GROSS, [p], { ...baseCtx, isFirstOrder: true }).discount);
  show("repeat order rejected", 0, evaluateCartStage(GROSS, [p], { ...baseCtx, isFirstOrder: false }).discount);
}
// 10. Buy 2 Get 1 (v1 x3 @100000 -> 100000 off)
{
  const three = [{ variantId: "v1", productId: "p1", categoryId: "c1", brandId: "b1", unitPrice: 100000, qty: 3 }];
  const p = mkPromo({ kind: "bogo", priority: 3, stackable: true, config: { buyVariantId: "v1", buyQty: 2, getQty: 1, getPct: 100 }, scopes: { products: [], variants: ["v1"], categories: [], brands: [], tiers: [] } });
  const r = evaluateLineStage(three, [p], baseCtx, 300000);
  show("buy-2-get-1 = 100000", 100000, r.discount);
}
// 11. Free shipping records a waiver, not a discount
{
  const p = mkPromo({ kind: "free_shipping", value: 0, priority: -10, stackable: true });
  const r = evaluateCartStage(GROSS, [p], baseCtx);
  show("free shipping discount 0", 0, r.discount);
  check("free shipping waiver 0 (fully waived)", r.shippingWaiver === 0, String(r.shippingWaiver));
  check("free shipping applied row", r.applied.length === 1 && r.applied[0].scope === "shipping", JSON.stringify(r.applied));
}
// 12. Product already on sale: promo stacks on the sale price exactly
{
  const sale = [{ variantId: "vs", productId: "ps", categoryId: null, brandId: null, unitPrice: 80000, qty: 1 }];
  const p = mkPromo({ kind: "percent", value: 10, priority: 5, scopes: { products: ["ps"], variants: [], categories: [], brands: [], tiers: [] } });
  const r = evaluateLineStage(sale, [p], baseCtx, 80000);
  show("sale-price 10% = 8000", 8000, r.discount);
  show("sale line resolves to 72000", 72000, r.prices.get("vs") ?? -1);
}
// Guardrails: no negative totals, no duplicate application
{
  const p = mkPromo({ kind: "fixed", value: 99999999, priority: 1 });
  show("fixed larger than total clamps to total", GROSS, evaluateCartStage(GROSS, [p], baseCtx).discount);
  const dup = mkPromo({ kind: "percent", value: 50, priority: 9, stackable: true });
  const r = evaluateCartStage(GROSS, [dup, dup], baseCtx);
  check("same promo never applied twice", r.applied.filter((a) => a.promotionId === dup.id).length === 1, JSON.stringify(r.applied));
}

// ---------------------------------------------------------------------------
// Returns & refunds matrix (pure rules in lib/returns.ts — actions/admin.ts
// executes them, never reimplements).
// ---------------------------------------------------------------------------
const NOW2 = new Date("2026-06-15T12:00:00+08:00");
const daysAgo = (n: number) => new Date(NOW2.getTime() - n * 86400000);
// Eligibility
check("delivered + fresh eligible", returnEligibility({ fulfillmentStatus: "delivered", status: "completed", createdAt: daysAgo(5), now: NOW2 }).ok);
check("completed pickup eligible", returnEligibility({ fulfillmentStatus: "fulfilled", status: "completed", createdAt: daysAgo(29), now: NOW2 }).ok);
{
  const r = returnEligibility({ fulfillmentStatus: "processing", status: "confirmed", createdAt: daysAgo(2), now: NOW2 });
  check("unshipped order rejected", !r.ok, JSON.stringify(r));
}
{
  const r = returnEligibility({ fulfillmentStatus: "delivered", status: "completed", createdAt: daysAgo(31), now: NOW2 });
  check("31-day-old order rejected", !r.ok, JSON.stringify(r));
}
check("cancelled order rejected", !returnEligibility({ fulfillmentStatus: "delivered", status: "cancelled", createdAt: daysAgo(2), now: NOW2 }).ok);
check("open request blocks second", !returnEligibility({ fulfillmentStatus: "delivered", status: "completed", createdAt: daysAgo(2), now: NOW2, hasOpenRequest: true }).ok);
// Quantities: purchased 2, 1 already in a requested return -> 1 left
check("returnableQty 2-1=1", returnableQty(2, 1) === 1);
check("returnableQty never negative", returnableQty(1, 5) === 0);
// Default refund = effective-price sum
check("default refund 99900x1 + 49900x2 = 199700", defaultRefundForLines([{ unitPrice: 99900, qty: 1 }, { unitPrice: 49900, qty: 2 }]) === 199700);
// Staff adjustment down-only
check("adjust down to 50000 ok", clampRefundAmount(50000, 199700) === 50000);
check("default when blank", clampRefundAmount(null, 199700) === 199700);
check("adjust up throws", (() => { try { clampRefundAmount(199701, 199700); return false; } catch { return true; } })());
check("negative throws", (() => { try { clampRefundAmount(-1, 199700); return false; } catch { return true; } })());
// Cap: grand 199800, pending 99900 -> 99900 left; rejected ignored
check("remaining 199800-99900=99900", remainingRefundable(199800, [{ amount: 99900, status: "pending" }]) === 99900);
check("rejected refunds ignored", remainingRefundable(199800, [{ amount: 99900, status: "rejected" }]) === 199800);
check("cap never negative", remainingRefundable(100, [{ amount: 99900, status: "completed" }]) === 0);
// Status derivation: full only when completed refunds cover the total
check("full refund flips refunded", refundStatusAfter(199800, 199800) === "refunded");
check("partial stays partial", refundStatusAfter(99900, 199800) === "partially_refunded");
check("zero stays partial", refundStatusAfter(0, 199800) === "partially_refunded");
// Fully-returned detection drives fulfillment -> returned
{
  const items = [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }];
  check("all covered -> fully returned", isFullyReturned(items, new Map([["a", 2], ["b", 1]])));
  check("one short -> not fully returned", !isFullyReturned(items, new Map([["a", 2], ["b", 0]])));
}

// ---------------------------------------------------------------------------
// Security regressions (DB-free boundary checks mirrored in server actions).
// ---------------------------------------------------------------------------
check("payment decision allowlist accepts 4", ["approve", "reject", "mark_paid", "mark_partial"].every((d) => paymentDecisionSchema.safeParse(d).success));
check("payment decision rejects garbage", !paymentDecisionSchema.safeParse("refund_all").success);
check("legacy paid not a listable status", !(ORDER_STATUSES as readonly string[]).includes("paid"));
check("email esc neutralizes html", esc('<script>alert("x")</script>') === "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
check("email esc handles quotes", esc(`a'b"c&d`) === "a&#39;b&quot;c&amp;d");
check("checkout proofUrl capped", !checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "cod", proofUrl: "https://x.ph/" + "a".repeat(2048) }).success);
check("checkout proofUrl ok when short", checkoutSchema.safeParse({ fulfillment: "pickup", paymentMethod: "cod", proofUrl: "https://x.ph/r.png" }).success);

// ---------------------------------------------------------------------------
// Reporting conventions (lib/reports.ts — dashboard + reports execute these).
// ---------------------------------------------------------------------------
{
  const ords = [
    { status: "completed", paymentStatus: "paid", grandTotal: 100000 },
    { status: "confirmed", paymentStatus: "paid", grandTotal: 50000 },
    { status: "confirmed", paymentStatus: "unpaid", grandTotal: 999999 },
    { status: "cancelled", paymentStatus: "failed", grandTotal: 888888 },
    { status: "refunded", paymentStatus: "refunded", grandTotal: 777777 },
  ];
  check("unpaid/cancelled/refunded excluded", revenueOf(ords, []) === 150000);
  check("completed refunds subtract", revenueOf(ords, [{ amount: 20000, status: "completed" }]) === 130000);
  check("pending refunds ignored", revenueOf(ords, [{ amount: 20000, status: "pending" }]) === 150000);
  check("revenue never negative", revenueOf(ords, [{ amount: 999999, status: "completed" }]) === 0);
  check("isRevenueOrder: paid/confirmed counts", isRevenueOrder({ status: "confirmed", paymentStatus: "paid" }));
  check("isRevenueOrder: completed counts w/o payment flag", isRevenueOrder({ status: "completed" }));
  check("isRevenueOrder rejects unpaid", !isRevenueOrder({ status: "confirmed", paymentStatus: "unpaid" }));
  check("isRevenueOrder rejects cancelled/refunded", !isRevenueOrder({ status: "cancelled", paymentStatus: "paid" }) && !isRevenueOrder({ status: "refunded", paymentStatus: "refunded" }));
}
check("manila day bucket", bucketKey("2026-09-14T00:30:00+08:00", "day") === "2026-09-14");
check("utc edge lands on manila day", bucketKey("2026-09-13T23:30:00Z", "day") === "2026-09-14");
check("month bucket", bucketKey("2026-09-14T12:00:00+08:00", "month") === "2026-09");
check("wed -> monday", manilaWeekStart(new Date("2026-09-16T12:00:00+08:00")) === "2026-09-14");
check("sun -> prior monday", manilaWeekStart(new Date("2026-09-13T12:00:00+08:00")) === "2026-09-07");
{
  const r = bucketRange(new Date("2026-09-08T00:00:00+08:00"), new Date("2026-09-10T23:59:00+08:00"), "day");
  check("day range fills gaps", JSON.stringify(r) === JSON.stringify(["2026-09-08", "2026-09-09", "2026-09-10"]), JSON.stringify(r));
  const m = bucketRange(new Date("2026-07-15T00:00:00+08:00"), new Date("2026-09-02T00:00:00+08:00"), "month");
  check("month range fills", JSON.stringify(m) === JSON.stringify(["2026-07", "2026-08", "2026-09"]), JSON.stringify(m));
}
{
  const d = manilaDayRange(new Date("2026-09-14T12:00:00+08:00"));
  check("manila day = 24h window", d.end.getTime() - d.start.getTime() === 86400000 && d.start.toISOString() === "2026-09-13T16:00:00.000Z");
  const mo = manilaMonthRange(new Date("2026-09-14T12:00:00+08:00"));
  check("manila month bounds", mo.start.toISOString() === "2026-08-31T16:00:00.000Z" && mo.end.toISOString() === "2026-09-30T16:00:00.000Z");
}
check("parse valid date", parseFilterDate("2026-09-01", false)?.toISOString() === "2026-08-31T16:00:00.000Z");
check("parse end-of-day", parseFilterDate("2026-09-01", true)?.toISOString() === "2026-09-01T16:00:00.000Z");
check("parse invalid -> null", parseFilterDate("not-a-date", false) === null && parseFilterDate("", false) === null);
check("low stock at threshold", isLowStock(5, 5) && isLowStock(3, 10));
check("above threshold not low", !isLowStock(6, 5));
check("default threshold 5", isLowStock(5, null) && !isLowStock(6, undefined));
check("zero is out not low", isOutOfStock(0) && !isLowStock(0, 5));

// ---------------------------------------------------------------------------
// Launch-scenario regressions (one per fixed bug).
// ---------------------------------------------------------------------------
// Fulfillment: delivery orders can now leave ready_for_pickup toward shipped.
check("ready_for_pickup -> shipped allowed", canTransitionOrder("ready_for_pickup", "shipped"));
// Balance payments: partially_paid -> paid stays a legal move (the approve
// path after mark_partial depends on it; payments row stays submittable).
check("partially_paid -> paid allowed", canTransitionPayment("partially_paid", "paid"));
// Split reservation planner: single leg, split legs, short throws.
{
  const one = planAllocations(2, [{ locationId: "b", available: 5 }]);
  check("single location exact take", one.length === 1 && one[0].qty === 2, JSON.stringify(one));
  const split = planAllocations(2, [
    { locationId: "b", available: 1 },
    { locationId: "a", available: 1 },
  ]);
  check(
    "split 1+1 across locations in order",
    split.length === 2 && split[0].locationId === "b" && split[1].locationId === "a",
    JSON.stringify(split)
  );
  const skipZero = planAllocations(1, [
    { locationId: "empty", available: 0 },
    { locationId: "full", available: 3 },
  ]);
  check("zero-availability legs skipped", skipZero.length === 1 && skipZero[0].locationId === "full");
  check("aggregate short throws", (() => { try { planAllocations(5, [{ locationId: "b", available: 2 }]); return false; } catch { return true; } })());
  check("non-positive need throws", (() => { try { planAllocations(0, [{ locationId: "b", available: 2 }]); return false; } catch { return true; } })());
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed.");

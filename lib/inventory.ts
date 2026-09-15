import { inventoryBalances, inventoryMovements, type MovementType } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";

export type { MovementType };

// ---------------------------------------------------------------------------
// Concurrency contract (see CRITICAL INVENTORY TEST notes):
// - EVERY function here requires an explicit Tx. Movements must never be
//   written outside the transaction that mutates the balance (split-brain).
// - Row locks (SELECT ... FOR UPDATE) are always acquired in a deterministic
//   order — (variantId, locationId) ascending — so concurrent checkouts can
//   never deadlock on lock ordering.
// - available = on_hand - reserved is derived, never stored, and guarded by
//   table CHECK constraints (on_hand >= 0, reserved >= 0, reserved <= on_hand)
//   as the last line of defense.
// - Balance rows are NEVER written without a movement row in the same tx, and
//   movement rows are append-only (no UPDATE/DELETE paths exist in this codebase).
// - Damaged returns use recordMovement with a DAMAGE reason and ZERO deltas:
//   the row is the audit trail, balances are untouched, and damaged stock is
//   NEVER restocked. DAMAGE is deliberately absent from the increaseStock
//   allowlist so no code path can credit on-hand for damaged goods.
// ---------------------------------------------------------------------------

export type MovementCtx = {
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdBy?: string | null;
  unitCost?: number | null;
  supplier?: string | null;
  reference?: string | null;
};

export async function recordMovement(
  opts: {
    variantId: string;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    qtyOnHandChange: number; // signed
    qtyReservedChange: number; // signed
    balanceAfter?: number | null;
    reservedAfter?: number | null;
    reason: MovementType;
    refType?: string | null;
    refId?: string | null;
    note?: string | null;
    createdBy?: string | null;
    unitCost?: number | null;
    supplier?: string | null;
    reference?: string | null;
  },
  tx: Tx
) {
  await tx.insert(inventoryMovements).values({
    variantId: opts.variantId,
    fromLocationId: opts.fromLocationId ?? null,
    toLocationId: opts.toLocationId ?? null,
    qtyOnHandChange: opts.qtyOnHandChange,
    qtyReservedChange: opts.qtyReservedChange,
    balanceAfter: opts.balanceAfter ?? null,
    reservedAfter: opts.reservedAfter ?? null,
    unitCost: opts.unitCost ?? null,
    supplier: opts.supplier ?? null,
    reference: opts.reference ?? null,
    reason: opts.reason,
    refType: opts.refType ?? null,
    refId: opts.refId ?? null,
    note: opts.note ?? null,
    createdBy: opts.createdBy ?? null,
  });
}

type BalanceRow = { id: string; onHand: number; reserved: number };

async function lockBalance(tx: Tx, variantId: string, locationId: string): Promise<BalanceRow | undefined> {
  const res = await tx.execute(
    sql`SELECT id, on_hand AS "onHand", reserved FROM inventory_balances WHERE variant_id = ${variantId} AND location_id = ${locationId} FOR UPDATE`
  );
  const row = res.rows[0] as { id: string; onHand: number; reserved: number } | undefined;
  return row ? { id: row.id, onHand: Number(row.onHand), reserved: Number(row.reserved) } : undefined;
}

/** Deterministic lock ordering: sort keys so concurrent txns never deadlock. */
export function orderLockKeys(keys: { variantId: string; locationId: string }[]) {
  return [...keys].sort((a, b) =>
    a.variantId === b.variantId
      ? (a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0)
      : a.variantId < b.variantId
        ? -1
        : 1
  );
}

/**
 * Pure split planner: given needed qty and per-location availability (in
 * deterministic location order), return take-per-location legs. Throws when
 * aggregate stock is short. The checkout tx executes each leg via
 * reserveStock, which re-checks under SELECT ... FOR UPDATE.
 */
export function planAllocations(
  needed: number,
  availability: { locationId: string; available: number }[]
): { locationId: string; qty: number }[] {
  if (!Number.isInteger(needed) || needed <= 0) throw new Error("Needed qty must be a positive integer");
  const legs: { locationId: string; qty: number }[] = [];
  let remaining = needed;
  for (const loc of availability) {
    if (remaining <= 0) break;
    if (loc.available <= 0) continue;
    const take = Math.min(remaining, Math.floor(loc.available));
    if (take <= 0) continue;
    legs.push({ locationId: loc.locationId, qty: take });
    remaining -= take;
  }
  if (remaining > 0) throw new Error(`Insufficient stock (short ${remaining})`);
  return legs;
}

// Reserve at checkout: increments reserved, guarded by available = on_hand - reserved.
// Throws when no balance row exists (fail-closed: no row means no stock).
export async function reserveStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  ctx: MovementCtx = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  const row = await lockBalance(tx, variantId, locationId);
  if (!row) throw new Error("Insufficient available stock (no balance at location)");
  if (row.onHand - row.reserved < qty) {
    throw new Error(`Insufficient available stock (have ${row.onHand - row.reserved}, need ${qty})`);
  }
  const nextReserved = row.reserved + qty;
  await tx
    .update(inventoryBalances)
    .set({ reserved: nextReserved, updatedAt: new Date() })
    .where(eq(inventoryBalances.id, row.id));
  await recordMovement(
    {
      variantId,
      fromLocationId: locationId,
      qtyOnHandChange: 0,
      qtyReservedChange: qty,
      balanceAfter: row.onHand,
      reservedAfter: nextReserved,
      reason: "RESERVATION",
      ...ctx,
    },
    tx
  );
  return { onHand: row.onHand, reserved: nextReserved };
}

// Capture on payment verify/fulfillment: reserved -> sold (both drop). Writes SALE.
export async function captureStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  ctx: MovementCtx = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  const row = await lockBalance(tx, variantId, locationId);
  if (!row || row.reserved < qty) throw new Error("Capture exceeds reserved quantity");
  const next = { onHand: row.onHand - qty, reserved: row.reserved - qty };
  await tx
    .update(inventoryBalances)
    .set({ onHand: next.onHand, reserved: next.reserved, updatedAt: new Date() })
    .where(eq(inventoryBalances.id, row.id));
  await recordMovement(
    {
      variantId,
      fromLocationId: locationId,
      qtyOnHandChange: -qty,
      qtyReservedChange: -qty,
      balanceAfter: next.onHand,
      reservedAfter: next.reserved,
      reason: "SALE",
      ...ctx,
    },
    tx
  );
  return next;
}

// Release on cancel/reject: frees reserved back to available.
export async function releaseStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  ctx: MovementCtx = {},
  reason: MovementType = "RESERVATION_RELEASE"
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  if (reason !== "RESERVATION_RELEASE" && reason !== "ORDER_CANCELLATION") {
    throw new Error("Invalid release movement type");
  }
  const row = await lockBalance(tx, variantId, locationId);
  if (!row || row.reserved < qty) throw new Error("Release exceeds reserved quantity");
  const nextReserved = row.reserved - qty;
  await tx
    .update(inventoryBalances)
    .set({ reserved: nextReserved, updatedAt: new Date() })
    .where(eq(inventoryBalances.id, row.id));
  await recordMovement(
    {
      variantId,
      fromLocationId: locationId,
      qtyOnHandChange: 0,
      qtyReservedChange: -qty,
      balanceAfter: row.onHand,
      reservedAfter: nextReserved,
      reason,
      ...ctx,
    },
    tx
  );
  return { onHand: row.onHand, reserved: nextReserved };
}

// Stock IN (receiving / opening stock): atomic upsert — no lost updates, no
// duplicate-key races under concurrency. Writes STOCK_RECEIVED (or override).
export async function receiveStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  ctx: MovementCtx & { movementType?: MovementType } = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  const { movementType, ...rest } = ctx;
  const reason = movementType ?? "STOCK_RECEIVED";
  if (reason !== "STOCK_RECEIVED" && reason !== "OPENING_STOCK" && reason !== "REFUND_RESTOCK" && reason !== "CUSTOMER_RETURN") {
    throw new Error("Invalid stock-in movement type");
  }
  const rows = await tx
    .insert(inventoryBalances)
    .values({ variantId, locationId, onHand: qty, reserved: 0 })
    .onConflictDoUpdate({
      target: [inventoryBalances.variantId, inventoryBalances.locationId],
      set: { onHand: sql`${inventoryBalances.onHand} + ${qty}`, updatedAt: new Date() },
    })
    .returning({ onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved });
  const after = rows[0];
  await recordMovement(
    { variantId, toLocationId: locationId, qtyOnHandChange: qty, qtyReservedChange: 0, balanceAfter: after.onHand, reservedAfter: after.reserved, reason, ...rest },
    tx
  );
  return { onHand: after.onHand, reserved: after.reserved };
}

// Adjustment OUT (decrease): locked, available-guarded. allowNegative is the
// controlled administrative override — explicit flag + reason, audit-logged by
// the caller as inventory.override. Table CHECKs still apply (fail-closed).
export async function decreaseStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  movementType: MovementType,
  ctx: MovementCtx = {},
  opts: { allowNegative?: boolean } = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  const allowed: MovementType[] = ["ADJUSTMENT_OUT", "DAMAGE", "LOSS", "SUPPLIER_RETURN", "TRANSFER_OUT"];
  if (!allowed.includes(movementType)) throw new Error("Invalid stock-out movement type");
  const row = await lockBalance(tx, variantId, locationId);
  if (!row) throw new Error("Insufficient available stock (no balance at location)");
  const override = opts.allowNegative === true;
  if (!override && row.onHand - row.reserved < qty) {
    throw new Error(`Insufficient available stock (have ${row.onHand - row.reserved}, need ${qty})`);
  }
  if (!override && row.onHand < qty) throw new Error("Adjustment would drive on-hand negative");
  const nextOnHand = row.onHand - qty;
  await tx
    .update(inventoryBalances)
    .set({ onHand: nextOnHand, updatedAt: new Date() })
    .where(eq(inventoryBalances.id, row.id));
  await recordMovement(
    {
      variantId,
      fromLocationId: locationId,
      qtyOnHandChange: -qty,
      qtyReservedChange: 0,
      balanceAfter: nextOnHand,
      reservedAfter: row.reserved,
      reason: movementType,
      ...ctx,
    },
    tx
  );
  return { onHand: nextOnHand, reserved: row.reserved, override };
}

// Adjustment IN via upsert path.
export async function increaseStock(
  tx: Tx,
  variantId: string,
  locationId: string,
  qty: number,
  movementType: MovementType,
  ctx: MovementCtx = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  const allowed: MovementType[] = ["ADJUSTMENT_IN", "CUSTOMER_RETURN", "REFUND_RESTOCK", "ORDER_CANCELLATION"];
  if (!allowed.includes(movementType)) throw new Error("Invalid stock-in movement type");
  const rows = await tx
    .insert(inventoryBalances)
    .values({ variantId, locationId, onHand: qty, reserved: 0 })
    .onConflictDoUpdate({
      target: [inventoryBalances.variantId, inventoryBalances.locationId],
      set: { onHand: sql`${inventoryBalances.onHand} + ${qty}`, updatedAt: new Date() },
    })
    .returning({ onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved });
  const after = rows[0];
  await recordMovement(
    { variantId, toLocationId: locationId, qtyOnHandChange: qty, qtyReservedChange: 0, balanceAfter: after.onHand, reservedAfter: after.reserved, reason: movementType, ...ctx },
    tx
  );
  return { onHand: after.onHand, reserved: after.reserved };
}

// Transfer: locks BOTH legs in deterministic order, writes OUT + IN pair.
export async function transferStock(
  tx: Tx,
  variantId: string,
  fromLocationId: string,
  toLocationId: string,
  qty: number,
  ctx: MovementCtx = {}
) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a positive integer");
  if (fromLocationId === toLocationId) throw new Error("Source and destination must differ");
  const ordered = orderLockKeys([
    { variantId, locationId: fromLocationId },
    { variantId, locationId: toLocationId },
  ]);
  const locked = new Map<string, BalanceRow>();
  for (const k of ordered) {
    const row = await lockBalance(tx, k.variantId, k.locationId);
    if (row) locked.set(k.locationId, row);
  }
  const source = locked.get(fromLocationId);
  if (!source || source.onHand - source.reserved < qty) {
    throw new Error("Insufficient available stock to transfer");
  }
  const nextSource = source.onHand - qty;
  await tx
    .update(inventoryBalances)
    .set({ onHand: nextSource, updatedAt: new Date() })
    .where(eq(inventoryBalances.id, source.id));
  const destRows = await tx
    .insert(inventoryBalances)
    .values({ variantId, locationId: toLocationId, onHand: qty, reserved: 0 })
    .onConflictDoUpdate({
      target: [inventoryBalances.variantId, inventoryBalances.locationId],
      set: { onHand: sql`${inventoryBalances.onHand} + ${qty}`, updatedAt: new Date() },
    })
    .returning({ onHand: inventoryBalances.onHand, reserved: inventoryBalances.reserved });
  const dest = destRows[0];
  await recordMovement(
    { variantId, fromLocationId, qtyOnHandChange: -qty, qtyReservedChange: 0, balanceAfter: nextSource, reservedAfter: source.reserved, reason: "TRANSFER_OUT", ...ctx },
    tx
  );
  await recordMovement(
    { variantId, toLocationId, qtyOnHandChange: qty, qtyReservedChange: 0, balanceAfter: dest.onHand, reservedAfter: dest.reserved, reason: "TRANSFER_IN", ...ctx },
    tx
  );
  return { from: { onHand: nextSource, reserved: source.reserved }, to: { onHand: dest.onHand, reserved: dest.reserved } };
}

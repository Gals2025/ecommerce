"use server";

import { db } from "@/db";
import {
  inventoryLocations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import {
  decreaseStock,
  increaseStock,
  receiveStock,
  transferStock,
  type MovementType,
} from "@/lib/inventory";
import {
  adjustmentSchema,
  locationSchema,
  receivingSchema,
  transferSchema,
} from "@/validators";

// ---------- Locations ----------

export async function createLocation(input: unknown) {
  const session = await requireAdmin();
  const data = locationSchema.parse(input);
  const [row] = await db
    .insert(inventoryLocations)
    .values({
      code: data.code.toUpperCase(),
      name: data.name,
      type: data.type,
      address: data.address ?? null,
    })
    .returning();
  await audit(session.user.id, "inventory.location_create", "locations", row.id, { code: row.code });
  revalidatePath("/admin/inventory/locations");
  return row.id;
}

export async function updateLocation(id: string, input: unknown) {
  const session = await requireAdmin();
  const data = locationSchema.parse(input);
  const [row] = await db
    .update(inventoryLocations)
    .set({
      code: data.code.toUpperCase(),
      name: data.name,
      type: data.type,
      address: data.address ?? null,
      updatedAt: new Date(),
    })
    .where(eq(inventoryLocations.id, id))
    .returning();
  if (!row) throw new Error("Location not found");
  await audit(session.user.id, "inventory.location_update", "locations", id, { code: row.code });
  revalidatePath("/admin/inventory/locations");
  return row.id;
}

export async function setLocationActive(id: string, active: boolean) {
  id = z.string().uuid().parse(id);
  active = z.boolean().parse(active);
  const session = await requireAdmin();
  await db
    .update(inventoryLocations)
    .set({
      isActive: active,
      deletedAt: active ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inventoryLocations.id, id));
  await audit(session.user.id, active ? "inventory.location_activate" : "inventory.location_deactivate", "locations", id, { active });
  revalidatePath("/admin/inventory/locations");
  return true;
}

// ---------- Receiving ----------

export async function receiveStockAction(input: unknown) {
  const session = await requireStaff();
  const data = receivingSchema.parse(input);
  const loc = await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, data.locationId)).limit(1);
  if (!loc[0]) throw new Error("Location not found");
  if (!loc[0].isActive) throw new Error("Cannot receive into an inactive location");
  await db.transaction(async (tx) => {
    await receiveStock(tx, data.variantId, data.locationId, data.qty, {
      movementType: "STOCK_RECEIVED",
      unitCost: data.unitCost ?? null,
      supplier: data.supplier ?? null,
      reference: data.reference ?? null,
      refType: "receiving",
      note: data.notes ?? null,
      createdBy: session.user.id,
    });
  });
  await audit(session.user.id, "inventory.receive", "variants", data.variantId, {
    locationId: data.locationId,
    qty: data.qty,
    unitCost: data.unitCost ?? null,
    supplier: data.supplier ?? null,
    reference: data.reference ?? null,
  });
  revalidatePath("/admin/inventory");
  return true;
}

// ---------- Adjustments ----------

const DECREASE_TYPE: Record<string, MovementType> = {
  physical_count: "ADJUSTMENT_OUT",
  damaged: "DAMAGE",
  lost: "LOSS",
  expired: "LOSS",
  data_correction: "ADJUSTMENT_OUT",
  other: "ADJUSTMENT_OUT",
};

export async function adjustStockAction(input: unknown) {
  const session = await requireStaff();
  const data = adjustmentSchema.parse(input);
  const loc = await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, data.locationId)).limit(1);
  if (!loc[0]) throw new Error("Location not found");
  if (!loc[0].isActive) throw new Error("Cannot adjust stock at an inactive location");
  const ctx = {
    refType: "adjustment" as const,
    note: [data.reason, data.notes].filter(Boolean).join(" — ") || null,
    createdBy: session.user.id,
  };
  let overrideUsed = false;
  await db.transaction(async (tx) => {
    if (data.direction === "increase") {
      await increaseStock(tx, data.variantId, data.locationId, data.qty, "ADJUSTMENT_IN", ctx);
    } else {
      const res = await decreaseStock(tx, data.variantId, data.locationId, data.qty, DECREASE_TYPE[data.reason], ctx, {
        allowNegative: data.allowNegative,
      });
      overrideUsed = res.override && data.allowNegative;
    }
  });
  await audit(session.user.id, "inventory.adjust", "variants", data.variantId, {
    locationId: data.locationId,
    direction: data.direction,
    qty: data.qty,
    reason: data.reason,
    allowNegative: data.allowNegative,
  });
  if (overrideUsed) {
    await audit(session.user.id, "inventory.override", "variants", data.variantId, {
      locationId: data.locationId,
      qty: data.qty,
      reason: data.reason,
      note: "Administrative override of available-stock gate",
    });
  }
  revalidatePath("/admin/inventory");
  return { overrideUsed };
}

// ---------- Transfers ----------

export async function transferStockAction(input: unknown) {
  const session = await requireStaff();
  const data = transferSchema.parse(input);
  const locs = await db.select().from(inventoryLocations);
  const from = locs.find((l) => l.id === data.fromLocationId);
  const to = locs.find((l) => l.id === data.toLocationId);
  if (!from || !to) throw new Error("Location not found");
  if (!from.isActive || !to.isActive) throw new Error("Cannot transfer to/from an inactive location");
  await db.transaction(async (tx) => {
    await transferStock(tx, data.variantId, data.fromLocationId, data.toLocationId, data.qty, {
      refType: "transfer",
      note: data.notes ?? null,
      createdBy: session.user.id,
    });
  });
  await audit(session.user.id, "inventory.transfer", "variants", data.variantId, {
    from: data.fromLocationId,
    to: data.toLocationId,
    qty: data.qty,
  });
  revalidatePath("/admin/inventory");
  return true;
}

// NOTE: order cancellation lives in actions/order-ops.ts (cancelOrderFull) —
// it needs the state-dependent release/restock matrix + spend rollback, so a
// single authoritative implementation avoids split-brain cancels.

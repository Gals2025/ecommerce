import { randomUUID } from "node:crypto";
import type { db } from "@/db";
import { products, productVariants, inventoryLocations, orders, orderItems, payments, shipments, orderStatusHistory, auditLogs } from "@/db/schema";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { reserveStock, captureStock } from "@/lib/inventory";
import { saleTotal, type posSaleSchema } from "./validation";
import type { z } from "zod";

const sellable = () => and(eq(products.status, "active"), eq(products.isActive, true), isNull(products.deletedAt), eq(productVariants.status, "active"), eq(productVariants.isActive, true), isNull(productVariants.deletedAt));

// All financial, inventory, and audit writes share one transaction.
export async function createPosSale(database: Pick<typeof db, "transaction">, actorId: string, data: z.infer<typeof posSaleSchema>) {
  const key = `pos:${actorId}:${data.key}`;
  return database.transaction(async tx => {
    // Serialize retries of the same sale before looking up its unique key.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const [existing] = await tx.select({ orderId: orders.id, orderNo: orders.orderNo }).from(orders).where(eq(orders.idempotencyKey, key));
    if (existing) return existing;
    const [location] = await tx.select().from(inventoryLocations).where(and(eq(inventoryLocations.id, data.locationId), eq(inventoryLocations.isActive, true), isNull(inventoryLocations.deletedAt)));
    if (!location) throw new Error("Select an active stock location");
    const variants = await tx.select({ id: productVariants.id, sku: productVariants.sku, variant: productVariants.name, name: products.name, basePrice: products.basePrice, override: productVariants.priceOverride, trackProduct: products.trackInventory, trackVariant: productVariants.trackInventory })
      .from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(and(sellable(), inArray(productVariants.id, data.items.map(i => i.variantId))));
    if (variants.length !== data.items.length) throw new Error("A product is no longer available. Refresh the catalog.");
    const lines = data.items.map(item => { const v = variants.find(v => v.id === item.variantId)!; return { ...v, qty: item.qty, price: v.override ?? v.basePrice }; }).sort((a,b) => a.id.localeCompare(b.id));
    const total = saleTotal(lines);
    if (total !== data.expectedTotal) throw new Error("Sale total changed. Refresh stock to load current prices, then review the sale.");
    if (data.method === "pay_at_store" && data.tendered < total) throw new Error("Cash received is less than the sale total");
    const [order] = await tx.insert(orders).values({
      orderNo: `POS-${randomUUID().toUpperCase()}`, idempotencyKey: key,
      status: "completed", paymentStatus: "paid", fulfillmentStatus: "fulfilled", fulfillment: "pickup", subtotal: total, grandTotal: total,
      notes: ["POS / in-store sale", `Customer: ${data.customerName || "Walk-in"}`, `Location: ${location.name}`, data.method === "pay_at_store" ? `Cash received: ${data.tendered} centavos; change: ${data.tendered - total} centavos` : "", data.notes].filter(Boolean).join("\n"),
    }).returning();
    for (const line of lines) {
      if (line.trackProduct && line.trackVariant) {
        const ctx = { refType: "order", refId: order.id, createdBy: actorId, note: `POS sale ${order.orderNo}` };
        await reserveStock(tx, line.id, location.id, line.qty, ctx);
        await captureStock(tx, line.id, location.id, line.qty, ctx);
      }
    }
    await tx.insert(orderItems).values(lines.map(line => ({ orderId: order.id, variantId: line.id, productName: line.name, sku: line.sku, variantName: line.variant, originalUnitPrice: line.price, effectiveUnitPrice: line.price, quantity: line.qty, lineTotal: line.price * line.qty })));
    await tx.insert(payments).values({ orderId: order.id, method: data.method, amount: total, status: "verified", referenceNo: data.reference || null, verifiedBy: actorId, verifiedAt: new Date() });
    await tx.insert(shipments).values({ orderId: order.id, mode: "pickup", status: "completed", notes: "Collected at POS" });
    await tx.insert(orderStatusHistory).values({ orderId: order.id, toStatus: "completed", actorId, note: "Paid and collected at POS" });
    await tx.insert(auditLogs).values({ actorId, action: "pos.sale", entity: "orders", entityId: order.id, diff: JSON.stringify({ total, locationId: location.id, method: data.method, source: "pos" }) });
    return { orderId: order.id, orderNo: order.orderNo };
  });
}

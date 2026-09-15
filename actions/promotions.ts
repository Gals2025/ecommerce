"use server";

import { db } from "@/db";
import {
  promotions,
  promotionRules,
  promotionProducts,
  promotionVariants,
  promotionCategories,
  promotionBrands,
  promotionMembershipTiers,
  promotionCodes,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/rbac";
import { promotionSchema, promoCodeSchema } from "@/validators";
import { audit } from "@/lib/audit";

type PromoInput = {
  name: string;
  description?: string | null;
  type: "code" | "auto";
  kind: "percent" | "fixed" | "bogo" | "bundle" | "free_shipping";
  value: number;
  config?: Record<string, unknown> | null;
  minSpend: number;
  maxDiscount?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  stackable: boolean;
  priority: number;
  isActive: boolean;
  productIds: string[];
  variantIds: string[];
  categoryIds: string[];
  brandIds: string[];
  tierIds: string[];
  firstOrderOnly: boolean;
  minQty?: number | null;
};

async function writeScopesAndRules(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  promotionId: string,
  data: PromoInput
) {
  for (const pid of [...new Set(data.productIds)]) {
    await tx.insert(promotionProducts).values({ promotionId, productId: pid }).onConflictDoNothing();
  }
  for (const vid of [...new Set(data.variantIds)]) {
    await tx.insert(promotionVariants).values({ promotionId, variantId: vid }).onConflictDoNothing();
  }
  for (const cid of [...new Set(data.categoryIds)]) {
    await tx.insert(promotionCategories).values({ promotionId, categoryId: cid }).onConflictDoNothing();
  }
  for (const bid of [...new Set(data.brandIds)]) {
    await tx.insert(promotionBrands).values({ promotionId, brandId: bid }).onConflictDoNothing();
  }
  for (const tid of [...new Set(data.tierIds)]) {
    await tx.insert(promotionMembershipTiers).values({ promotionId, tierId: tid }).onConflictDoNothing();
  }
  if (data.firstOrderOnly) {
    await tx.insert(promotionRules).values({ promotionId, key: "first_order_only", value: true });
  }
  if (data.minQty != null) {
    await tx.insert(promotionRules).values({ promotionId, key: "min_qty", value: data.minQty });
  }
}

export async function createPromotion(input: unknown) {
  const session = await requireAdmin();
  const data = promotionSchema.parse(input) as PromoInput;
  if (data.startAt && data.endAt && data.startAt > data.endAt) {
    throw new Error("Start date must be before end date");
  }
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(promotions)
      .values({
        name: data.name,
        description: data.description?.trim() || null,
        type: data.type,
        kind: data.kind,
        value: data.value,
        config: data.config ?? null,
        minSpend: data.minSpend,
        maxDiscount: data.maxDiscount ?? null,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        stackable: data.stackable,
        priority: data.priority,
        isActive: data.isActive,
      })
      .returning();
    await writeScopesAndRules(tx, row.id, data);
    return row.id;
  });
  await audit(session.user.id, "promotion.create", "promotions", id, { name: data.name, kind: data.kind });
  revalidatePath("/admin/promotions");
  return id;
}

export async function updatePromotion(id: string, input: unknown) {
  const session = await requireAdmin();
  const data = promotionSchema.parse(input) as PromoInput;
  if (data.startAt && data.endAt && data.startAt > data.endAt) {
    throw new Error("Start date must be before end date");
  }
  const existing = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!existing[0]) throw new Error("Promotion not found");
  await db.transaction(async (tx) => {
    await tx
      .update(promotions)
      .set({
        name: data.name,
        description: data.description?.trim() || null,
        type: data.type,
        kind: data.kind,
        value: data.value,
        config: data.config ?? null,
        minSpend: data.minSpend,
        maxDiscount: data.maxDiscount ?? null,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        stackable: data.stackable,
        priority: data.priority,
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(promotions.id, id));
    // Scopes + rules are replaced wholesale (simpler + auditable).
    await tx.delete(promotionProducts).where(eq(promotionProducts.promotionId, id));
    await tx.delete(promotionVariants).where(eq(promotionVariants.promotionId, id));
    await tx.delete(promotionCategories).where(eq(promotionCategories.promotionId, id));
    await tx.delete(promotionBrands).where(eq(promotionBrands.promotionId, id));
    await tx.delete(promotionMembershipTiers).where(eq(promotionMembershipTiers.promotionId, id));
    await tx.delete(promotionRules).where(eq(promotionRules.promotionId, id));
    await writeScopesAndRules(tx, id, data);
  });
  await audit(session.user.id, "promotion.update", "promotions", id, { name: data.name });
  revalidatePath("/admin/promotions");
  return true;
}

export async function createPromoCode(input: unknown) {
  const session = await requireAdmin();
  const data = promoCodeSchema.parse(input);
  const [promo] = await db.select().from(promotions).where(eq(promotions.id, data.promotionId)).limit(1);
  if (!promo) throw new Error("Promotion not found");
  const [row] = await db
    .insert(promotionCodes)
    .values({
      promotionId: data.promotionId,
      code: data.code.toUpperCase(),
      usageLimit: data.usageLimit ?? null,
      perCustomerLimit: data.perCustomerLimit,
    })
    .returning();
  await audit(session.user.id, "promocode.create", "promotion_codes", row.id, { code: row.code });
  revalidatePath("/admin/promotions");
  revalidatePath("/admin/promo-codes");
  return row.id;
}

export async function togglePromotion(id: string, isActive: boolean) {
  id = z.string().uuid().parse(id);
  isActive = z.boolean().parse(isActive);
  const session = await requireAdmin();
  const existing = await db.select({ id: promotions.id }).from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!existing[0]) throw new Error("Promotion not found");
  await db.update(promotions).set({ isActive, updatedAt: new Date() }).where(eq(promotions.id, id));
  await audit(session.user.id, "promotion.toggle", "promotions", id, { isActive });
  revalidatePath("/admin/promotions");
}

export async function togglePromoCode(id: string, isActive: boolean) {
  id = z.string().uuid().parse(id);
  isActive = z.boolean().parse(isActive);
  const session = await requireAdmin();
  const existing = await db.select({ id: promotionCodes.id }).from(promotionCodes).where(eq(promotionCodes.id, id)).limit(1);
  if (!existing[0]) throw new Error("Promo code not found");
  await db.update(promotionCodes).set({ isActive, updatedAt: new Date() }).where(eq(promotionCodes.id, id));
  await audit(session.user.id, "promocode.toggle", "promotion_codes", id, { isActive });
  revalidatePath("/admin/promotions");
  revalidatePath("/admin/promo-codes");
}

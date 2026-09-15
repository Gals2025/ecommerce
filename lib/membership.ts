import { db, type DbClient } from "@/db";
import {
  customers,
  membershipTiers,
  customerMemberships,
  memberships,
  memberPrices,
} from "@/db/schema";
import { eq, lte, desc, and, or, inArray } from "drizzle-orm";

export async function tierForSpend(lifetimeSpend: number, client: DbClient = db) {
  const tiers = await client
    .select()
    .from(membershipTiers)
    .where(lte(membershipTiers.minSpend, lifetimeSpend))
    .orderBy(desc(membershipTiers.minSpend))
    .limit(1);
  return tiers[0] ?? null;
}

export async function ensureCustomer(userId: string, client: DbClient = db) {
  const existing = await client.select().from(customers).where(eq(customers.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [row] = await client.insert(customers).values({ userId }).returning();
  // Assign base tier
  const base = await client.select().from(membershipTiers).orderBy(membershipTiers.minSpend).limit(1);
  if (base[0]) {
    await client.insert(customerMemberships).values({ customerId: row.id, tierId: base[0].id });
  }
  return row;
}

export type ActiveMembership = {
  membershipNo: string;
  tierId: string;
  tierName: string;
  discountPct: number;
  benefits: string[];
  expiresAt: Date | null;
};

/**
 * Pure validity gate (DB-free, unit-testable). A membership confers benefits
 * only when status=active and expiry is absent or not yet reached — so a
 * membership expiring later today is still valid, yesterday's is not.
 */
export function isMembershipValid(
  m: { status: string; expiresAt: Date | null },
  now: Date = new Date()
): boolean {
  if (m.status !== "active") return false;
  if (m.expiresAt && m.expiresAt < now) return false;
  return true;
}

/** Reminder rate limit: at most one expiring reminder per 7 days. */
export const REMINDER_COOLDOWN_MS = 7 * 86400000;

export function reminderDue(lastSentAt: Date | null, now: Date = new Date()): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= REMINDER_COOLDOWN_MS;
}

/**
 * The single gate for paid-member benefits. A row counts only when
 * status=active, its tier is active, and (expires_at is null or in the
 * future). Expired rows are swept to status=expired when touched, so no
 * cron is needed and expired members are automatically rejected.
 * Highest-priority qualifying membership wins.
 */
export async function getActiveMembership(customerId: string, client: DbClient = db): Promise<ActiveMembership | null> {
  const now = new Date();
  const rows = await client
    .select({ m: memberships, tier: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
    .where(and(eq(memberships.customerId, customerId), eq(memberships.status, "active")));
  // Lazy sweep: past-expiry actives are expired from this moment on.
  for (const r of rows) {
    if (r.m.expiresAt && r.m.expiresAt < now) {
      await client
        .update(memberships)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(memberships.id, r.m.id));
    }
  }
  const valid = rows.filter(
    (r) => r.tier.isActive && isMembershipValid({ status: r.m.status, expiresAt: r.m.expiresAt }, now)
  );
  if (valid.length === 0) return null;
  valid.sort((a, b) => (b.tier.priority ?? 0) - (a.tier.priority ?? 0));
  const top = valid[0];
  return {
    membershipNo: top.m.membershipNo,
    tierId: top.tier.id,
    tierName: top.tier.name,
    discountPct: top.tier.discountPct ?? 0,
    benefits: (top.tier.benefits as string[] | null) ?? [],
    expiresAt: top.m.expiresAt,
  };
}

/**
 * Explicit tier prices for a set of variants. Returns maps by variant and
 * by product; variant rows win. Only active rows for the given tier.
 */
export async function getMemberPrices(
  tierId: string,
  variantIds: string[],
  productIds: string[],
  client: DbClient = db
): Promise<{ byVariant: Map<string, number>; byProduct: Map<string, number> }> {
  const byVariant = new Map<string, number>();
  const byProduct = new Map<string, number>();
  if (variantIds.length === 0 && productIds.length === 0) return { byVariant, byProduct };
  const scope =
    variantIds.length > 0 && productIds.length > 0
      ? or(inArray(memberPrices.variantId, variantIds), inArray(memberPrices.productId, productIds))
      : variantIds.length > 0
        ? inArray(memberPrices.variantId, variantIds)
        : inArray(memberPrices.productId, productIds);
  const rows = await client
    .select()
    .from(memberPrices)
    .where(and(eq(memberPrices.tierId, tierId), eq(memberPrices.isActive, true), scope));
  for (const r of rows) {
    if (r.variantId) byVariant.set(r.variantId, r.price);
    else if (r.productId) byProduct.set(r.productId, r.price);
  }
  return { byVariant, byProduct };
}

"use server";

import { db } from "@/db";
import {
  customers,
  membershipTiers,
  memberships,
  memberPrices,
  products,
  productVariants,
  users,
  emailLogs,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { reminderDue } from "@/lib/membership";
import { queueEmail } from "@/lib/email";
import { membershipActivatedEmail, membershipExpiringEmail } from "@/emails";
import { formatManila } from "@/lib/datetime";
import {
  tierSchema,
  memberPriceSchema,
  assignMembershipSchema,
  changeTierSchema,
  renewMembershipSchema,
  membershipStatusSchema,
} from "@/validators";

function membershipNo(): string {
  const y = new Date().getFullYear();
  return `MBR-${y}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function expiresFor(tier: typeof membershipTiers.$inferSelect, from: Date): Date | null {
  if (!tier.validityDays) return null;
  return new Date(from.getTime() + tier.validityDays * 24 * 60 * 60 * 1000);
}

/** Post-commit activation notice (fire-and-forget; never blocks the action). */
async function notifyActivation(
  customerId: string,
  tierName: string,
  membershipNoValue: string,
  expiresAt: Date | null
) {
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) return;
  const [u] = await db.select().from(users).where(eq(users.id, c.userId)).limit(1);
  if (!u?.email) return;
  const { subject, html } = membershipActivatedEmail(
    tierName,
    membershipNoValue,
    expiresAt ? formatManila(expiresAt, "MMM d, yyyy") : null
  );
  await queueEmail({ to: u.email, template: "membership_activated", subject, html, userId: c.userId });
}

// ---------------------------------------------------------------------------
// Tier config (tiers.manage)
// ---------------------------------------------------------------------------

export async function createTier(input: unknown) {
  const session = await requirePermission("tiers.manage");
  const data = tierSchema.parse(input);
  const [row] = await db
    .insert(membershipTiers)
    .values({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      membershipFee: data.membershipFee,
      validityDays: data.validityDays ?? null,
      minSpend: data.minSpend,
      discountPct: data.discountPct,
      benefits: data.benefits,
      priority: data.priority,
      isActive: data.isActive,
    })
    .returning();
  await audit(session.user.id, "tier.create", "membership_tiers", row.id, { name: row.name });
  revalidatePath("/admin/memberships");
  return row.id;
}

export async function updateTier(id: string, input: unknown) {
  const session = await requirePermission("tiers.manage");
  const data = tierSchema.parse(input);
  const existing = await db.select().from(membershipTiers).where(eq(membershipTiers.id, id)).limit(1);
  if (!existing[0]) throw new Error("Tier not found");
  await db
    .update(membershipTiers)
    .set({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      membershipFee: data.membershipFee,
      validityDays: data.validityDays ?? null,
      minSpend: data.minSpend,
      discountPct: data.discountPct,
      benefits: data.benefits,
      priority: data.priority,
      isActive: data.isActive,
      updatedAt: new Date(),
    })
    .where(eq(membershipTiers.id, id));
  await audit(session.user.id, "tier.update", "membership_tiers", id, {
    before: { name: existing[0].name, discountPct: existing[0].discountPct },
    after: { name: data.name, discountPct: data.discountPct },
  });
  revalidatePath("/admin/memberships");
  return true;
}

// ---------------------------------------------------------------------------
// Explicit member prices (tiers.manage)
// ---------------------------------------------------------------------------

export async function setMemberPrice(input: unknown) {
  const session = await requirePermission("tiers.manage");
  const data = memberPriceSchema.parse(input);
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, data.tierId)).limit(1);
  if (!tier) throw new Error("Tier not found");
  if (data.variantId) {
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, data.variantId)).limit(1);
    if (!v) throw new Error("Variant not found");
    await db
      .insert(memberPrices)
      .values({ tierId: data.tierId, variantId: data.variantId, productId: null, price: data.price })
      .onConflictDoUpdate({
        target: [memberPrices.tierId, memberPrices.variantId],
        set: { price: data.price, isActive: true, updatedAt: new Date() },
      });
  } else {
    const [p] = await db.select().from(products).where(eq(products.id, data.productId!)).limit(1);
    if (!p) throw new Error("Product not found");
    await db
      .insert(memberPrices)
      .values({ tierId: data.tierId, variantId: null, productId: data.productId, price: data.price })
      .onConflictDoUpdate({
        target: [memberPrices.tierId, memberPrices.productId],
        set: { price: data.price, isActive: true, updatedAt: new Date() },
      });
  }
  await audit(session.user.id, "tier.member_price", "membership_tiers", data.tierId, data);
  revalidatePath("/admin/memberships");
  return true;
}

export async function removeMemberPrice(id: string) {
  id = z.string().uuid().parse(id);
  const session = await requirePermission("tiers.manage");
  const [row] = await db.select().from(memberPrices).where(eq(memberPrices.id, id)).limit(1);
  if (!row) throw new Error("Member price not found");
  await db.delete(memberPrices).where(eq(memberPrices.id, id));
  await audit(session.user.id, "tier.member_price_remove", "membership_tiers", row.tierId, { id });
  revalidatePath("/admin/memberships");
  return true;
}

// ---------------------------------------------------------------------------
// Member lifecycle (any staff; every change audited)
// ---------------------------------------------------------------------------

export async function getCustomerMemberships(customerId: string) {
  await requirePermission("memberships.manage");
  return db
    .select()
    .from(memberships)
    .where(eq(memberships.customerId, customerId))
    .orderBy(desc(memberships.createdAt));
}

export async function assignMembership(input: unknown) {
  const session = await requirePermission("memberships.manage");
  const data = assignMembershipSchema.parse(input);
  const [customer] = await db.select().from(customers).where(eq(customers.id, data.customerId)).limit(1);
  if (!customer) throw new Error("Customer not found");
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, data.tierId)).limit(1);
  if (!tier || !tier.isActive) throw new Error("Tier is unavailable");
  const existing = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.customerId, data.customerId), eq(memberships.status, "active")))
    .limit(1);
  if (existing[0]) throw new Error("Customer already has an active membership — upgrade/downgrade instead");

  const now = new Date();
  const [row] = await db
    .insert(memberships)
    .values({
      customerId: data.customerId,
      membershipNo: membershipNo(),
      tierId: data.tierId,
      status: data.activate ? "active" : "pending",
      startedAt: now,
      expiresAt: expiresFor(tier, now),
      paymentRef: data.paymentRef?.trim() || null,
      activatedBy: data.activate ? session.user.id : null,
      activatedAt: data.activate ? now : null,
    })
    .returning()
    .catch(async () => {
      // Membership-no collision: retry once with a fresh number.
      return db
        .insert(memberships)
        .values({
          customerId: data.customerId,
          membershipNo: membershipNo(),
          tierId: data.tierId,
          status: data.activate ? "active" : "pending",
          startedAt: now,
          expiresAt: expiresFor(tier, now),
          paymentRef: data.paymentRef?.trim() || null,
          activatedBy: data.activate ? session.user.id : null,
          activatedAt: data.activate ? now : null,
        })
        .returning();
    });
  await audit(session.user.id, "membership.assign", "memberships", row.id, {
    customerId: data.customerId,
    tier: tier.name,
    membershipNo: row.membershipNo,
  });
  if (data.activate) {
    await notifyActivation(data.customerId, tier.name, row.membershipNo, row.expiresAt);
  }
  revalidatePath(`/admin/customers/${data.customerId}`);
  revalidatePath("/admin/memberships");
  return row.id;
}

/** Upgrade/downgrade: closes the old row, opens a new one (audited pair). */
export async function changeTier(input: unknown) {
  const session = await requirePermission("memberships.manage");
  const data = changeTierSchema.parse(input);
  const [old] = await db.select().from(memberships).where(eq(memberships.id, data.membershipId)).limit(1);
  if (!old) throw new Error("Membership not found");
  if (!["active", "pending"].includes(old.status)) {
    throw new Error(`Only active/pending memberships can change tier (status: ${old.status})`);
  }
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, data.newTierId)).limit(1);
  if (!tier || !tier.isActive) throw new Error("Tier is unavailable");
  if (tier.id === old.tierId) throw new Error("Already on this tier");

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(memberships.id, old.id));
    const [row] = await tx
      .insert(memberships)
      .values({
        customerId: old.customerId,
        membershipNo: membershipNo(),
        tierId: tier.id,
        status: "active",
        startedAt: now,
        expiresAt: expiresFor(tier, now),
        paymentRef: data.paymentRef?.trim() || null,
        activatedBy: session.user.id,
        activatedAt: now,
      })
      .returning();
    return row;
  });
  await audit(session.user.id, "membership.change_tier", "memberships", result.id, {
    from: old.id,
    tier: tier.name,
  });
  await notifyActivation(old.customerId, tier.name, result.membershipNo, result.expiresAt);
  revalidatePath(`/admin/customers/${old.customerId}`);
  return result.id;
}

/** Renew: extends from current expiry (or now if lapsed) by tier validity. */
export async function renewMembership(input: unknown) {
  const session = await requirePermission("memberships.manage");
  const data = renewMembershipSchema.parse(input);
  const [row] = await db.select().from(memberships).where(eq(memberships.id, data.membershipId)).limit(1);
  if (!row) throw new Error("Membership not found");
  if (!["active", "expired"].includes(row.status)) {
    throw new Error(`Only active/expired memberships can be renewed (status: ${row.status})`);
  }
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, row.tierId)).limit(1);
  if (!tier) throw new Error("Tier not found");
  const now = new Date();
  const base = row.expiresAt && row.expiresAt > now ? row.expiresAt : now;
  const [updated] = await db
    .update(memberships)
    .set({
      status: "active",
      expiresAt: expiresFor(tier, base),
      paymentRef: data.paymentRef?.trim() || row.paymentRef,
      updatedAt: now,
    })
    .where(eq(memberships.id, row.id))
    .returning();
  await audit(session.user.id, "membership.renew", "memberships", row.id, { paymentRef: data.paymentRef });
  await notifyActivation(row.customerId, tier.name, row.membershipNo, updated.expiresAt);
  revalidatePath(`/admin/customers/${row.customerId}`);
  return true;
}

/** Suspend / cancel / reactivate / mark expired. */
export async function setMembershipStatus(input: unknown) {
  const session = await requirePermission("memberships.manage");
  const data = membershipStatusSchema.parse(input);
  const [row] = await db.select().from(memberships).where(eq(memberships.id, data.membershipId)).limit(1);
  if (!row) throw new Error("Membership not found");
  if (row.status === data.to) throw new Error(`Membership is already ${row.status}`);
  if (["cancelled", "expired"].includes(row.status) && data.to !== "active") {
    throw new Error(`Cannot move ${row.status} membership to ${data.to} — renew instead`);
  }
  const now = new Date();
  await db
    .update(memberships)
    .set({
      status: data.to,
      activatedBy: data.to === "active" ? session.user.id : row.activatedBy,
      activatedAt: data.to === "active" && !row.activatedAt ? now : row.activatedAt,
      updatedAt: now,
    })
    .where(eq(memberships.id, row.id));
  await audit(session.user.id, "membership.status", "memberships", row.id, {
    from: row.status,
    to: data.to,
    note: data.note,
  });
  if (data.to === "active") {
    const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, row.tierId)).limit(1);
    if (tier) await notifyActivation(row.customerId, tier.name, row.membershipNo, row.expiresAt);
  }
  revalidatePath(`/admin/customers/${row.customerId}`);
  return true;
}

/**
 * Staff-triggered expiry reminder (no cron exists). Rate-limited: at most
 * one membership_expiring email per membership per 7 days. Audited.
 */
export async function sendExpiryReminder(membershipId: string) {
  membershipId = z.string().uuid().parse(membershipId);
  const session = await requirePermission("memberships.manage");
  const [row] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!row) throw new Error("Membership not found");
  if (row.status !== "active") throw new Error(`Membership is ${row.status} — no reminder needed`);
  if (!row.expiresAt) throw new Error("Lifetime membership — no reminder needed");
  const [customer] = await db.select().from(customers).where(eq(customers.id, row.customerId)).limit(1);
  if (!customer) throw new Error("Customer not found");
  const prior = await db
    .select({ createdAt: emailLogs.createdAt })
    .from(emailLogs)
    .where(and(eq(emailLogs.template, "membership_expiring"), eq(emailLogs.userId, customer.userId)))
    .orderBy(desc(emailLogs.createdAt))
    .limit(1);
  if (!reminderDue(prior[0]?.createdAt ?? null)) throw new Error("A reminder was already sent in the last 7 days");
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, row.tierId)).limit(1);
  const [u] = await db.select().from(users).where(eq(users.id, customer.userId)).limit(1);
  if (!u?.email) throw new Error("Customer has no email address");
  const { subject, html } = membershipExpiringEmail(tier?.name ?? "Membership", row.membershipNo, formatManila(row.expiresAt, "MMM d, yyyy"));
  await queueEmail({ to: u.email, template: "membership_expiring", subject, html, userId: customer.userId });
  await audit(session.user.id, "membership.reminder", "memberships", row.id, { membershipNo: row.membershipNo });
  revalidatePath("/admin/reports/membership");
  return true;
}

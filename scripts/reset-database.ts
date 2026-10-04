// Destructive production reset: wipe everything EXCEPT login + store config.
// Keeps: users, roles, user_roles, settings, membership_tiers,
//        inventory_locations, shipping_methods. Everything else → 0 rows.
//
// Dry-run by default. Writing requires ALL THREE flags:
//   DATABASE_URL=... npx tsx scripts/reset-database.ts --apply --target=production --i-am-sure
//
// BEFORE running against production:
//   1. Take a Neon branch / restore point (or pg_dump) and confirm the restore path.
//   2. Run without --apply first and inspect the counts.
//   3. Expect all sessions to be logged out (refresh_sessions wiped); credentials survive.
import { count as drizzleCount, getTableName } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  brands,
  cartItems,
  carts,
  categories,
  customerAddresses,
  customerMemberships,
  customers,
  emailLogs,
  inventoryBalances,
  inventoryMovements,
  memberPrices,
  memberships,
  orderItems,
  orderNotes,
  orderPromotions,
  orderStatusHistory,
  orders,
  passwordResetTokens,
  payments,
  productAttributeValues,
  productAttributes,
  productImages,
  productVariants,
  products,
  promotionBrands,
  promotionCategories,
  promotionCodes,
  promotionMembershipTiers,
  promotionProducts,
  promotionRules,
  promotionUsage,
  promotionVariants,
  promotions,
  refunds,
  refreshSessions,
  returnItems,
  returns,
  shipments,
  variantAttributeValues,
} from "../db/schema";

// Children first — respects NO ACTION FKs (returns/refunds → orders,
// orders → customer_addresses, movements/cart_items → variants, ...).
// Runs inside one transaction; any failure rolls everything back.
const WIPE_ORDER = [
  returnItems,
  refunds,
  returns,
  payments,
  shipments,
  orderStatusHistory,
  orderNotes,
  orderPromotions,
  orderItems,
  promotionUsage,
  emailLogs,
  auditLogs,
  cartItems,
  variantAttributeValues,
  inventoryMovements,
  inventoryBalances,
  memberPrices,
  promotionRules,
  promotionProducts,
  promotionVariants,
  promotionCategories,
  promotionBrands,
  promotionMembershipTiers,
  customerMemberships,
  memberships,
  orders,
  carts,
  promotions,
  promotionCodes,
  productImages,
  productAttributeValues,
  productAttributes,
  productVariants,
  customerAddresses,
  products,
  brands,
  categories,
  customers,
  refreshSessions,
  passwordResetTokens,
] as const;

const KEEP_TABLES = [
  "users",
  "roles",
  "user_roles",
  "settings",
  "membership_tiers",
  "inventory_locations",
  "shipping_methods",
] as const;

function tableName(t: object): string {
  try {
    return getTableName(t as never);
  } catch {
    return "?";
  }
}

async function count(table: object): Promise<number> {
  const rows = await db.select({ n: drizzleCount() }).from(table as never);
  return Number((rows[0] as { n: unknown } | undefined)?.n ?? -1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Refusing to run without an explicit target DB.");
  }
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const targetProd = args.has("--target=production");
  const sure = args.has("--i-am-sure");

  console.log("Pre-reset counts:");
  for (const t of WIPE_ORDER) {
    console.log(`  ${tableName(t)}: ${await count(t)}`);
  }

  if (!apply || !targetProd || !sure) {
    console.log("\nDry run — no writes.");
    console.log("Kept tables (untouched): " + KEEP_TABLES.join(", "));
    console.log("To wipe, re-run with: --apply --target=production --i-am-sure");
    console.log("Required first: production backup (Neon branch/restore point or pg_dump).");
    return;
  }

  await db.transaction(async (tx) => {
    for (const t of WIPE_ORDER) {
      await tx.delete(t as never);
    }
  });

  console.log("\nPost-reset counts (wipe list must be 0):");
  let leftover = 0;
  for (const t of WIPE_ORDER) {
    const n = await count(t);
    if (n !== 0) leftover++;
    console.log(`  ${tableName(t)}: ${n}`);
  }
  if (leftover > 0) throw new Error(`${leftover} table(s) still non-empty after reset.`);
  console.log("\nOK: database reset. Kept: " + KEEP_TABLES.join(", "));
  console.log("Note: all sessions logged out — users must sign in again with existing credentials.");
}

const isDirectRun =
  !!process.argv[1] &&
  (process.argv[1].endsWith("scripts/reset-database.ts") || process.argv[1].endsWith("reset-database"));

if (isDirectRun) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  );
}

// Bulk-activate inactive products (and optionally their variants).
// Dry-run by default; pass --apply to write.
// Usage:
//   DATABASE_URL=... npx tsx scripts/activate-products.ts            # dry run
//   DATABASE_URL=... npx tsx scripts/activate-products.ts --apply     # activate inactive products + their inactive variants
//   DATABASE_URL=... npx tsx scripts/activate-products.ts --apply --skip-variants
//   DATABASE_URL=... npx tsx scripts/activate-products.ts --apply --include-archived  # also revive archived (undoes deletes!)
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { products, productVariants } from "../db/schema";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const SKIP_VARIANTS = args.has("--skip-variants");
const INCLUDE_ARCHIVED = args.has("--include-archived");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Refusing to run without an explicit target DB.");
  }

  const fromStatuses = INCLUDE_ARCHIVED ? ["inactive", "archived"] : ["inactive"];

  const targets = await db
    .select({ id: products.id, name: products.name, status: products.status })
    .from(products)
    .where(inArray(products.status, fromStatuses));

  const variantTargets = SKIP_VARIANTS
    ? []
    : await db
        .select({ id: productVariants.id, sku: productVariants.sku, productId: productVariants.productId })
        .from(productVariants)
        .where(inArray(productVariants.status, fromStatuses));

  console.log(`Found ${targets.length} product(s) with status in [${fromStatuses}]`);
  console.log(`Found ${variantTargets.length} variant(s) with status in [${fromStatuses}]`);
  if (!APPLY) {
    console.log("Dry run — no writes. Re-run with --apply to activate.");
    for (const t of targets.slice(0, 20)) {
      console.log(`  would activate: ${t.name} (${t.id}, was ${t.status})`);
    }
    if (targets.length > 20) console.log(`  ...and ${targets.length - 20} more`);
    return;
  }

  const now = new Date();
  if (targets.length > 0) {
    await db
      .update(products)
      .set({ status: "active", isActive: true, deletedAt: null, updatedAt: now })
      .where(inArray(products.status, fromStatuses));
  }
  if (variantTargets.length > 0) {
    await db
      .update(productVariants)
      .set({ status: "active", isActive: true, deletedAt: null, updatedAt: now })
      .where(inArray(productVariants.status, fromStatuses));
  }

  // Sanity check
  const [leftP, leftV] = await Promise.all([
    db.select({ id: products.id }).from(products).where(eq(products.status, "inactive")),
    db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.status, "inactive")),
  ]);
  console.log(
    `OK: activated ${targets.length} product(s), ${variantTargets.length} variant(s). Remaining inactive: ${leftP.length} products, ${leftV.length} variants.`
  );
}

const isDirectRun =
  !!process.argv[1] &&
  (process.argv[1].endsWith("scripts/activate-products.ts") || process.argv[1].endsWith("activate-products"));

if (isDirectRun) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  );
}

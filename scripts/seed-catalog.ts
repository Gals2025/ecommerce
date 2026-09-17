// Pickleball catalog-only seed: brands → categories → products + attributes →
// variants → OPENING_STOCK balances + movements (with unitCost, so the
// inventory report's WAC + receipt layers work from day one).
//
// Scope: catalog + opening inventory ONLY. No promos, customers, orders.
// Idempotent: reruns insert nothing (slug/SKU/location pre-checks).
// Run:      npx tsx scripts/seed-catalog.ts
// Requires: DATABASE_URL. Refuses production unless CONFIRM_CATALOG_SEED=yes.
import { db } from "../db";
import {
  brands,
  categories,
  products,
  productAttributes,
  productAttributeValues,
  productVariants,
  variantAttributeValues,
  inventoryLocations,
  inventoryBalances,
  inventoryMovements,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

if (process.env.NODE_ENV === "production" && process.env.CONFIRM_CATALOG_SEED !== "yes") {
  throw new Error("Refusing to seed in production without CONFIRM_CATALOG_SEED=yes");
}

// ------------------------------------------------------------------ types ---
type VariantDef = {
  sku: string;
  name: string;
  price?: number | null;
  cost?: number | null;
  stock: number;
  values: string[];
};

type ProductDef = {
  name: string;
  slug: string;
  short: string;
  desc: string;
  brand: string;
  category: string;
  base: number;
  compare?: number;
  cost?: number;
  featured?: boolean;
  threshold?: number;
  weightG?: number;
  attributes?: { name: string; values: string[] }[];
  variants?: VariantDef[];
  // Simple (single-SKU) products:
  sku?: string;
  stock?: number;
};

// ------------------------------------------------------------------- data ---
// Money in centavos. Stock = opening on-hand @ WH-QC per variant.
const CATALOG: ProductDef[] = [
  // ---------------------------------------------------------- Paddles ---
  {
    name: "Rally Starter Paddle", slug: "rally-starter-paddle",
    short: "Beginner-friendly paddle", desc: "Beginner-friendly paddle with a wide sweet spot",
    brand: "pickle-unltd", category: "paddles", base: 249900, cost: 120000,
    threshold: 5, weightG: 240,
    attributes: [{ name: "Grip", values: ['4"', '4.25"'] }],
    variants: [
      { sku: "PADDLE-RALLY-400", name: '4"', cost: 120000, stock: 30, values: ['4"'] },
      { sku: "PADDLE-RALLY-425", name: '4.25"', cost: 125000, stock: 18, values: ['4.25"'] },
    ],
  },
  {
    name: "Surge Fiberglass Paddle", slug: "surge-fiberglass-paddle",
    short: "Lightweight fiberglass paddle", desc: "Lightweight fiberglass paddle with a comfort grip",
    brand: "pickle-unltd", category: "paddles", base: 349900, compare: 419900, cost: 180000,
    featured: true, threshold: 5, weightG: 230,
    attributes: [{ name: "Grip", values: ['4"', '4.25"'] }],
    variants: [
      { sku: "PADDLE-SURGE-400", name: '4"', cost: 180000, stock: 30, values: ['4"'] },
      { sku: "PADDLE-SURGE-425", name: '4.25"', cost: 185000, stock: 18, values: ['4.25"'] },
    ],
  },
  {
    name: "Control Touch Pro Paddle", slug: "control-touch-pro-paddle",
    short: "Control paddle with spin texture", desc: "Carbon-face control paddle with spin texture",
    brand: "carbon-edge", category: "paddles", base: 499900, compare: 579900, cost: 250000,
    featured: true, threshold: 5, weightG: 235,
    attributes: [
      { name: "Grip", values: ['4"', '4.25"'] },
      { name: "Weight", values: ["Light", "Standard"] },
    ],
    variants: [
      { sku: "PADDLE-CTRL-LT-400", name: 'Light / 4"', cost: 250000, stock: 40, values: ["Light", '4"'] },
      { sku: "PADDLE-CTRL-STD-400", name: 'Standard / 4"', cost: 250000, stock: 35, values: ["Standard", '4"'] },
      { sku: "PADDLE-CTRL-STD-425", name: 'Standard / 4.25"', price: 519900, cost: 260000, stock: 20, values: ["Standard", '4.25"'] },
    ],
  },
  {
    name: "Volt Pro Carbon Paddle", slug: "volt-pro-carbon-paddle",
    short: "Pro carbon power paddle", desc: "Pro-level carbon paddle for power hitters",
    brand: "carbon-edge", category: "paddles", base: 549900, compare: 629900, cost: 280000,
    threshold: 5, weightG: 235,
    attributes: [{ name: "Grip", values: ['4"', '4.25"'] }],
    variants: [
      { sku: "PADDLE-VOLT-400", name: '4"', cost: 280000, stock: 25, values: ['4"'] },
      { sku: "PADDLE-VOLT-425", name: '4.25"', cost: 290000, stock: 15, values: ['4.25"'] },
    ],
  },
  // ------------------------------------------------------ Accessories ---
  {
    name: "Tour Outdoor Balls 3-Pack", slug: "tour-outdoor-balls-3pk",
    short: "Tournament outdoor balls", desc: "Tournament-grade 40-hole outdoor pickleballs, 3-pack",
    brand: "carbon-edge", category: "accessories", base: 59900, cost: 25000,
    threshold: 10, weightG: 300, sku: "BALL-TOUR-OUT-3PK", stock: 100,
  },
  {
    name: "Tour Outdoor Balls 6-Pack", slug: "tour-outdoor-balls-6pk",
    short: "Outdoor balls value pack", desc: "Tournament-grade outdoor pickleballs, value 6-pack",
    brand: "carbon-edge", category: "accessories", base: 99900, compare: 119900, cost: 45000,
    threshold: 10, weightG: 550, sku: "BALL-TOUR-OUT-6PK", stock: 60,
  },
  {
    name: "Tack Overgrip 3-Pack", slug: "tack-overgrip-3pk",
    short: "Sweat-absorbent overgrips", desc: "Tacky sweat-absorbent overgrips, 3-pack",
    brand: "court-thread", category: "accessories", base: 34900, cost: 12000,
    threshold: 5, weightG: 50, sku: "ACC-GRIP-3PK", stock: 80,
  },
  {
    name: "Sideline Court Cap", slug: "sideline-court-cap",
    short: "Breathable court cap", desc: "Breathable one-size court cap",
    brand: "court-thread", category: "accessories", base: 89900, cost: 35000,
    threshold: 5, weightG: 100, sku: "ACC-CAP-OS", stock: 40,
  },
  // ------------------------------------------------------ Court shoes ---
  {
    name: "Rally Lite Court Shoes", slug: "rally-lite-court-shoes",
    short: "Lightweight starter court shoes", desc: "Lightweight court shoes with lateral support for beginners",
    brand: "pickle-unltd", category: "court-shoes", base: 329900, cost: 170000,
    threshold: 10, weightG: 350,
    attributes: [{ name: "Size", values: ["US 7", "US 8", "US 9", "US 10", "US 11"] }],
    variants: ["US 7", "US 8", "US 9", "US 10", "US 11"].map((s) => ({
      sku: `SHOE-RALLY-LITE-${s.slice(3).padStart(2, "0")}`,
      name: s, cost: 170000, stock: 15, values: [s],
    })),
  },
  {
    name: "Court Ace Pickleball Shoes", slug: "court-ace-pickleball-shoes",
    short: "All-round pickleball court shoes", desc: "All-round pickleball shoes with cushioned midsole and herringbone outsole",
    brand: "pickle-unltd", category: "court-shoes", base: 429900, cost: 220000,
    featured: true, threshold: 10, weightG: 360,
    attributes: [{ name: "Size", values: ["US 7", "US 8", "US 9", "US 10", "US 11"] }],
    variants: ["US 7", "US 8", "US 9", "US 10", "US 11"].map((s) => ({
      sku: `SHOE-ACE-${s.slice(3).padStart(2, "0")}`,
      name: s, cost: 220000, stock: 15, values: [s],
    })),
  },
  {
    name: "Pro Court Elite Shoes", slug: "pro-court-elite-shoes",
    short: "Tournament-grade court shoes", desc: "Tournament-grade court shoes with carbon shank and premium cushioning",
    brand: "pickle-unltd", category: "court-shoes", base: 599900, compare: 699900, cost: 310000,
    threshold: 5, weightG: 370,
    attributes: [{ name: "Size", values: ["US 8", "US 9", "US 10"] }],
    variants: ["US 8", "US 9", "US 10"].map((s) => ({
      sku: `SHOE-ELITE-${s.slice(3).padStart(2, "0")}`,
      name: s, cost: 310000, stock: 10, values: [s],
    })),
  },
  // --------------------------------------------------------------- Bags ---
  {
    name: "Tour Sling Paddle Bag", slug: "tour-sling-paddle-bag",
    short: "Single-paddle sling bag", desc: "Crossbody sling bag for one paddle, balls, and valuables",
    brand: "court-thread", category: "bags", base: 189900, cost: 80000,
    threshold: 5, weightG: 600, sku: "BAG-TOUR-SLING", stock: 30,
  },
  {
    name: "Court Backpack 2-Paddle", slug: "court-backpack-2-paddle",
    short: "Two-paddle court backpack", desc: "Ventilated backpack with padded two-paddle compartment and shoe garage",
    brand: "court-thread", category: "bags", base: 229900, cost: 100000,
    threshold: 5, weightG: 800, sku: "BAG-COURT-BP", stock: 25,
  },
  {
    name: "Pro Duffel 6-Paddle Bag", slug: "pro-duffel-6-paddle-bag",
    short: "Team-size duffel bag", desc: "Team-size duffel with six-paddle vault, cooler pocket, and locker loop",
    brand: "court-thread", category: "bags", base: 299900, compare: 349900, cost: 140000,
    threshold: 5, weightG: 1200, sku: "BAG-PRO-DUFFEL", stock: 20,
  },
  // ------------------------------------------------------------ Apparel ---
  {
    name: "Dry-Fit Court Tee", slug: "dry-fit-court-tee",
    short: "Sweat-wicking court tee", desc: "Sweat-wicking dry-fit tee for long court sessions",
    brand: "court-thread", category: "apparel", base: 129900, cost: 55000,
    threshold: 5, weightG: 180,
    attributes: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    variants: ["S", "M", "L", "XL"].map((s) => ({
      sku: `APP-TEE-${s}`, name: s, cost: 55000, stock: 20, values: [s],
    })),
  },
  {
    name: "Court Performance Shorts", slug: "court-performance-shorts",
    short: "Classic court shorts", desc: "Lightweight performance shorts with ball pockets",
    brand: "court-thread", category: "apparel", base: 139900, cost: 60000,
    threshold: 5, weightG: 220,
    attributes: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    variants: ["S", "M", "L", "XL"].map((s) => ({
      sku: `APP-SHORTS-${s}`, name: s, cost: 60000, stock: 15, values: [s],
    })),
  },
  {
    name: "Court Polo", slug: "court-polo",
    short: "Match-day court polo", desc: "Breathable pique polo for match days and club nights",
    brand: "court-thread", category: "apparel", base: 159900, cost: 70000,
    threshold: 5, weightG: 200,
    attributes: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
    variants: ["S", "M", "L", "XL"].map((s) => ({
      sku: `APP-POLO-${s}`, name: s, cost: 70000, stock: 15, values: [s],
    })),
  },
  {
    name: "Women's Court Skort", slug: "womens-court-skort",
    short: "Court skort with ball pocket", desc: "Stretch court skort with built-in shorts and ball pocket",
    brand: "court-thread", category: "apparel", base: 149900, cost: 65000,
    threshold: 5, weightG: 190,
    attributes: [{ name: "Size", values: ["S", "M", "L"] }],
    variants: ["S", "M", "L"].map((s) => ({
      sku: `APP-SKORT-${s}`, name: s, cost: 65000, stock: 15, values: [s],
    })),
  },
];

// ---------------------------------------------------------------- helpers ---
const stats = { brands: 0, categories: 0, products: 0, variants: 0, skipped: 0 };

async function ensureBrand(name: string, slug: string) {
  const found = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
  if (found[0]) return found[0];
  const [row] = await db.insert(brands).values({ name, slug }).returning();
  stats.brands++;
  return row;
}

async function ensureCategory(name: string, slug: string, description: string, sortOrder: number) {
  const found = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (found[0]) return found[0];
  const [row] = await db
    .insert(categories)
    .values({ name, slug, description, sortOrder })
    .returning();
  stats.categories++;
  return row;
}

async function ensureWarehouse() {
  await db
    .insert(inventoryLocations)
    .values({ code: "WH-QC", name: "Main Warehouse", type: "warehouse", address: "Quezon City, Metro Manila" })
    .onConflictDoNothing();
  const loc = (
    await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, "WH-QC")).limit(1)
  )[0];
  if (!loc) throw new Error("WH-QC location missing after ensure");
  return loc;
}

async function ensureVariant(
  productId: string,
  locationId: string,
  def: { sku: string; name: string; price?: number | null; cost?: number | null; stock: number; valueIds?: string[] }
) {
  const existing = await db.select().from(productVariants).where(eq(productVariants.sku, def.sku)).limit(1);
  if (existing[0]) {
    stats.skipped++;
    return existing[0].id;
  }
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId,
      sku: def.sku,
      name: def.name,
      priceOverride: def.price ?? null,
      costPrice: def.cost ?? null,
    })
    .returning();
  for (const av of def.valueIds ?? []) {
    await db.insert(variantAttributeValues).values({ variantId: variant.id, attributeValueId: av }).onConflictDoNothing();
  }
  await db
    .insert(inventoryBalances)
    .values({ variantId: variant.id, locationId, onHand: def.stock, reserved: 0 })
    .onConflictDoNothing();
  // unitCost carried on the movement so WAC + receipt layers resolve.
  await db.insert(inventoryMovements).values({
    variantId: variant.id,
    toLocationId: locationId,
    qtyOnHandChange: def.stock,
    qtyReservedChange: 0,
    balanceAfter: def.stock,
    reservedAfter: 0,
    unitCost: def.cost ?? null,
    reference: "OPENING",
    reason: "OPENING_STOCK",
    refType: "seed",
    refId: "catalog-seed-opening",
    note: "Catalog seed opening balance",
    createdBy: null,
  });
  stats.variants++;
  return variant.id;
}

async function ensureProduct(def: ProductDef, brandId: string, categoryId: string, locationId: string) {
  const found = await db.select().from(products).where(eq(products.slug, def.slug)).limit(1);
  if (found[0]) {
    stats.skipped++;
    return;
  }
  const [p] = await db
    .insert(products)
    .values({
      name: def.name,
      slug: def.slug,
      shortDescription: def.short,
      description: def.desc,
      sku: def.sku ?? null,
      brandId,
      categoryId,
      basePrice: def.base,
      comparePrice: def.compare ?? null,
      costPrice: def.cost ?? null,
      lowStockThreshold: def.threshold ?? 5,
      weightG: def.weightG ?? null,
      status: "active",
      featured: def.featured ?? false,
      isActive: true,
    })
    .returning();
  stats.products++;

  const valueIds = new Map<string, string>();
  for (const attr of def.attributes ?? []) {
    const existingAttr = await db
      .select()
      .from(productAttributes)
      .where(and(eq(productAttributes.productId, p.id), eq(productAttributes.name, attr.name)))
      .limit(1);
    const attrId = existingAttr[0]?.id ?? (await db.insert(productAttributes).values({ productId: p.id, name: attr.name }).returning())[0].id;
    for (const val of attr.values) {
      await db.insert(productAttributeValues).values({ attributeId: attrId, value: val }).onConflictDoNothing();
      const av = (
        await db
          .select()
          .from(productAttributeValues)
          .where(and(eq(productAttributeValues.attributeId, attrId), eq(productAttributeValues.value, val)))
          .limit(1)
      )[0];
      valueIds.set(val, av.id);
    }
  }
  for (const v of def.variants ?? []) {
    await ensureVariant(p.id, locationId, {
      ...v,
      valueIds: v.values.map((x) => valueIds.get(x)!).filter(Boolean),
    });
  }
  // Simple products get a default variant so the storefront can sell them.
  if ((!def.variants || def.variants.length === 0) && def.sku) {
    await ensureVariant(p.id, locationId, {
      sku: def.sku,
      name: "Default",
      cost: def.cost ?? null,
      stock: def.stock ?? 0,
    });
  }
}

// ------------------------------------------------------------------- main ---
async function main() {
  const warehouse = await ensureWarehouse();

  await ensureBrand("Pickle Unltd", "pickle-unltd");
  await ensureBrand("Carbon Edge", "carbon-edge");
  await ensureBrand("Court Thread", "court-thread");
  const brandId = async (slug: string) =>
    (await db.select().from(brands).where(eq(brands.slug, slug)).limit(1))[0].id;

  const cats: { name: string; slug: string; description: string; sortOrder: number }[] = [
    { name: "Paddles", slug: "paddles", description: "Pickleball paddles for every level, from starter to pro", sortOrder: 1 },
    { name: "Accessories", slug: "accessories", description: "Balls, grips, caps, and court essentials", sortOrder: 2 },
    { name: "Court Shoes", slug: "court-shoes", description: "Pickleball court shoes with lateral support", sortOrder: 3 },
    { name: "Bags", slug: "bags", description: "Slings, backpacks, and duffels for your gear", sortOrder: 4 },
    { name: "Apparel", slug: "apparel", description: "Court-ready tees, shorts, polos, and skorts", sortOrder: 5 },
  ];
  for (const c of cats) await ensureCategory(c.name, c.slug, c.description, c.sortOrder);
  const catId = async (slug: string) =>
    (await db.select().from(categories).where(eq(categories.slug, slug)).limit(1))[0].id;

  for (const def of CATALOG) {
    await ensureProduct(def, await brandId(def.brand), await catId(def.category), warehouse.id);
  }

  console.log(
    `Catalog seed done: ${stats.brands} brands, ${stats.categories} categories, ` +
      `${stats.products} products, ${stats.variants} variants, ${stats.skipped} skipped (already present).`
  );
}

main().catch((err) => {
  console.error("Catalog seed failed:", err);
  process.exit(1);
});

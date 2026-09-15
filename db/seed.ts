// Full pickle seed: roles → admin → tiers → locations → shipping → catalog →
// balances+movements → promos → customer → order lifecycle → settings.
// Idempotent: reruns are safe via onConflictDoNothing + pre-checks.
import { db } from "./index";
import {
  roles,
  users,
  userRoles,
  membershipTiers,
  memberships,
  memberPrices,
  inventoryLocations,
  inventoryBalances,
  inventoryMovements,
  shippingMethods,
  brands,
  categories,
  products,
  productImages,
  productAttributes,
  productAttributeValues,
  productVariants,
  variantAttributeValues,
  promotions,
  promotionCodes,
  promotionProducts,
  promotionVariants,
  promotionRules,
  promotionUsage,
  customers,
  customerAddresses,
  customerMemberships,
  carts,
  cartItems,
  orders,
  orderItems,
  orderStatusHistory,
  returns,
  returnItems,
  refunds,
  payments,
  shipments,
  settings,
} from "./schema";
import { eq } from "drizzle-orm";

export async function seed() {
  // 1. Roles (spec names)
  const roleNames = ["SUPER_ADMIN", "ADMIN", "INVENTORY_STAFF", "ORDER_STAFF", "CUSTOMER"];
  for (const name of roleNames) {
    await db.insert(roles).values({ name, description: `${name} role` }).onConflictDoNothing();
  }
  const allRoles = await db.select().from(roles);
  const roleId = (n: string) => allRoles.find((r) => r.name === n)!.id;

  // 2. Dev Super Admin — env-driven, NEVER in production, never hard-coded.
  // Set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD locally to enable.
  const seedEmail = process.env.SEED_ADMIN_EMAIL;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  let adminId: string | null = null;
  if (process.env.NODE_ENV === "production" && (seedEmail || seedPassword)) {
    throw new Error("SEED_ADMIN_* must not be set in production");
  }
  if (seedEmail && seedPassword && process.env.NODE_ENV !== "production") {
    const { hashPassword, newUserId } = await import("../lib/auth");
    const existing = await db.select().from(users).where(eq(users.email, seedEmail)).limit(1);
    if (existing[0]) {
      adminId = existing[0].id;
      // Force-reset policy: ensure the dev admin has a bcrypt hash.
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(seedPassword) })
        .where(eq(users.id, adminId));
      console.log(`Seed admin exists: ${seedEmail}`);
    } else {
      adminId = newUserId();
      await db.insert(users).values({
        id: adminId,
        email: seedEmail,
        name: "Pickle Admin",
        passwordHash: await hashPassword(seedPassword),
        emailVerified: true,
      });
      console.log(`Seed admin created: ${seedEmail}`);
    }
    if (adminId) {
      await db
        .insert(userRoles)
        .values({ userId: adminId, roleId: roleId("SUPER_ADMIN"), grantedBy: adminId })
        .onConflictDoNothing();
    }
  } else {
    console.log("SEED_ADMIN_* not set — skipping dev super-admin (set them locally to enable login).");
  }

  // 3. Membership tiers (dev example: Regular free 0%, Gold 10%, VIP 15%).
  // onConflictDoNothing: reseeds never clobber admin-configured tiers.
  const tiers = [
    { name: "Regular", description: "Free tier for every customer", membershipFee: 0, validityDays: null, minSpend: 0, discountPct: 0, benefits: ["Member pricing access"], priority: 0 },
    { name: "Silver", description: "Spend-based Silver", membershipFee: 0, validityDays: null, minSpend: 1000000, discountPct: 5, benefits: ["5% off"], priority: 1 },
    { name: "Gold", description: "Paid Gold membership", membershipFee: 99900, validityDays: 365, minSpend: 5000000, discountPct: 10, benefits: ["10% off", "Early sale access"], priority: 2 },
    { name: "Platinum", description: "Spend-based Platinum", membershipFee: 0, validityDays: null, minSpend: 15000000, discountPct: 15, benefits: ["15% off"], priority: 3 },
    { name: "VIP", description: "Top paid membership", membershipFee: 199900, validityDays: 365, minSpend: 0, discountPct: 15, benefits: ["15% off", "Free local delivery", "Priority support"], priority: 4 },
  ];
  for (const t of tiers) await db.insert(membershipTiers).values(t).onConflictDoNothing();

  // 4. Locations
  await db
    .insert(inventoryLocations)
    .values([
      { code: "WH-QC", name: "Main Warehouse", type: "warehouse", address: "Quezon City, Metro Manila" },
      { code: "STORE-MAKATI", name: "Makati Store", type: "store", address: "Makati City, Metro Manila" },
    ])
    .onConflictDoNothing();
  const locs = await db.select().from(inventoryLocations);
  const warehouse = locs.find((l) => l.code === "WH-QC")!;

  // 5. Shipping methods — checkout offers pickup / local_delivery /
  // standard_shipping (fee confirmed by staff, ₱0 due at order time).
  // Legacy flat_* rows are kept for historical shipments.
  const methods = [
    { code: "pickup", name: "Store Pickup", baseFee: 0 },
    { code: "local_delivery", name: "Local Delivery", baseFee: 15000 },
    { code: "standard_shipping", name: "Standard Shipping", baseFee: 25000 },
    { code: "flat_ncr", name: "Metro Manila Flat Rate", baseFee: 15000 },
    { code: "flat_luzon", name: "Luzon Flat Rate", baseFee: 25000 },
    { code: "flat_vismin", name: "Visayas/Mindanao Flat Rate", baseFee: 35000 },
  ];
  for (const m of methods) await db.insert(shippingMethods).values(m).onConflictDoNothing();

  // 6. Catalog: brand + category + product + attributes + variants + images
  await db.insert(brands).values({ name: "Pickle Unltd", slug: "pickle-unltd" }).onConflictDoNothing();
  await db.insert(categories).values({ name: "Classic Dill", slug: "classic-dill", description: "Seeded classic dill category" }).onConflictDoNothing();
  const brand = (await db.select().from(brands).where(eq(brands.slug, "pickle-unltd")).limit(1))[0];
  const category = (await db.select().from(categories).where(eq(categories.slug, "classic-dill")).limit(1))[0];

  const existingProducts = await db.select().from(products).where(eq(products.slug, "classic-dill-pickles")).limit(1);
  let productId: string;
  if (existingProducts.length === 0) {
    const [p] = await db
      .insert(products)
      .values({ name: "Classic Dill Pickles", slug: "classic-dill-pickles", description: "Seeded classic dill jar pickles", brandId: brand.id, categoryId: category.id, basePrice: 34900 })
      .returning();
    productId = p.id;
    await db.insert(productImages).values({ productId, url: "https://example.ph/classic-dill-pickles.jpg", alt: "Classic Dill Pickles", sortOrder: 0 });
    const [sizeAttr] = await db.insert(productAttributes).values({ productId, name: "Size" }).returning();
    const [sizeS] = await db.insert(productAttributeValues).values({ attributeId: sizeAttr.id, value: "250ml" }).returning();
    const [sizeL] = await db.insert(productAttributeValues).values({ attributeId: sizeAttr.id, value: "500ml" }).returning();
    const variantDefs = [
      { sku: "PICKLE-DILL-250", name: "250ml", values: [sizeS.id], price: null as number | null, stock: 100 },
      { sku: "PICKLE-DILL-500", name: "500ml", values: [sizeL.id], price: 54900, stock: 50 },
    ];
    for (const v of variantDefs) {
      const [variant] = await db.insert(productVariants).values({ productId, sku: v.sku, name: v.name, priceOverride: v.price }).returning();
      for (const av of v.values) {
        await db.insert(variantAttributeValues).values({ variantId: variant.id, attributeValueId: av }).onConflictDoNothing();
      }
      // 7. Opening balance + movement (traceable from zero)
      await db.insert(inventoryBalances).values({ variantId: variant.id, locationId: warehouse.id, onHand: v.stock, reserved: 0 }).onConflictDoNothing();
      await db.insert(inventoryMovements).values({
        variantId: variant.id,
        toLocationId: warehouse.id,
        qtyOnHandChange: v.stock,
        qtyReservedChange: 0,
        balanceAfter: v.stock,
        reason: "OPENING_STOCK",
        refType: "seed",
        refId: "opening-balance",
        note: "Seed opening balance",
        createdBy: adminId ?? null,
      });
    }
  } else {
    productId = existingProducts[0].id;
  }

  // 6b. Checkpoint 05 catalog quotas: 5 categories, 3 brands, 10 products,
  // 3+ products with variants. Idempotent via slug/SKU pre-checks.
  // Note: image URLs here are placeholders; real Vercel Blob uploads are
  // exercised manually via /admin/products/new (see CHECKPOINT notes).
  const seedBrands = [
    { name: "Manila Ferments", slug: "manila-ferments" },
    { name: "Sili Lab", slug: "sili-lab" },
  ];
  for (const b of seedBrands) {
    await db.insert(brands).values(b).onConflictDoNothing();
  }
  const seedCategories: { name: string; slug: string; description: string; sortOrder: number; parentSlug?: string }[] = [
    { name: "Spicy Sili", slug: "spicy-sili", description: "Hot and extra-hot pickled peppers", sortOrder: 1 },
    { name: "Sweet & Bread-and-Butter", slug: "sweet-butter", description: "Sweet brine pickles and relishes", sortOrder: 2 },
    { name: "Garlic Dill", slug: "garlic-dill", description: "Child of Classic Dill", sortOrder: 1, parentSlug: "classic-dill" },
    { name: "Fermented Favorites", slug: "fermented-favorites", description: "Kimchi-style and fermented vegetables", sortOrder: 3 },
  ];
  for (const c of seedCategories) {
    const parent = c.parentSlug
      ? (await db.select().from(categories).where(eq(categories.slug, c.parentSlug)).limit(1))[0]
      : undefined;
    await db
      .insert(categories)
      .values({
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: c.sortOrder,
        parentId: parent?.id ?? null,
      })
      .onConflictDoNothing();
  }
  const catBySlug = async (slug: string) =>
    (await db.select().from(categories).where(eq(categories.slug, slug)).limit(1))[0];
  const brandBySlug = async (slug: string) =>
    (await db.select().from(brands).where(eq(brands.slug, slug)).limit(1))[0];

  async function ensureVariant(
    pid: string,
    def: { sku: string; name: string; price?: number | null; cost?: number | null; stock: number; values?: string[]; valueIds?: string[] }
  ) {
    const existing = await db.select().from(productVariants).where(eq(productVariants.sku, def.sku)).limit(1);
    let variantId: string;
    if (existing.length === 0) {
      const [variant] = await db
        .insert(productVariants)
        .values({ productId: pid, sku: def.sku, name: def.name, priceOverride: def.price ?? null, costPrice: def.cost ?? null })
        .returning();
      variantId = variant.id;
      for (const av of def.valueIds ?? []) {
        await db.insert(variantAttributeValues).values({ variantId, attributeValueId: av }).onConflictDoNothing();
      }
      await db.insert(inventoryBalances).values({ variantId, locationId: warehouse.id, onHand: def.stock, reserved: 0 }).onConflictDoNothing();
      await db.insert(inventoryMovements).values({
        variantId,
        toLocationId: warehouse.id,
        qtyOnHandChange: def.stock,
        qtyReservedChange: 0,
        balanceAfter: def.stock,
        reason: "OPENING_STOCK",
        refType: "seed",
        refId: "opening-balance",
        note: "Seed opening balance",
        createdBy: adminId ?? null,
      });
    } else {
      variantId = existing[0].id;
    }
    return variantId;
  }

  type SeedProduct = {
    name: string; slug: string; sku?: string; short?: string; desc: string;
    brand: string; category: string; base: number; compare?: number; cost?: number;
    status: "draft" | "active" | "inactive" | "archived"; featured?: boolean;
    track?: boolean; threshold?: number; weightG?: number;
    attributes?: { name: string; values: string[] }[];
    variants?: { sku: string; name: string; price?: number | null; cost?: number | null; stock: number; values: string[] }[];
  };
  const seedProducts: SeedProduct[] = [
    { name: "Garlic Dill Spears", slug: "garlic-dill-spears", sku: "DILL-GARLIC-250", short: "Crunchy garlic dill spears", desc: "Crunchy cucumber spears in garlic dill brine", brand: "pickle-unltd", category: "garlic-dill", base: 34900, compare: 42900, cost: 16000, status: "active", featured: true, threshold: 10, weightG: 450 },
    { name: "Siling Labuyo Pickles", slug: "siling-labuyo-pickles", sku: "SILI-LABUYO-250", short: "Fiery native chili pickles", desc: "Fiery siling labuyo in cane-vinegar brine", brand: "sili-lab", category: "spicy-sili", base: 39900, compare: 47900, cost: 18000, status: "active", weightG: 350, threshold: 5 },
    { name: "Sweet Bread-and-Butter Chips", slug: "sweet-butter-chips", sku: "SWEET-BB-250", short: "Sweet crinkle-cut chips", desc: "Sweet bread-and-butter cucumber chips", brand: "manila-ferments", category: "sweet-butter", base: 32900, status: "active", featured: true, weightG: 400 },
    { name: "Atchara Papaya Relish", slug: "atchara-papaya-relish", sku: "ATCHARA-250", short: "Classic Filipino atchara", desc: "Classic green papaya atchara with peppers", brand: "manila-ferments", category: "sweet-butter", base: 29900, cost: 13000, status: "active", weightG: 380 },
    {
      name: "Spicy Dill Pickles", slug: "spicy-dill-pickles", short: "Dill with a sili kick", desc: "Classic dill brine with siling labuyo heat",
      brand: "pickle-unltd", category: "spicy-sili", base: 36900, compare: 42900, cost: 17000,
      status: "active", featured: true, weightG: 450,
      attributes: [{ name: "Size", values: ["250ml", "500ml"] }, { name: "Heat", values: ["Medium", "Hot"] }],
      variants: [
        { sku: "SPICY-DILL-MED-250", name: "Medium / 250ml", price: null, cost: 17000, stock: 40, values: ["Medium", "250ml"] },
        { sku: "SPICY-DILL-HOT-250", name: "Hot / 250ml", price: null, cost: 17000, stock: 35, values: ["Hot", "250ml"] },
        { sku: "SPICY-DILL-HOT-500", name: "Hot / 500ml", price: 59900, cost: 28000, stock: 20, values: ["Hot", "500ml"] },
      ],
    },
    {
      name: "Kimchi-Style Mustasa", slug: "kimchi-style-mustasa", short: "Fermented mustard greens", desc: "Fermented mustasa in kimchi-style seasoning",
      brand: "manila-ferments", category: "fermented-favorites", base: 35900, cost: 16000,
      status: "active", weightG: 400,
      attributes: [{ name: "Size", values: ["250ml", "500ml"] }],
      variants: [
        { sku: "MUSTASA-250", name: "250ml", price: null, cost: 16000, stock: 30, values: ["250ml"] },
        { sku: "MUSTASA-500", name: "500ml", price: 57900, cost: 26000, stock: 18, values: ["500ml"] },
      ],
    },
    { name: "Pickled Red Onions", slug: "pickled-red-onions", sku: "ONION-RED-250", short: "Bright pink pickled onions", desc: "Quick-pickled red onions for silog and tacos", brand: "pickle-unltd", category: "fermented-favorites", base: 27900, cost: 12000, status: "inactive", weightG: 300 },
    { name: "Burong Mangga", slug: "burong-mangga", sku: "MANGGA-250", short: "Fermented green mango", desc: "Burong mangga with a salty-sour brine", brand: "manila-ferments", category: "fermented-favorites", base: 31900, compare: 37900, cost: 14000, status: "active", threshold: 5, weightG: 380 },
    {
      name: "Jalapeño Nacho Slices", slug: "jalapeno-nacho-slices", short: "Nacho-style jalapeños", desc: "Pickled jalapeño slices for nachos and burgers",
      brand: "sili-lab", category: "spicy-sili", base: 38900, cost: 17500,
      status: "draft", weightG: 350,
      attributes: [{ name: "Heat", values: ["Medium", "Hot"] }, { name: "Size", values: ["250ml", "500ml"] }],
      variants: [
        { sku: "JAL-MED-250", name: "Medium / 250ml", price: null, cost: 17500, stock: 25, values: ["Medium", "250ml"] },
        { sku: "JAL-HOT-250", name: "Hot / 250ml", price: null, cost: 17500, stock: 25, values: ["Hot", "250ml"] },
        { sku: "JAL-HOT-500", name: "Hot / 500ml", price: 61900, cost: 29000, stock: 15, values: ["Hot", "500ml"] },
      ],
    },
  ];
  for (const sp of seedProducts) {
    const found = await db.select().from(products).where(eq(products.slug, sp.slug)).limit(1);
    let pid: string;
    if (found.length === 0) {
      const b = await brandBySlug(sp.brand);
      const c = await catBySlug(sp.category);
      const [p] = await db
        .insert(products)
        .values({
          name: sp.name,
          slug: sp.slug,
          shortDescription: sp.short ?? null,
          description: sp.desc,
          sku: sp.sku ?? null,
          brandId: b.id,
          categoryId: c.id,
          basePrice: sp.base,
          comparePrice: sp.compare ?? null,
          costPrice: sp.cost ?? null,
          trackInventory: sp.track ?? true,
          lowStockThreshold: sp.threshold ?? null,
          weightG: sp.weightG ?? null,
          status: sp.status,
          featured: sp.featured ?? false,
          isActive: sp.status === "active",
        })
        .returning();
      pid = p.id;
      await db.insert(productImages).values({ productId: pid, url: `https://example.ph/${sp.slug}.jpg`, alt: sp.name, sortOrder: 0 });
      const valueIds = new Map<string, string>();
      for (const attr of sp.attributes ?? []) {
        const [a] = await db.insert(productAttributes).values({ productId: pid, name: attr.name }).returning();
        for (const val of attr.values) {
          const [av] = await db.insert(productAttributeValues).values({ attributeId: a.id, value: val }).returning();
          valueIds.set(val, av.id);
        }
      }
      for (const v of sp.variants ?? []) {
        await ensureVariant(pid, { ...v, valueIds: v.values.map((x) => valueIds.get(x)!).filter(Boolean) });
      }
      // Simple products get a default variant so the storefront can sell them.
      if ((!sp.variants || sp.variants.length === 0) && sp.sku) {
        await ensureVariant(pid, { sku: sp.sku, name: "Default", price: null, cost: sp.cost ?? null, stock: 50 });
      }
    } else {
      pid = found[0].id;
    }
    void pid;
  }
  // 8. Promotions: 10% auto + WELCOME10 code + scoped line promos + BOGO +
  // first-order code + free shipping (exercises the full pipeline chain).
  const existingPromo = await db.select().from(promotions).where(eq(promotions.name, "Seed 10% Auto")).limit(1);
  let autoPromoId: string;
  if (existingPromo.length === 0) {
    const [auto] = await db
      .insert(promotions)
      .values({ name: "Seed 10% Auto", description: "10% off cart subtotal", type: "auto", kind: "percent", value: 10, minSpend: 0, priority: 1, stackable: false })
      .returning();
    autoPromoId = auto.id;
    const [code] = await db
      .insert(promotions)
      .values({ name: "Seed Welcome Code", description: "₱100 off pickle product lines", type: "code", kind: "fixed", value: 10000, minSpend: 50000, priority: 10 })
      .returning();
    await db.insert(promotionCodes).values({ promotionId: code.id, code: "WELCOME10", usageLimit: 1000 }).onConflictDoNothing();
    await db.insert(promotionProducts).values({ promotionId: code.id, productId }).onConflictDoNothing();

    // 20% line promo scoped to the seed pickle product (line stage, exclusive).
    const [line20] = await db
      .insert(promotions)
      .values({ name: "Seed 20% Pickle Line", description: "20% off seed pickle lines", type: "auto", kind: "percent", value: 20, minSpend: 0, priority: 5, stackable: false })
      .returning();
    await db.insert(promotionProducts).values({ promotionId: line20.id, productId }).onConflictDoNothing();

    // Buy 2 Get 1 on the seed pickle variant (stackable line promo).
    const demoVar = (await db.select().from(productVariants).where(eq(productVariants.sku, "PICKLE-DILL-250")).limit(1))[0];
    if (demoVar) {
      const [bogo] = await db
        .insert(promotions)
        .values({ name: "Seed BOGO Pickle", description: "Buy 2 get 1 free (seed pickle jar)", type: "auto", kind: "bogo", value: 0, config: { buyVariantId: demoVar.id, buyQty: 2, getQty: 1, getPct: 100 }, minSpend: 0, priority: 3, stackable: true })
        .returning();
      await db.insert(promotionVariants).values({ promotionId: bogo.id, variantId: demoVar.id }).onConflictDoNothing();
    }

    // First-order 10% code.
    const [first] = await db
      .insert(promotions)
      .values({ name: "Seed First Order", description: "10% off your first order", type: "code", kind: "percent", value: 10, minSpend: 0, priority: 10, stackable: false })
      .returning();
    await db.insert(promotionCodes).values({ promotionId: first.id, code: "FIRST100", usageLimit: 1000 }).onConflictDoNothing();
    await db.insert(promotionRules).values({ promotionId: first.id, key: "first_order_only", value: true }).onConflictDoNothing();

    // Free shipping waiver (applies last, never blocks the chain).
    await db
      .insert(promotions)
      .values({ name: "Seed Free Shipping", description: "Waives the staff-confirmed delivery fee", type: "auto", kind: "free_shipping", value: 0, minSpend: 0, priority: -10, stackable: true });
  } else {
    autoPromoId = existingPromo[0].id;
  }
  void autoPromoId;

  // 9. Pickle customer + address + membership + order lifecycle
  const custEmail = "customer@example.ph";
  const existingUser = await db.select().from(users).where(eq(users.email, custEmail)).limit(1);
  let custUserId: string;
  if (existingUser.length === 0) {
    const [u] = await db.insert(users).values({ id: `seed-cust-${Date.now()}`, name: "Pickle Customer", email: custEmail, emailVerified: true }).returning();
    custUserId = u.id;
  } else {
    custUserId = existingUser[0].id;
  }
  await db.insert(userRoles).values({ userId: custUserId, roleId: roleId("CUSTOMER"), grantedBy: adminId ?? null }).onConflictDoNothing();
  const existingCust = await db.select().from(customers).where(eq(customers.userId, custUserId)).limit(1);
  let customerId: string;
  if (existingCust.length === 0) {
    const [c] = await db.insert(customers).values({ userId: custUserId, mobile: "09171234567", lifetimeSpend: 0 }).returning();
    customerId = c.id;
    await db.insert(customerAddresses).values({
      customerId,
      label: "Home",
      recipient: "Pickle Customer",
      mobile: "09171234567",
      region: "NCR",
      province: "Metro Manila",
      city: "Quezon City",
      barangay: "Commonwealth",
      street: "123 Sampaguita St",
      zip: "1121",
      isDefault: true,
    });
    const regular = (await db.select().from(membershipTiers).where(eq(membershipTiers.name, "Regular")).limit(1))[0];
    if (regular) await db.insert(customerMemberships).values({ customerId, tierId: regular.id });
  } else {
    customerId = existingCust[0].id;
  }

  // 9b. Demo paid membership (Gold, active) + one explicit member price.
  // Powers the membership test matrix: active Gold pricing + explicit-price line.
  const goldTier = (await db.select().from(membershipTiers).where(eq(membershipTiers.name, "Gold")).limit(1))[0];
  if (goldTier) {
    const hasPaid = await db.select().from(memberships).where(eq(memberships.customerId, customerId)).limit(1);
    if (hasPaid.length === 0) {
      await db.insert(memberships).values({
        customerId,
        membershipNo: `MBR-SEED-GOLD`,
        tierId: goldTier.id,
        status: "active",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        paymentRef: "SEED-GCASH-REF",
        activatedBy: adminId ?? null,
        activatedAt: new Date(),
      }).onConflictDoNothing();
    }
    const demoVariant = (await db.select().from(productVariants).where(eq(productVariants.sku, "PICKLE-DILL-250")).limit(1))[0];
    if (demoVariant) {
      await db.insert(memberPrices).values({
        tierId: goldTier.id,
        variantId: demoVariant.id,
        productId: null,
        price: 29900, // explicit Gold price (< 34900 base)
      }).onConflictDoNothing();
    }
  }
  // Sample paid order proving FK chain + snapshots + status history
  const existingOrder = await db.select().from(orders).where(eq(orders.orderNo, "ORD-SEED-0001")).limit(1);
  if (existingOrder.length === 0) {
    const variants = await db.select().from(productVariants).limit(1);
    if (variants[0]) {
      const v = variants[0];
      const [order] = await db
        .insert(orders)
        .values({
          orderNo: "ORD-SEED-0001",
          customerId: custUserId,
          status: "confirmed",
          paymentStatus: "paid",
          fulfillmentStatus: "unfulfilled",
          currency: "PHP",
          subtotal: 34900,
          discountMember: 0,
          discountPromo: 3490,
          deliveryFee: 0,
          grandTotal: 31410,
          fulfillment: "pickup",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      await db.insert(orderItems).values({
        orderId: order.id,
        variantId: v.id,
        productName: "Classic Dill Pickles",
        sku: v.sku,
        variantName: v.name,
        originalUnitPrice: 34900,
        effectiveUnitPrice: 31410,
        discountAmount: 3490,
        quantity: 1,
        lineTotal: 31410,
      });
      await db.insert(orderStatusHistory).values([
        { orderId: order.id, fromStatus: null, toStatus: "pending", actorId: custUserId, note: "Seed order created" },
        { orderId: order.id, fromStatus: "pending", toStatus: "confirmed", actorId: adminId ?? custUserId, note: "Seed payment verified" },
      ]);
      await db.insert(payments).values({ orderId: order.id, method: "cod", amount: 31410, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const pickup = (await db.select().from(shippingMethods).where(eq(shippingMethods.code, "pickup")).limit(1))[0];
      await db.insert(shipments).values({ orderId: order.id, shippingMethodId: pickup?.id, mode: "pickup", fee: 0, notes: "Seed pickup", status: "ready" });
      const seedPromo = (await db.select().from(promotions).where(eq(promotions.name, "Seed 10% Auto")).limit(1))[0];
      if (seedPromo) {
        await db.insert(promotionUsage).values({ promotionId: seedPromo.id, customerId: custUserId, orderId: order.id, discount: 3490 });
      }
    }
  }

  // 9c. Returned/refunded pickle order: completed + delivered, one line
  // returned+restocked, one line damaged, partial refund completed.
  const existingReturn = await db.select().from(orders).where(eq(orders.orderNo, "ORD-SEED-0002")).limit(1);
  if (existingReturn.length === 0) {
    const seedVars = await db.select().from(productVariants).limit(2);
    if (seedVars.length === 2) {
      const [order2] = await db
        .insert(orders)
        .values({
          orderNo: "ORD-SEED-0002",
          customerId: custUserId,
          status: "completed",
          paymentStatus: "partially_refunded",
          fulfillmentStatus: "delivered",
          currency: "PHP",
          subtotal: 74800,
          discountMember: 0,
          discountPromo: 0,
          deliveryFee: 0,
          grandTotal: 74800,
          fulfillment: "delivery",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      const [oi1] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[0].id, productName: "Classic Dill Pickles", sku: seedVars[0].sku,
        variantName: seedVars[0].name, originalUnitPrice: 34900, effectiveUnitPrice: 34900,
        discountAmount: 0, quantity: 1, lineTotal: 34900,
      }).returning();
      const [oi2] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[1].id, productName: "Classic Dill Pickles", sku: seedVars[1].sku,
        variantName: seedVars[1].name, originalUnitPrice: 39900, effectiveUnitPrice: 39900,
        discountAmount: 0, quantity: 1, lineTotal: 39900,
      }).returning();
      await db.insert(payments).values({ orderId: order2.id, method: "gcash_manual", referenceNo: "SEED-REF-001", amount: 74800, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const [ret] = await db.insert(returns).values({ orderId: order2.id, reason: "Seed: one restock, one damaged", status: "approved" }).returning();
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi1.id, qty: 1, disposition: "restock" });
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi2.id, qty: 1, disposition: "damaged" });
      await db.insert(refunds).values({ orderId: order2.id, returnId: ret.id, amount: 34900, method: "gcash_manual", status: "completed", reason: "Seed partial refund", processedBy: adminId ?? null });
    }
  }

  // 10. Settings
  const seedSettings: [string, unknown][] = [
    ["store_name", { value: "Pickle Unltd" }],
    ["gcash_info", { number: "0917XXXXXXX", name: "Pickle Unltd" }],
    ["pickup_address", { value: "Makati Store, Makati City, Metro Manila" }],
  ];
  for (const [key, value] of seedSettings) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }

  // 11. Touch carts (proves cart tables work)
  const [cart] = await db.insert(carts).values({ customerId: custUserId }).returning().catch(async () => {
    return db.select().from(carts).where(eq(carts.customerId, custUserId)).limit(1);
  });
  const cartRow = Array.isArray(cart) ? cart[0] : cart;
  if (cartRow) {
    const variants = await db.select().from(productVariants).limit(1);
    if (variants[0]) {
      await db.insert(cartItems).values({ cartId: cartRow.id, variantId: variants[0].id, qty: 1 }).onConflictDoNothing();
    }
  }

  console.log("Seed complete: roles, admin, tiers, locations, shipping, catalog, balances, promos, customer, order, settings");
}

const isSeedDirectRun =
  !!process.argv[1] &&
  (process.argv[1].endsWith("db/seed.ts") || process.argv[1].endsWith("seed"));

if (isSeedDirectRun) {
  seed().then(
    () => process.exit(0),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  );
}

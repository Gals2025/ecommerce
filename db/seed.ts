// Full demo seed: roles → admin → tiers → locations → shipping → catalog →
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
        name: "Store Admin",
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
  await db.insert(brands).values({ name: "Demo Brand", slug: "demo-brand" }).onConflictDoNothing();
  await db.insert(categories).values({ name: "Demo Category", slug: "demo-category", description: "Seeded demo category" }).onConflictDoNothing();
  const brand = (await db.select().from(brands).where(eq(brands.slug, "demo-brand")).limit(1))[0];
  const category = (await db.select().from(categories).where(eq(categories.slug, "demo-category")).limit(1))[0];

  const existingProducts = await db.select().from(products).where(eq(products.slug, "demo-shirt")).limit(1);
  let productId: string;
  if (existingProducts.length === 0) {
    const [p] = await db
      .insert(products)
      .values({ name: "Demo Shirt", slug: "demo-shirt", description: "Seeded demo product", brandId: brand.id, categoryId: category.id, basePrice: 99900 })
      .returning();
    productId = p.id;
    await db.insert(productImages).values({ productId, url: "https://example.ph/demo-shirt.jpg", alt: "Demo Shirt", sortOrder: 0 });
    const [sizeAttr] = await db.insert(productAttributes).values({ productId, name: "Size" }).returning();
    const [colorAttr] = await db.insert(productAttributes).values({ productId, name: "Color" }).returning();
    const [sizeM] = await db.insert(productAttributeValues).values({ attributeId: sizeAttr.id, value: "M" }).returning();
    const [sizeL] = await db.insert(productAttributeValues).values({ attributeId: sizeAttr.id, value: "L" }).returning();
    const [colorRed] = await db.insert(productAttributeValues).values({ attributeId: colorAttr.id, value: "Red" }).returning();
    const variantDefs = [
      { sku: "DEMO-SHIRT-RED-M", name: "Red / M", values: [colorRed.id, sizeM.id], price: null as number | null, stock: 100 },
      { sku: "DEMO-SHIRT-RED-L", name: "Red / L", values: [colorRed.id, sizeL.id], price: 109900, stock: 50 },
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
    { name: "Luzon Apparel", slug: "luzon-apparel" },
    { name: "Manila Goods", slug: "manila-goods" },
  ];
  for (const b of seedBrands) {
    await db.insert(brands).values(b).onConflictDoNothing();
  }
  const seedCategories: { name: string; slug: string; description: string; sortOrder: number; parentSlug?: string }[] = [
    { name: "Men's Apparel", slug: "mens-apparel", description: "Tops, bottoms, outerwear for men", sortOrder: 1 },
    { name: "Women's Apparel", slug: "womens-apparel", description: "Tops, dresses and more", sortOrder: 2 },
    { name: "T-Shirts", slug: "t-shirts", description: "Child of Men's Apparel", sortOrder: 1, parentSlug: "mens-apparel" },
    { name: "Accessories", slug: "accessories", description: "Bags, scarves, wallets", sortOrder: 3 },
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
    { name: "Classic White Tee", slug: "classic-white-tee", sku: "TEE-WHITE-001", short: "Everyday cotton tee", desc: "100% cotton everyday tee", brand: "luzon-apparel", category: "t-shirts", base: 59900, compare: 79900, cost: 30000, status: "active", featured: true, threshold: 10, weightG: 180 },
    { name: "Slim Denim Jeans", slug: "slim-denim-jeans", sku: "JEAN-SLIM-001", short: "Slim-fit stretch denim", desc: "Slim-fit stretch denim jeans", brand: "manila-goods", category: "mens-apparel", base: 149900, compare: 189900, cost: 80000, status: "active", weightG: 650, threshold: 5 },
    { name: "Floral Summer Dress", slug: "floral-summer-dress", sku: "DRESS-FLORAL-001", short: "Light floral dress", desc: "Lightweight floral summer dress", brand: "luzon-apparel", category: "womens-apparel", base: 129900, status: "active", featured: true, weightG: 320 },
    { name: "Canvas Tote Bag", slug: "canvas-tote-bag", sku: "TOTE-CANVAS-001", short: "Heavy-duty canvas tote", desc: "Heavy-duty canvas tote bag", brand: "manila-goods", category: "accessories", base: 49900, cost: 22000, status: "active", weightG: 400 },
    {
      name: "Running Sneakers", slug: "running-sneakers", short: "Cushioned road runners", desc: "Cushioned road running sneakers",
      brand: "luzon-apparel", category: "mens-apparel", base: 249900, compare: 299900, cost: 140000,
      status: "active", featured: true, weightG: 900,
      attributes: [{ name: "Size", values: ["8", "9", "10"] }, { name: "Color", values: ["Black", "White"] }],
      variants: [
        { sku: "SNEAK-BLK-8", name: "Black / 8", price: null, cost: 140000, stock: 20, values: ["Black", "8"] },
        { sku: "SNEAK-BLK-9", name: "Black / 9", price: null, cost: 140000, stock: 25, values: ["Black", "9"] },
        { sku: "SNEAK-WHT-10", name: "White / 10", price: 259900, cost: 145000, stock: 15, values: ["White", "10"] },
      ],
    },
    {
      name: "Hooded Jacket", slug: "hooded-jacket", short: "Warm hooded jacket", desc: "Warm hooded jacket for rainy season",
      brand: "manila-goods", category: "mens-apparel", base: 199900, cost: 110000,
      status: "active", weightG: 1100,
      attributes: [{ name: "Size", values: ["S", "M", "L"] }, { name: "Style", values: ["Zip", "Pullover"] }],
      variants: [
        { sku: "JACKET-ZIP-M", name: "Zip / M", price: null, cost: 110000, stock: 12, values: ["Zip", "M"] },
        { sku: "JACKET-PULL-L", name: "Pullover / L", price: 209900, cost: 115000, stock: 8, values: ["Pullover", "L"] },
      ],
    },
    { name: "Silk Scarf", slug: "silk-scarf", sku: "SCARF-SILK-001", short: "Pure silk scarf", desc: "Pure silk scarf", brand: "demo-brand", category: "accessories", base: 89900, cost: 45000, status: "inactive", weightG: 90 },
    { name: "Leather Wallet", slug: "leather-wallet", sku: "WALLET-LEATHER-001", short: "Full-grain bifold", desc: "Full-grain leather bifold wallet", brand: "manila-goods", category: "accessories", base: 79900, compare: 99900, cost: 40000, status: "active", threshold: 5, weightG: 120 },
    {
      name: "Kids Graphic Tee", slug: "kids-graphic-tee", short: "Fun prints for kids", desc: "Soft cotton graphic tee for kids",
      brand: "luzon-apparel", category: "t-shirts", base: 39900, cost: 18000,
      status: "draft", weightG: 140,
      attributes: [{ name: "Style", values: ["Cartoon", "Dino"] }, { name: "Size", values: ["XS", "S", "M"] }],
      variants: [
        { sku: "KIDTEE-CARTOON-XS", name: "Cartoon / XS", price: null, cost: 18000, stock: 30, values: ["Cartoon", "XS"] },
        { sku: "KIDTEE-DINO-S", name: "Dino / S", price: null, cost: 18000, stock: 30, values: ["Dino", "S"] },
        { sku: "KIDTEE-DINO-M", name: "Dino / M", price: 42900, cost: 19000, stock: 20, values: ["Dino", "M"] },
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
      .values({ name: "Seed Welcome Code", description: "₱100 off demo product lines", type: "code", kind: "fixed", value: 10000, minSpend: 50000, priority: 10 })
      .returning();
    await db.insert(promotionCodes).values({ promotionId: code.id, code: "WELCOME10", usageLimit: 1000 }).onConflictDoNothing();
    await db.insert(promotionProducts).values({ promotionId: code.id, productId }).onConflictDoNothing();

    // 20% line promo scoped to the demo product (line stage, exclusive).
    const [line20] = await db
      .insert(promotions)
      .values({ name: "Seed 20% Demo Line", description: "20% off demo-product lines", type: "auto", kind: "percent", value: 20, minSpend: 0, priority: 5, stackable: false })
      .returning();
    await db.insert(promotionProducts).values({ promotionId: line20.id, productId }).onConflictDoNothing();

    // Buy 2 Get 1 on the demo variant (stackable line promo).
    const demoVar = (await db.select().from(productVariants).where(eq(productVariants.sku, "DEMO-SHIRT-RED-M")).limit(1))[0];
    if (demoVar) {
      const [bogo] = await db
        .insert(promotions)
        .values({ name: "Seed BOGO Demo", description: "Buy 2 get 1 free (demo variant)", type: "auto", kind: "bogo", value: 0, config: { buyVariantId: demoVar.id, buyQty: 2, getQty: 1, getPct: 100 }, minSpend: 0, priority: 3, stackable: true })
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

  // 9. Demo customer + address + membership + order lifecycle
  const custEmail = "customer@example.ph";
  const existingUser = await db.select().from(users).where(eq(users.email, custEmail)).limit(1);
  let custUserId: string;
  if (existingUser.length === 0) {
    const [u] = await db.insert(users).values({ id: `seed-cust-${Date.now()}`, name: "Demo Customer", email: custEmail, emailVerified: true }).returning();
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
      recipient: "Demo Customer",
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
    const demoVariant = (await db.select().from(productVariants).where(eq(productVariants.sku, "DEMO-SHIRT-RED-M")).limit(1))[0];
    if (demoVariant) {
      await db.insert(memberPrices).values({
        tierId: goldTier.id,
        variantId: demoVariant.id,
        productId: null,
        price: 89900, // explicit Gold price (< 99900 base)
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
          subtotal: 99900,
          discountMember: 0,
          discountPromo: 9990,
          deliveryFee: 0,
          grandTotal: 89910,
          fulfillment: "pickup",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      await db.insert(orderItems).values({
        orderId: order.id,
        variantId: v.id,
        productName: "Demo Shirt",
        sku: v.sku,
        variantName: v.name,
        originalUnitPrice: 99900,
        effectiveUnitPrice: 89910,
        discountAmount: 9990,
        quantity: 1,
        lineTotal: 89910,
      });
      await db.insert(orderStatusHistory).values([
        { orderId: order.id, fromStatus: null, toStatus: "pending", actorId: custUserId, note: "Seed order created" },
        { orderId: order.id, fromStatus: "pending", toStatus: "confirmed", actorId: adminId ?? custUserId, note: "Seed payment verified" },
      ]);
      await db.insert(payments).values({ orderId: order.id, method: "cod", amount: 89910, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const pickup = (await db.select().from(shippingMethods).where(eq(shippingMethods.code, "pickup")).limit(1))[0];
      await db.insert(shipments).values({ orderId: order.id, shippingMethodId: pickup?.id, mode: "pickup", fee: 0, notes: "Seed pickup", status: "ready" });
      const seedPromo = (await db.select().from(promotions).where(eq(promotions.name, "Seed 10% Auto")).limit(1))[0];
      if (seedPromo) {
        await db.insert(promotionUsage).values({ promotionId: seedPromo.id, customerId: custUserId, orderId: order.id, discount: 9990 });
      }
    }
  }

  // 9c. Demo returned/refunded order: completed + delivered, one line
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
          subtotal: 199800,
          discountMember: 0,
          discountPromo: 0,
          deliveryFee: 0,
          grandTotal: 199800,
          fulfillment: "delivery",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      const [oi1] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[0].id, productName: "Demo Shirt", sku: seedVars[0].sku,
        variantName: seedVars[0].name, originalUnitPrice: 99900, effectiveUnitPrice: 99900,
        discountAmount: 0, quantity: 1, lineTotal: 99900,
      }).returning();
      const [oi2] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[1].id, productName: "Demo Shirt", sku: seedVars[1].sku,
        variantName: seedVars[1].name, originalUnitPrice: 99900, effectiveUnitPrice: 99900,
        discountAmount: 0, quantity: 1, lineTotal: 99900,
      }).returning();
      await db.insert(payments).values({ orderId: order2.id, method: "gcash_manual", referenceNo: "SEED-REF-001", amount: 199800, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const [ret] = await db.insert(returns).values({ orderId: order2.id, reason: "Seed demo: one restock, one damaged", status: "approved" }).returning();
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi1.id, qty: 1, disposition: "restock" });
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi2.id, qty: 1, disposition: "damaged" });
      await db.insert(refunds).values({ orderId: order2.id, returnId: ret.id, amount: 99900, method: "gcash_manual", status: "completed", reason: "Seed partial refund", processedBy: adminId ?? null });
    }
  }

  // 10. Settings
  const seedSettings: [string, unknown][] = [
    ["store_name", { value: "Demo PH Store" }],
    ["gcash_info", { number: "0917XXXXXXX", name: "Demo Store" }],
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

if (require.main === module) {
  seed().then(() => process.exit(0));
}

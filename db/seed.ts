// Full pickleball seed: roles → admin → tiers → locations → shipping → catalog →
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
        name: "Pickleball Admin",
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
  await db.insert(categories).values({ name: "Pro Paddles", slug: "pro-paddles", description: "Seeded pro-level pickleball paddles" }).onConflictDoNothing();
  const brand = (await db.select().from(brands).where(eq(brands.slug, "pickle-unltd")).limit(1))[0];
  const category = (await db.select().from(categories).where(eq(categories.slug, "pro-paddles")).limit(1))[0];

  const existingProducts = await db.select().from(products).where(eq(products.slug, "volt-pro-carbon-paddle")).limit(1);
  let productId: string;
  if (existingProducts.length === 0) {
    const [p] = await db
      .insert(products)
      .values({ name: "Volt Pro Carbon Paddle", slug: "volt-pro-carbon-paddle", description: "Seeded pro carbon pickleball paddle", brandId: brand.id, categoryId: category.id, basePrice: 549900 })
      .returning();
    productId = p.id;
    await db.insert(productImages).values({ productId, url: "https://example.ph/volt-pro-carbon-paddle.jpg", alt: "Volt Pro Carbon Paddle", sortOrder: 0 });
    const [gripAttr] = await db.insert(productAttributes).values({ productId, name: "Grip" }).returning();
    const [grip40] = await db.insert(productAttributeValues).values({ attributeId: gripAttr.id, value: '4"' }).returning();
    const [grip425] = await db.insert(productAttributeValues).values({ attributeId: gripAttr.id, value: '4.25"' }).returning();
    const variantDefs = [
      { sku: "PADDLE-VOLT-400", name: '4"', values: [grip40.id], price: null as number | null, stock: 100 },
      { sku: "PADDLE-VOLT-425", name: '4.25"', values: [grip425.id], price: 569900, stock: 50 },
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
    { name: "Carbon Edge", slug: "carbon-edge" },
    { name: "Court Thread", slug: "court-thread" },
  ];
  for (const b of seedBrands) {
    await db.insert(brands).values(b).onConflictDoNothing();
  }
  const seedCategories: { name: string; slug: string; description: string; sortOrder: number; parentSlug?: string }[] = [
    { name: "Paddles", slug: "paddles", description: "Brand-new pickleball paddles for every level", sortOrder: 1 },
    { name: "Balls", slug: "balls", description: "Tournament-grade indoor and outdoor pickleballs", sortOrder: 2 },
    { name: "Apparel", slug: "apparel", description: "Court-ready sportswear and apparel", sortOrder: 3 },
    { name: "Accessories", slug: "accessories", description: "Grips, bags, caps and court essentials", sortOrder: 4 },
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
    { name: "Surge Fiberglass Paddle", slug: "surge-fiberglass-paddle", sku: "PADDLE-SURGE-400", short: "Lightweight fiberglass paddle", desc: "Lightweight fiberglass paddle with a comfort grip", brand: "pickle-unltd", category: "paddles", base: 349900, compare: 419900, cost: 180000, status: "active", featured: true, threshold: 10, weightG: 230 },
    { name: "Tour Outdoor Balls 3-Pack", slug: "tour-outdoor-balls-3pk", sku: "BALL-TOUR-OUT-3PK", short: "Tournament outdoor balls", desc: "Tournament-grade 40-hole outdoor pickleballs, 3-pack", brand: "carbon-edge", category: "balls", base: 59900, compare: 74900, cost: 25000, status: "active", weightG: 300, threshold: 5 },
    { name: "Dry-Fit Court Tee", slug: "dry-fit-court-tee", sku: "APPAREL-TEE-M", short: "Sweat-wicking court tee", desc: "Sweat-wicking dry-fit tee for long court sessions", brand: "court-thread", category: "apparel", base: 129900, status: "active", featured: true, weightG: 180 },
    { name: "Court Performance Shorts", slug: "court-performance-shorts", sku: "APPAREL-SHORTS-M", short: "Classic court shorts", desc: "Lightweight performance shorts with ball pockets", brand: "court-thread", category: "apparel", base: 139900, cost: 60000, status: "active", weightG: 220 },
    {
      name: "Control Touch Pro Paddle", slug: "control-touch-pro-paddle", short: "Control paddle with spin texture", desc: "Carbon-face control paddle with spin texture",
      brand: "carbon-edge", category: "pro-paddles", base: 499900, compare: 579900, cost: 250000,
      status: "active", featured: true, weightG: 235,
      attributes: [{ name: "Grip", values: ['4"', '4.25"'] }, { name: "Weight", values: ["Light", "Standard"] }],
      variants: [
        { sku: "PADDLE-CTRL-LT-400", name: 'Light / 4"', price: null, cost: 250000, stock: 40, values: ["Light", '4"'] },
        { sku: "PADDLE-CTRL-STD-400", name: 'Standard / 4"', price: null, cost: 250000, stock: 35, values: ["Standard", '4"'] },
        { sku: "PADDLE-CTRL-STD-425", name: 'Standard / 4.25"', price: 519900, cost: 260000, stock: 20, values: ["Standard", '4.25"'] },
      ],
    },
    {
      name: "Rally Starter Paddle", slug: "rally-starter-paddle", short: "Beginner-friendly paddle", desc: "Beginner-friendly paddle with a wide sweet spot",
      brand: "pickle-unltd", category: "paddles", base: 249900, cost: 120000,
      status: "active", weightG: 240,
      attributes: [{ name: "Grip", values: ['4"', '4.25"'] }],
      variants: [
        { sku: "PADDLE-RALLY-400", name: '4"', price: null, cost: 120000, stock: 30, values: ['4"'] },
        { sku: "PADDLE-RALLY-425", name: '4.25"', price: 259900, cost: 125000, stock: 18, values: ['4.25"'] },
      ],
    },
    { name: "Sideline Court Cap", slug: "sideline-court-cap", sku: "APPAREL-CAP-OS", short: "Breathable court cap", desc: "Breathable one-size court cap", brand: "court-thread", category: "accessories", base: 89900, cost: 35000, status: "inactive", weightG: 100 },
    { name: "Tour Outdoor Balls 6-Pack", slug: "tour-outdoor-balls-6pk", sku: "BALL-TOUR-OUT-6PK", short: "Outdoor balls value pack", desc: "Tournament-grade outdoor pickleballs, value 6-pack", brand: "carbon-edge", category: "balls", base: 99900, compare: 119900, cost: 45000, status: "active", threshold: 5, weightG: 550 },
    {
      name: "Court Cushion Socks 3-Pack", slug: "court-cushion-socks-3pk", short: "Cushioned court socks", desc: "Cushioned ankle socks for quick lateral moves",
      brand: "court-thread", category: "accessories", base: 79900, cost: 30000,
      status: "draft", weightG: 150,
      attributes: [{ name: "Size", values: ["M", "L"] }],
      variants: [
        { sku: "APPAREL-SOCKS-M", name: "M", price: null, cost: 30000, stock: 25, values: ["M"] },
        { sku: "APPAREL-SOCKS-L", name: "L", price: null, cost: 30000, stock: 25, values: ["L"] },
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
      .values({ name: "Seed Welcome Code", description: "₱100 off pickleball gear lines", type: "code", kind: "fixed", value: 10000, minSpend: 50000, priority: 10 })
      .returning();
    await db.insert(promotionCodes).values({ promotionId: code.id, code: "WELCOME10", usageLimit: 1000 }).onConflictDoNothing();
    await db.insert(promotionProducts).values({ promotionId: code.id, productId }).onConflictDoNothing();

    // 20% line promo scoped to the seed paddle product (line stage, exclusive).
    const [line20] = await db
      .insert(promotions)
      .values({ name: "Seed 20% Paddle Line", description: "20% off seed paddle lines", type: "auto", kind: "percent", value: 20, minSpend: 0, priority: 5, stackable: false })
      .returning();
    await db.insert(promotionProducts).values({ promotionId: line20.id, productId }).onConflictDoNothing();

    // Buy 2 Get 1 on the seed ball variant (stackable line promo).
    const demoVar = (await db.select().from(productVariants).where(eq(productVariants.sku, "BALL-TOUR-OUT-3PK")).limit(1))[0];
    if (demoVar) {
      const [bogo] = await db
        .insert(promotions)
        .values({ name: "Seed BOGO Balls", description: "Buy 2 get 1 free (tour outdoor 3-pack)", type: "auto", kind: "bogo", value: 0, config: { buyVariantId: demoVar.id, buyQty: 2, getQty: 1, getPct: 100 }, minSpend: 0, priority: 3, stackable: true })
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

  // 9. Pickleball customer + address + membership + order lifecycle
  const custEmail = "customer@example.ph";
  const existingUser = await db.select().from(users).where(eq(users.email, custEmail)).limit(1);
  let custUserId: string;
  if (existingUser.length === 0) {
    const [u] = await db.insert(users).values({ id: `seed-cust-${Date.now()}`, name: "Pickleball Customer", email: custEmail, emailVerified: true }).returning();
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
      recipient: "Pickleball Customer",
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
    const demoVariant = (await db.select().from(productVariants).where(eq(productVariants.sku, "BALL-TOUR-OUT-3PK")).limit(1))[0];
    if (demoVariant) {
      await db.insert(memberPrices).values({
        tierId: goldTier.id,
        variantId: demoVariant.id,
        productId: null,
        price: 49900, // explicit Gold price (< 59900 base)
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
          subtotal: 59900,
          discountMember: 0,
          discountPromo: 5990,
          deliveryFee: 0,
          grandTotal: 53910,
          fulfillment: "pickup",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      await db.insert(orderItems).values({
        orderId: order.id,
        variantId: v.id,
        productName: "Tour Outdoor Balls 3-Pack",
        sku: v.sku,
        variantName: v.name,
        originalUnitPrice: 59900,
        effectiveUnitPrice: 53910,
        discountAmount: 5990,
        quantity: 1,
        lineTotal: 53910,
      });
      await db.insert(orderStatusHistory).values([
        { orderId: order.id, fromStatus: null, toStatus: "pending", actorId: custUserId, note: "Seed order created" },
        { orderId: order.id, fromStatus: "pending", toStatus: "confirmed", actorId: adminId ?? custUserId, note: "Seed payment verified" },
      ]);
      await db.insert(payments).values({ orderId: order.id, method: "cod", amount: 53910, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const pickup = (await db.select().from(shippingMethods).where(eq(shippingMethods.code, "pickup")).limit(1))[0];
      await db.insert(shipments).values({ orderId: order.id, shippingMethodId: pickup?.id, mode: "pickup", fee: 0, notes: "Seed pickup", status: "ready" });
      const seedPromo = (await db.select().from(promotions).where(eq(promotions.name, "Seed 10% Auto")).limit(1))[0];
      if (seedPromo) {
        await db.insert(promotionUsage).values({ promotionId: seedPromo.id, customerId: custUserId, orderId: order.id, discount: 5990 });
      }
    }
  }

  // 9c. Returned/refunded ball order: completed + delivered, one line
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
          subtotal: 159800,
          discountMember: 0,
          discountPromo: 0,
          deliveryFee: 0,
          grandTotal: 159800,
          fulfillment: "delivery",
          snapshotTier: "Regular",
          promoCode: null,
        })
        .returning();
      const [oi1] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[0].id, productName: "Tour Outdoor Balls 3-Pack", sku: seedVars[0].sku,
        variantName: seedVars[0].name, originalUnitPrice: 59900, effectiveUnitPrice: 59900,
        discountAmount: 0, quantity: 1, lineTotal: 59900,
      }).returning();
      const [oi2] = await db.insert(orderItems).values({
        orderId: order2.id, variantId: seedVars[1].id, productName: "Tour Outdoor Balls 6-Pack", sku: seedVars[1].sku,
        variantName: seedVars[1].name, originalUnitPrice: 99900, effectiveUnitPrice: 99900,
        discountAmount: 0, quantity: 1, lineTotal: 99900,
      }).returning();
      await db.insert(payments).values({ orderId: order2.id, method: "gcash_manual", referenceNo: "SEED-REF-001", amount: 159800, status: "verified", verifiedBy: adminId ?? null, verifiedAt: new Date() });
      const [ret] = await db.insert(returns).values({ orderId: order2.id, reason: "Seed: one restock, one damaged", status: "approved" }).returning();
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi1.id, qty: 1, disposition: "restock" });
      await db.insert(returnItems).values({ returnId: ret.id, orderItemId: oi2.id, qty: 1, disposition: "damaged" });
      await db.insert(refunds).values({ orderId: order2.id, returnId: ret.id, amount: 59900, method: "gcash_manual", status: "completed", reason: "Seed partial refund", processedBy: adminId ?? null });
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

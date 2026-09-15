import { z } from "zod";

export const phAddressSchema = z.object({
  label: z.string().min(1).max(100),
  recipient: z.string().min(1).max(100),
  mobile: z.string().regex(/^(\+63|0)9\d{9}$/, "Invalid PH mobile number"),
  region: z.string().min(1),
  province: z.string().min(1),
  city: z.string().min(1),
  barangay: z.string().min(1),
  street: z.string().min(1),
  zip: z.string().regex(/^\d{4}$/, "ZIP must be 4 digits"),
});

export type PhAddress = z.infer<typeof phAddressSchema>;

// ---------- Order operations ----------

export const paymentMethodSchema = z.enum(["cod", "bank_transfer", "gcash_manual", "pay_at_store"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentDecisionSchema = z.enum(["approve", "reject", "mark_paid", "mark_partial"]);
export type PaymentDecision = z.infer<typeof paymentDecisionSchema>;

export const proofSubmissionSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().min(3).max(64),
  proofUrl: z.string().url().max(2048).optional(),
});
export type ProofSubmission = z.infer<typeof proofSubmissionSchema>;

export const fulfillmentUpdateSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum(["processing", "ready", "partially_fulfilled", "fulfilled", "shipped", "delivered", "returned"]),
  note: z.string().max(500).optional(),
});
export type FulfillmentUpdate = z.infer<typeof fulfillmentUpdateSchema>;

export const cancelOrderSchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const orderNoteSchema = z.object({
  orderId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

// ---------- Memberships ----------

export const tierSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  membershipFee: z.number().int().min(0).default(0), // centavos
  validityDays: z.number().int().positive().max(3650).nullable().optional(), // null = lifetime
  minSpend: z.number().int().min(0).default(0), // centavos (auto-tier track)
  discountPct: z.number().int().min(0).max(100).default(0),
  benefits: z.array(z.string().min(1).max(200)).max(20).default([]),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type TierInput = z.infer<typeof tierSchema>;

export const memberPriceSchema = z.object({
  tierId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  price: z.number().int().min(0), // centavos
}).refine((d) => (d.variantId ? !d.productId : !!d.productId), {
  message: "Exactly one of variantId / productId is required",
});
export type MemberPriceInput = z.infer<typeof memberPriceSchema>;

export const assignMembershipSchema = z.object({
  customerId: z.string().uuid(),
  tierId: z.string().uuid(),
  paymentRef: z.string().max(128).nullable().optional(),
  activate: z.boolean().default(true),
});

export const changeTierSchema = z.object({
  membershipId: z.string().uuid(),
  newTierId: z.string().uuid(),
  paymentRef: z.string().max(128).nullable().optional(),
});

export const renewMembershipSchema = z.object({
  membershipId: z.string().uuid(),
  paymentRef: z.string().max(128).nullable().optional(),
});

export const membershipStatusSchema = z.object({
  membershipId: z.string().uuid(),
  to: z.enum(["active", "suspended", "cancelled", "expired"]),
  note: z.string().max(500).optional(),
});

// ---------- Returns & refunds ----------

export const RETURN_WINDOW_DAYS = 30;

export const refundMethodSchema = z.enum(["cash", "cod", "bank_transfer", "gcash_manual", "pay_at_store"]);
export type RefundMethod = z.infer<typeof refundMethodSchema>;

export const returnRequestSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(3).max(1000),
  lines: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().positive().max(100000) })).min(1).max(100),
});
export type ReturnRequest = z.infer<typeof returnRequestSchema>;

export const approveReturnSchema = z.object({
  returnId: z.string().uuid(),
  approve: z.boolean(),
  // Per-line disposition decided at approval (never at request).
  lines: z.array(z.object({
    returnItemId: z.string().uuid(),
    disposition: z.enum(["restock", "damaged"]),
  })).default([]),
  // Refund total adjustable DOWN only (defaults to effective-price sum).
  refundAmount: z.number().int().min(0).nullable().optional(),
  method: refundMethodSchema.optional(),
});
export type ApproveReturn = z.infer<typeof approveReturnSchema>;

export const standaloneRefundSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().int().positive().max(100000000),
  method: refundMethodSchema.default("cash"),
  reason: z.string().min(3).max(1000),
});

// Checkout delivery options. `pickup` maps to fulfillment=pickup;
// local/standard map to fulfillment=delivery + a shipping_methods row.
// Fee is always confirmed by staff (₱0 due at order time).
export const shippingMethodCodeSchema = z.enum(["pickup", "local_delivery", "standard_shipping"]);
export type ShippingMethodCode = z.infer<typeof shippingMethodCodeSchema>;

export const checkoutSchema = z.object({
  fulfillment: z.enum(["pickup", "delivery"]),
  shippingMethodCode: shippingMethodCodeSchema.optional(),
  addressId: z.string().uuid().optional(),
  address: phAddressSchema.optional(),
  promoCode: z.string().max(32).optional(),
  paymentMethod: paymentMethodSchema,
  notes: z.string().max(500).optional(),
  proofUrl: z.string().url().max(2048).optional(),
  // Client-generated UUID per checkout attempt. Retries/double-clicks reuse
  // the same key so the server returns the existing order (no duplicates).
  idempotencyKey: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.fulfillment === "delivery" && !data.address && !data.addressId) {
    ctx.addIssue({ code: "custom", path: ["address"], message: "Delivery address is required for delivery orders" });
  }
});

export const variantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(64),
  priceOverride: z.number().int().min(0).nullable().optional(), // centavos
  optionValueIds: z.array(z.string().uuid()).default([]),
  isActive: z.boolean().default(true),
});

export const stockMoveSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  qty: z.number().int().positive().max(100000),
  reason: z.enum(["purchase", "sale", "adjust", "transfer", "return"]),
  note: z.string().max(500).optional(),
});

export const promotionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["code", "auto"]),
  kind: z.enum(["percent", "fixed", "bogo", "bundle", "free_shipping"]),
  value: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  minSpend: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  stackable: z.boolean().default(false),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  // Scopes: empty = applies to everything. Tier ids gate member-only promos.
  productIds: z.array(z.string().uuid()).default([]),
  variantIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
  brandIds: z.array(z.string().uuid()).default([]),
  tierIds: z.array(z.string().uuid()).default([]),
  // Rules: first-order-only flag + minimum matched quantity.
  firstOrderOnly: z.boolean().default(false),
  minQty: z.number().int().positive().nullable().optional(),
});

export const promoCodeSchema = z.object({
  promotionId: z.string().uuid(),
  code: z.string().min(3).max(32),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().default(1),
});

// ---------- Catalog ----------

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export const productStatusSchema = z.enum(["draft", "active", "inactive", "archived"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const variantStatusSchema = z.enum(["active", "inactive", "archived"]);
export type VariantStatus = z.infer<typeof variantStatusSchema>;

const imageUrlSchema = z.string().url().max(2048);

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140).optional(),
  description: z.string().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140).optional(),
  logoUrl: imageUrlSchema.nullable().optional(),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const catalogAttributeSchema = z.object({
  name: z.string().min(1).max(64),
  values: z.array(z.string().min(1).max(64)).min(1).max(50),
});

export const catalogVariantSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().max(160).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  priceOverride: z.number().int().min(0).nullable().optional(),
  comparePrice: z.number().int().min(0).nullable().optional(),
  costPrice: z.number().int().min(0).nullable().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  status: variantStatusSchema.default("active"),
  trackInventory: z.boolean().default(true),
  optionValues: z.array(z.string().min(1).max(64)).default([]),
});
export type CatalogVariantInput = z.infer<typeof catalogVariantSchema>;

export const productSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(160).optional(),
    sku: z.string().min(1).max(64).nullable().optional(),
    barcode: z.string().max(64).nullable().optional(),
    shortDescription: z.string().max(500).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    brandId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    basePrice: z.number().int().min(0),
    comparePrice: z.number().int().min(0).nullable().optional(),
    costPrice: z.number().int().min(0).nullable().optional(),
    trackInventory: z.boolean().default(true),
    lowStockThreshold: z.number().int().min(0).nullable().optional(),
    weightG: z.number().int().positive().nullable().optional(),
    lengthMm: z.number().int().positive().nullable().optional(),
    widthMm: z.number().int().positive().nullable().optional(),
    heightMm: z.number().int().positive().nullable().optional(),
    status: productStatusSchema.default("draft"),
    featured: z.boolean().default(false),
    images: z.array(imageUrlSchema).max(10).default([]),
    attributes: z.array(catalogAttributeSchema).max(10).default([]),
    variants: z.array(catalogVariantSchema).max(100).default([]),
  })
  .superRefine((data, ctx) => {
    if (
      data.comparePrice != null &&
      data.comparePrice <= data.basePrice
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["comparePrice"],
        message: "Compare-at price must exceed base price",
      });
    }
    if (data.variants.length === 0 && !data.sku) {
      ctx.addIssue({
        code: "custom",
        path: ["sku"],
        message: "SKU is required when product has no variants",
      });
    }
    const skus = data.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Variant SKUs must be unique",
      });
    }
    if (data.sku && skus.includes(data.sku)) {
      ctx.addIssue({
        code: "custom",
        path: ["sku"],
        message: "Product SKU must not duplicate a variant SKU",
      });
    }
  });
export type ProductInput = z.infer<typeof productSchema>;

export const productListParamsSchema = z.object({
  q: z.string().max(100).default(""),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  status: productStatusSchema.nullable().optional(),
  featured: z.enum(["all", "yes", "no"]).default("all"),
  sort: z
    .enum(["name", "name_desc", "price", "price_desc", "newest"])
    .default("newest"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ProductListParams = z.infer<typeof productListParamsSchema>;

// ---------- Inventory ----------

export const locationSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_-]+$/i, "Code must be alphanumeric with dashes/underscores"),
  name: z.string().min(1).max(120),
  type: z.enum(["warehouse", "store"]).default("warehouse"),
  address: z.string().max(500).nullable().optional(),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const receivingSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  qty: z.number().int().positive().max(100000),
  unitCost: z.number().int().min(0).nullable().optional(), // centavos
  supplier: z.string().max(200).nullable().optional(),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type ReceivingInput = z.infer<typeof receivingSchema>;

export const adjustmentReasonSchema = z.enum([
  "physical_count",
  "damaged",
  "lost",
  "expired",
  "data_correction",
  "other",
]);
export type AdjustmentReasonInput = z.infer<typeof adjustmentReasonSchema>;

export const adjustmentSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  direction: z.enum(["increase", "decrease"]),
  qty: z.number().int().positive().max(100000),
  reason: adjustmentReasonSchema,
  notes: z.string().max(500).nullable().optional(),
  // Controlled administrative override: bypasses the application-level
  // available-stock gate (explicit + reasoned + audit-logged). Table CHECK
  // constraints still apply — the operation fails closed if they block.
  allowNegative: z.boolean().default(false),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const transferSchema = z.object({
  variantId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  qty: z.number().int().positive().max(100000),
  notes: z.string().max(500).nullable().optional(),
}).refine((d) => d.fromLocationId !== d.toLocationId, {
  message: "Source and destination must differ",
  path: ["toLocationId"],
});
export type TransferInput = z.infer<typeof transferSchema>;

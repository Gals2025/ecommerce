import type { PhAddress } from "@/validators";

export type AppRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "INVENTORY_STAFF"
  | "ORDER_STAFF"
  | "CUSTOMER";

export type { PhAddress };

/** Money stored as integer centavos. */
export type Centavos = number;

export type OrderStatus =
  | "pending"
  | "awaiting_payment"
  | "payment_verification"
  | "confirmed"
  | "processing"
  | "ready_for_pickup"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export type OrderPaymentStatus =
  | "unpaid"
  | "pending_verification"
  | "paid"
  | "partially_paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type OrderFulfillmentStatus =
  | "unfulfilled"
  | "processing"
  | "ready"
  | "partially_fulfilled"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "returned";

export type PaymentMethod = "cod" | "bank_transfer" | "gcash_manual" | "pay_at_store";
export type PaymentStatus = "pending" | "submitted" | "verified" | "rejected";
export type FulfillmentMode = "pickup" | "delivery";
export type ShipmentStatus =
  | "pending"
  | "ready"
  | "shipped"
  | "completed"
  | "cancelled";
export type ReturnStatus = "requested" | "approved" | "rejected" | "completed";
export type RefundStatus = "pending" | "completed" | "rejected";
export type { MovementType as MovementReason } from "@/db/schema";
export type PromotionType = "code" | "auto";
export type PromotionKind = "percent" | "fixed" | "bogo" | "bundle";

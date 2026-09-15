import type { AppRole } from "./auth";

export type Permission =
  | "orders.verify_payment"
  | "orders.manage_fulfillment"
  | "orders.set_delivery_fee"
  | "orders.manage_returns"
  | "orders.manage_refunds"
  | "inventory.adjust"
  | "inventory.transfer"
  | "catalog.manage"
  | "promotions.manage"
  | "tiers.manage"
  | "memberships.manage"
  | "reports.view"
  | "users.manage_roles"
  | "settings.manage";

// Central role → permission map. Roles stay coarse; checks are granular.
const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: [
    "orders.verify_payment",
    "orders.manage_fulfillment",
    "orders.set_delivery_fee",
    "orders.manage_returns",
    "orders.manage_refunds",
    "inventory.adjust",
    "inventory.transfer",
    "catalog.manage",
    "promotions.manage",
    "tiers.manage",
    "memberships.manage",
    "reports.view",
    "users.manage_roles",
    "settings.manage",
  ],
  ADMIN: [
    "orders.verify_payment",
    "orders.manage_fulfillment",
    "orders.set_delivery_fee",
    "orders.manage_returns",
    "orders.manage_refunds",
    "inventory.adjust",
    "inventory.transfer",
    "catalog.manage",
    "promotions.manage",
    "tiers.manage",
    "memberships.manage",
    "reports.view",
  ],
  ORDER_STAFF: [
    "orders.verify_payment",
    "orders.manage_fulfillment",
    "orders.set_delivery_fee",
    "orders.manage_returns",
    "memberships.manage",
    "reports.view",
  ],
  INVENTORY_STAFF: ["inventory.adjust", "inventory.transfer", "reports.view"],
  CUSTOMER: [],
};

export function roleHasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function rolesHavePermission(roles: AppRole[], permission: Permission): boolean {
  return roles.some((r) => roleHasPermission(r, permission));
}

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
  | "users.create"
  | "users.view"
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
    "users.create",
    "users.view",
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
    "users.create",
    "users.view",
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

// Role hierarchy for user management. Higher rank may create/grant only
// strictly lower ranks — never peers or superiors (no privilege escalation).
// ORDER_STAFF and INVENTORY_STAFF share the same rank; neither can manage users.
export const ROLE_RANK: Record<AppRole, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  ORDER_STAFF: 2,
  INVENTORY_STAFF: 2,
  CUSTOMER: 1,
};

function maxRank(roles: AppRole[]): number {
  return Math.max(0, ...roles.map((r) => ROLE_RANK[r] ?? 0));
}

/** True when a creator holding `held` may create/grant `target`. */
export function canGrant(held: AppRole[], target: AppRole): boolean {
  // SUPER_ADMIN is omnipotent, including peer SUPER_ADMIN grants.
  if (held.includes("SUPER_ADMIN")) return true;
  const targetRank = ROLE_RANK[target] ?? 0;
  if (targetRank <= 0) return false;
  // CUSTOMER is implicit (no stored grant needed) — anyone who can create
  // users may mark a new account as customer.
  if (target === "CUSTOMER") return maxRank(held) >= ROLE_RANK.ADMIN;
  return maxRank(held) > targetRank;
}

/** Roles from `candidates` that `held` is allowed to grant. */
export function filterGrantable(held: AppRole[], candidates: AppRole[]): AppRole[] {
  return candidates.filter((c) => canGrant(held, c));
}

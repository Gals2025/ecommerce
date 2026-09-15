import type { Permission } from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  /** Empty = any staff role may see it. */
  permissions?: Permission[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
  /** Section-level fallback; item permissions win when present. */
  permissions?: Permission[];
};

export const ADMIN_NAV: NavSection[] = [
  { label: "Overview", items: [{ label: "Dashboard", href: "/admin" }] },
  {
    label: "Catalog",
    permissions: ["catalog.manage"],
    items: [
      { label: "Products", href: "/admin/products" },
      { label: "Categories", href: "/admin/categories" },
      { label: "Brands", href: "/admin/brands" },
    ],
  },
  {
    label: "Inventory",
    permissions: ["inventory.adjust"],
    items: [
      { label: "Inventory", href: "/admin/inventory" },
      { label: "By Location", href: "/admin/inventory/by-location" },
      { label: "Receiving", href: "/admin/inventory/receiving" },
      { label: "Adjustments", href: "/admin/inventory/adjustments" },
      { label: "Movements", href: "/admin/inventory/movements" },
      { label: "Low Stock", href: "/admin/inventory/low-stock" },
      { label: "Out of Stock", href: "/admin/inventory/out-of-stock" },
      { label: "Locations", href: "/admin/inventory/locations" },
    ],
  },
  {
    label: "Sales",
    permissions: ["orders.verify_payment"],
    items: [
      { label: "Orders", href: "/admin/orders" },
      { label: "Payments", href: "/admin/payments" },
      { label: "Returns", href: "/admin/returns" },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Memberships", href: "/admin/memberships" },
    ],
  },
  {
    label: "Marketing",
    permissions: ["promotions.manage"],
    items: [
      { label: "Promotions", href: "/admin/promotions" },
      { label: "Promo Codes", href: "/admin/promo-codes" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/admin/reports" },
      { label: "Sales", href: "/admin/reports/sales" },
      { label: "Inventory", href: "/admin/reports/inventory" },
      { label: "Customers", href: "/admin/reports/customers" },
      { label: "Membership", href: "/admin/reports/membership" },
      { label: "Promotions", href: "/admin/reports/promotions" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", permissions: ["users.manage_roles"] },
      { label: "Settings", href: "/admin/settings", permissions: ["settings.manage"] },
      { label: "Audit Logs", href: "/admin/audit-logs" },
    ],
  },
];

const ROUTE_LABELS: Record<string, string> = {};
for (const s of ADMIN_NAV) for (const i of s.items) ROUTE_LABELS[i.href] = i.label;
ROUTE_LABELS["/admin"] = "Dashboard";

export function routeLabel(href: string): string {
  return ROUTE_LABELS[href] ?? href.split("/").pop() ?? href;
}

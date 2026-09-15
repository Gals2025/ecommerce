import { relations } from "drizzle-orm";
import {
  users,
  roles,
  userRoles,
  sessions,
  accounts,
} from "./auth";
import {
  products,
  productImages,
  productVariants,
  productAttributes,
  brands,
  categories,
} from "./catalog";
import { inventoryBalances, inventoryMovements, inventoryLocations } from "./inventory";
import { customers, customerAddresses, customerMemberships, membershipTiers, memberships } from "./customers";
import { promotions, promotionRules, promotionCodes, promotionUsage } from "./promos";
import {
  carts,
  cartItems,
  orders,
  orderItems,
  payments,
  shipments,
  refunds,
  orderStatusHistory,
  orderNotes,
  orderPromotions,
} from "./commerce";

export const usersRelations = relations(users, ({ many, one }) => ({
  roles: many(userRoles),
  sessions: many(sessions),
  accounts: many(accounts),
  customer: one(customers, { fields: [users.id], references: [customers.userId] }),
  orders: many(orders),
  carts: many(carts),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  addresses: many(customerAddresses),
  memberships: many(customerMemberships),
  paidMemberships: many(memberships),
}));

export const customerMembershipsRelations = relations(customerMemberships, ({ one }) => ({
  customer: one(customers, { fields: [customerMemberships.customerId], references: [customers.id] }),
  tier: one(membershipTiers, { fields: [customerMemberships.tierId], references: [membershipTiers.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
  attributes: many(productAttributes),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  balances: many(inventoryBalances),
  movements: many(inventoryMovements),
}));

export const inventoryBalancesRelations = relations(inventoryBalances, ({ one }) => ({
  variant: one(productVariants, { fields: [inventoryBalances.variantId], references: [productVariants.id] }),
  location: one(inventoryLocations, { fields: [inventoryBalances.locationId], references: [inventoryLocations.id] }),
}));

export const promotionsRelations = relations(promotions, ({ many }) => ({
  rules: many(promotionRules),
  codes: many(promotionCodes),
  usages: many(promotionUsage),
}));

export const cartsRelations = relations(carts, ({ many }) => ({
  items: many(cartItems),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  payments: many(payments),
  shipments: many(shipments),
  history: many(orderStatusHistory),
  notes: many(orderNotes),
  promotions: many(orderPromotions),
  refunds: many(refunds),
}));

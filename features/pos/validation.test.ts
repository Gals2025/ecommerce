import test from "node:test";
import assert from "node:assert/strict";
import { posSaleSchema, saleTotal } from "./validation";
import { rolesHavePermission } from "../../lib/permissions";

const valid = () => ({ key: "00000000-0000-4000-8000-000000000001", locationId: "00000000-0000-4000-8000-000000000002", method: "pay_at_store", tendered: 10000, expectedTotal: 10000, items: [{ variantId: "00000000-0000-4000-8000-000000000003", qty: 2 }] });

test("cash sales accept walk-in customers without requiring storefront checkout data", () => {
  const result = posSaleSchema.parse(valid());
  assert.equal(result.customerName, "");
  assert.equal(result.reference, "");
});
test("rejects empty baskets, duplicate variants, fractional/negative quantities and invalid stock locations", () => {
  const data = valid();
  for (const invalid of [{ ...data, items: [] }, { ...data, items: [...data.items, ...data.items] }, { ...data, items: [{ ...data.items[0], qty: 1.5 }] }, { ...data, items: [{ ...data.items[0], qty: -1 }] }, { ...data, locationId: "not-a-uuid" }]) assert.equal(posSaleSchema.safeParse(invalid).success, false);
});
test("GCash and bank sales require a nonblank payment reference; COD is not a POS payment", () => {
  for (const method of ["gcash_manual", "bank_transfer"]) {
    assert.equal(posSaleSchema.safeParse({ ...valid(), method, reference: "  " }).success, false);
    assert.equal(posSaleSchema.safeParse({ ...valid(), method, reference: "REF-123" }).success, true);
  }
  assert.equal(posSaleSchema.safeParse({ ...valid(), method: "cod" }).success, false);
});
test("calculates exact centavo totals and rejects overflow or invalid line values", () => {
  assert.equal(saleTotal([{ price: 10099, qty: 3 }, { price: 1, qty: 1 }]), 30298);
  assert.equal(saleTotal([{ price: 0, qty: 1 }]), 0);
  for (const line of [{ price: 2147483647, qty: 2 }, { price: -1, qty: 1 }, { price: 1, qty: 0 }, { price: 0.1, qty: 1 }]) assert.throws(() => saleTotal([line]));
});
test("POS access is limited to admins and super admins", () => {
  assert.equal(rolesHavePermission(["ADMIN"], "orders.pos"), true);
  assert.equal(rolesHavePermission(["SUPER_ADMIN"], "orders.pos"), true);
  for (const role of ["CUSTOMER", "ORDER_STAFF", "INVENTORY_STAFF"] as const) assert.equal(rolesHavePermission([role], "orders.pos"), false);
});

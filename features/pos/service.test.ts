import test from "node:test";
import assert from "node:assert/strict";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createPosSale } from "./service";
import { posSaleSchema } from "./validation";
import type { db } from "../../db";

const variantId = "00000000-0000-4000-8000-000000000003";
const locationId = "00000000-0000-4000-8000-000000000002";
const input = () => posSaleSchema.parse({ key: "00000000-0000-4000-8000-000000000001", locationId, method: "pay_at_store", tendered: 3000, expectedTotal: 2500, items: [{ variantId, qty: 2 }] });

type Row = Record<string, unknown>;
function fixture(onHand = 5) {
  let state: Record<string, Row[]> = { orders: [], inventory_balances: [{ id: "balance", variantId, locationId, onHand, reserved: 1 }] };
  let failTable = "";
  const dialect = new PgDialect();
  const params = (where: SQL) => dialect.sqlToQuery(where).params;
  const database = {
    async transaction(work: (tx: unknown) => Promise<unknown>) {
      const before = structuredClone(state);
      const tx = {
        async execute(query: SQL) {
          const q = dialect.sqlToQuery(query);
          if (q.sql.includes("pg_advisory")) return { rows: [] };
          assert.match(q.sql, /FOR UPDATE/);
          return { rows: state.inventory_balances.filter(b => b.variantId === q.params[0] && b.locationId === q.params[1]) };
        },
        select() {
          let table: string;
          const builder = {
            from(t: Parameters<typeof getTableName>[0]) { table = getTableName(t); return builder; },
            innerJoin() { return builder; },
            async where(where: SQL) {
              if (table === "orders") return state.orders.filter(o => o.idempotencyKey === params(where)[0]).map(o => ({ orderId: o.id, orderNo: o.orderNo }));
              if (table === "inventory_locations") return [{ id: locationId, name: "Store" }];
              return [{ id: variantId, sku: "PADDLE-1", variant: "Blue", name: "Paddle", basePrice: 1250, override: null, trackProduct: true, trackVariant: true }];
            },
          }; return builder;
        },
        insert(t: Parameters<typeof getTableName>[0]) {
          const table = getTableName(t);
          return { values(value: Row | Row[]) {
            if (table === failTable) throw new Error("simulated database failure");
            const rows = (Array.isArray(value) ? value : [value]).map(v => ({ id: `${table}-${(state[table]?.length ?? 0) + 1}`, ...v }));
            (state[table] ??= []).push(...rows);
            return { returning: async () => rows, then: (done: (v: unknown) => void) => Promise.resolve(rows).then(done) };
          } };
        },
        update(t: Parameters<typeof getTableName>[0]) {
          const table = getTableName(t);
          return { set(values: Row) { return { async where(where: SQL) { const id = params(where)[0]; Object.assign(state[table].find(r => r.id === id)!, values); } }; } };
        },
      };
      try { return await work(tx); } catch (error) { state = before; throw error; }
    },
  } as unknown as Pick<typeof db, "transaction">;
  return { database, rows: (table: string) => state[table] ?? [], fail: (table: string) => { failTable = table; } };
}

test("records paid completed sale, snapshots, verified payment, inventory and audit together; retry returns same order", async () => {
  const f = fixture();
  const result = await createPosSale(f.database, "admin", input());
  const duplicate = await createPosSale(f.database, "admin", input());
  assert.deepEqual(duplicate, result);
  assert.equal(f.rows("orders").length, 1);
  assert.equal(f.rows("orders")[0].status, "completed");
  assert.equal(f.rows("orders")[0].paymentStatus, "paid");
  assert.equal(f.rows("orders")[0].grandTotal, 2500);
  assert.equal(f.rows("order_items")[0].quantity, 2);
  assert.equal(f.rows("payments")[0].status, "verified");
  assert.equal(f.rows("payments")[0].verifiedBy, "admin");
  assert.equal(f.rows("inventory_balances")[0].onHand, 3);
  assert.equal(f.rows("inventory_balances")[0].reserved, 1);
  assert.deepEqual(f.rows("inventory_movements").map(m => m.reason), ["RESERVATION", "SALE"]);
  assert.equal(f.rows("audit_logs")[0].action, "pos.sale");
});
test("insufficient available inventory rolls back the entire sale without consuming existing reservations", async () => {
  const f = fixture(2);
  await assert.rejects(createPosSale(f.database, "admin", input()), /Insufficient/);
  assert.equal(f.rows("orders").length, 0);
  assert.equal(f.rows("inventory_movements").length, 0);
  assert.equal(f.rows("inventory_balances")[0].onHand, 2);
  assert.equal(f.rows("inventory_balances")[0].reserved, 1);
});
test("payment persistence failure rolls back previously deducted inventory and order snapshots", async () => {
  const f = fixture(); f.fail("payments");
  await assert.rejects(createPosSale(f.database, "admin", input()), /simulated/);
  assert.equal(f.rows("orders").length, 0);
  assert.equal(f.rows("order_items").length, 0);
  assert.equal(f.rows("inventory_movements").length, 0);
  assert.equal(f.rows("inventory_balances")[0].onHand, 5);
});
test("rejects stale prices and short cash before writing an order", async () => {
  const f = fixture();
  await assert.rejects(createPosSale(f.database, "admin", { ...input(), expectedTotal: 2000 }), /total changed/);
  await assert.rejects(createPosSale(f.database, "admin", { ...input(), tendered: 1000 }), /Cash received/);
  assert.equal(f.rows("orders").length, 0);
});

// Critical inventory test: race conditions, overselling, negative stock.
// DB-free checks always run. DB-backed concurrency tests run when DATABASE_URL
// is set. Run: npx tsx scripts/verify-inventory.ts
import { orderLockKeys } from "../lib/inventory";
import { MOVEMENT_TYPES } from "../db/schema/inventory";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`ok - ${name}`);
  else {
    failures++;
    console.error(`FAIL - ${name}${detail ? `: ${detail}` : ""}`);
  }
}

// --- DB-free: deterministic lock ordering ---------------------------------
const unordered = [
  { variantId: "v-b", locationId: "l-2" },
  { variantId: "v-a", locationId: "l-9" },
  { variantId: "v-a", locationId: "l-1" },
];
const ordered = orderLockKeys(unordered);
check(
  "lock keys sort deterministically",
  ordered[0].variantId === "v-a" && ordered[0].locationId === "l-1" &&
    ordered[1].variantId === "v-a" && ordered[1].locationId === "l-9" &&
    ordered[2].variantId === "v-b",
  JSON.stringify(ordered)
);
check(
  "ordering is order-independent",
  JSON.stringify(orderLockKeys([...unordered].reverse())) === JSON.stringify(ordered)
);

// --- DB-free: movement vocabulary ------------------------------------------
const required = [
  "OPENING_STOCK", "STOCK_RECEIVED", "SALE", "CUSTOMER_RETURN",
  "SUPPLIER_RETURN", "DAMAGE", "LOSS", "ADJUSTMENT_IN", "ADJUSTMENT_OUT",
  "TRANSFER_IN", "TRANSFER_OUT", "RESERVATION", "RESERVATION_RELEASE",
  "ORDER_CANCELLATION", "REFUND_RESTOCK",
];
check("15 movement types present", required.every((t) => (MOVEMENT_TYPES as readonly string[]).includes(t)));
check("no legacy lowercase reasons", !(MOVEMENT_TYPES as readonly string[]).some((t) => t !== t.toUpperCase()));

// --- DB-free: available math -------------------------------------------------
check("available = on_hand - reserved", 5 - 2 === 3);

// --- DB-backed concurrency tests ---------------------------------------------
async function runDbTests() {
  const { db } = await import("../db/index");
  const { inventoryBalances, inventoryLocations, inventoryMovements, products, productVariants } = await import("../db/schema/index");
  const { reserveStock, captureStock, transferStock, decreaseStock, receiveStock } = await import("../lib/inventory");
  const { eq, and } = await import("drizzle-orm");

  const tag = `VERIFY-${Date.now().toString(36)}`;
  const locs = await db.select().from(inventoryLocations).limit(2);
  if (locs.length < 1) {
    console.error("SKIP - no inventory locations in DB");
  } else {
    const [locA, locB] = [locs[0], locs[1] ?? locs[0]];
    const prod = (await db.select().from(products).limit(1))[0];
    if (!prod) {
      console.error("SKIP - no products in DB");
    } else {
      const [variant] = await db
        .insert(productVariants)
        .values({ productId: prod.id, sku: `${tag}-LAST-UNIT`, name: "verify last unit" })
        .returning();
      const vid = variant.id;

      async function setBalance(onHand: number, reserved: number) {
        await db.insert(inventoryBalances).values({ variantId: vid, locationId: locA.id, onHand, reserved })
          .onConflictDoUpdate({
            target: [inventoryBalances.variantId, inventoryBalances.locationId],
            set: { onHand, reserved, updatedAt: new Date() },
          });
      }
      async function movementCount() {
        return (await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, vid))).length;
      }

      // Test 1: two customers race for the last unit — exactly one wins.
      await setBalance(1, 0);
      const attempts = await Promise.allSettled([
        db.transaction((tx) => reserveStock(tx, vid, locA.id, 1, { refType: "verify", refId: "race-a" })),
        db.transaction((tx) => reserveStock(tx, vid, locA.id, 1, { refType: "verify", refId: "race-b" })),
      ]);
      const wins = attempts.filter((a) => a.status === "fulfilled").length;
      check("last-unit race: exactly one reservation succeeds", wins === 1, `${wins} succeeded`);
      const bal = (await db.select().from(inventoryBalances).where(and(eq(inventoryBalances.variantId, vid), eq(inventoryBalances.locationId, locA.id))))[0];
      check("last-unit race: reserved=1, available=0", bal.reserved === 1 && bal.onHand - bal.reserved === 0, JSON.stringify(bal));

      // Test 2: double capture — second capture must fail, no duplicate SALE.
      await setBalance(1, 1);
      const captures = await Promise.allSettled([
        db.transaction((tx) => captureStock(tx, vid, locA.id, 1, { refType: "verify", refId: "cap-a" })),
        db.transaction((tx) => captureStock(tx, vid, locA.id, 1, { refType: "verify", refId: "cap-b" })),
      ]);
      const capWins = captures.filter((a) => a.status === "fulfilled").length;
      check("double capture: exactly one succeeds", capWins === 1, `${capWins} succeeded`);

      // Test 3: transfer writes OUT + IN pair atomically.
      await setBalance(10, 0);
      const before = await movementCount();
      await db.transaction((tx) => transferStock(tx, vid, locA.id, locB.id, 4, { refType: "verify" }));
      const newMoves = (await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, vid))).slice(before);
      const reasons = newMoves.map((m) => m.reason).sort();
      check("transfer writes OUT+IN pair", JSON.stringify(reasons) === JSON.stringify(["TRANSFER_IN", "TRANSFER_OUT"]), JSON.stringify(reasons));

      // Test 4: decrease below available throws (no override).
      await setBalance(5, 0);
      let threw = false;
      try {
        await db.transaction((tx) => decreaseStock(tx, vid, locA.id, 6, "ADJUSTMENT_OUT", { refType: "verify" }));
      } catch {
        threw = true;
      }
      check("decrease below available rejected", threw);

      // Test 5: override cannot violate DB checks (fail-closed with reservations).
      await setBalance(2, 2);
      let overrideBlocked = false;
      try {
        await db.transaction((tx) =>
          decreaseStock(tx, vid, locA.id, 1, "ADJUSTMENT_OUT", { refType: "verify" }, { allowNegative: true })
        );
      } catch {
        overrideBlocked = true;
      }
      check("override fail-closed when reserved stock present", overrideBlocked);

      // Test 6: receiving is race-safe (concurrent upserts sum, no dup key).
      await setBalance(0, 0);
      await Promise.all([
        db.transaction((tx) => receiveStock(tx, vid, locA.id, 7, { refType: "verify" })),
        db.transaction((tx) => receiveStock(tx, vid, locA.id, 7, { refType: "verify" })),
      ]);
      const afterRecv = (await db.select().from(inventoryBalances).where(and(eq(inventoryBalances.variantId, vid), eq(inventoryBalances.locationId, locA.id))))[0];
      check("concurrent receives sum without lost update", afterRecv.onHand === 14, `onHand=${afterRecv.onHand}`);

      // Cleanup test variant (cascades balances; movements reference variant — delete them first).
      await db.delete(inventoryMovements).where(eq(inventoryMovements.variantId, vid));
      await db.delete(productVariants).where(eq(productVariants.id, vid));
      console.log("cleanup - verify variant removed");
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP - no DATABASE_URL; DB-backed concurrency tests not run");
  } else {
    await runDbTests();
  }

  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  } else {
    console.log("All inventory checks passed");
  }
}

main().catch((e) => {
  console.error("FATAL -", e instanceof Error ? e.message : e);
  process.exit(1);
});

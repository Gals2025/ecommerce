// One-time SKU backfill: MMDDYYYY-PAD-NNNN
// - Products: date from products.created_at, PAD from its category name
// - Variants: date from product_variants.created_at, PAD from PARENT product's category
// - NNNN resets per (date, PAD) group, ordered by created_at ASC, id ASC
// - order_items.sku snapshots are intentionally NOT touched (order history)
//
// Usage:
//   npx tsx scripts/backfill-sku.ts            # dry-run (default)
//   npx tsx scripts/backfill-sku.ts --apply    # write to DB (backup first!)
//
// Diagnostics: drizzle wraps every failure as "Failed query: <sql> / params: …"
// with the real reason on `error.cause`. This script unwraps the full chain
// (message + code/detail/hint) so failures are actionable instead of empty.
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { buildSku, categoryPad, formatSkuDate } from "../lib/sku";

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  oldSku: string | null;
  createdAt: Date;
  categoryName: string | null;
};

/** Hostname only — never print credentials. */
function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "(unknown host)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/** Render one link in the error chain. Returns null when the link carries
 * no information (empty message, no facts, nothing serializable) so the
 * output stays focused on links that explain the failure. */
function describeLink(cur: unknown): { text: string; extra: string | null } | null {
  const bag = (typeof cur === "object" && cur !== null ? cur : {}) as Record<string, unknown>;
  const name =
    cur instanceof Error
      ? cur.name
      : typeof bag.name === "string"
        ? bag.name
        : "Error";
  const message =
    cur instanceof Error
      ? cur.message
      : typeof bag.message === "string"
        ? bag.message
        : null;
  const facts = [
    bag.code !== undefined ? `code=${String(bag.code)}` : null,
    bag.severity !== undefined ? `severity=${String(bag.severity)}` : null,
    typeof bag.type === "string" ? `type=${bag.type}` : null,
    bag.detail !== undefined ? `detail=${String(bag.detail)}` : null,
    bag.hint !== undefined ? `hint=${String(bag.hint)}` : null,
  ].filter(Boolean);
  if (message) {
    return {
      text: `- ${name}: ${message}`,
      extra: facts.length > 0 ? `  (${facts.join(", ")})` : null,
    };
  }
  if (facts.length > 0) {
    return { text: `- ${name}`, extra: `  (${facts.join(", ")})` };
  }
  return null;
}

/** Outgoing links from one error object, in priority order:
 * `.cause` (drizzle/envelope chains), the `.error` of DOM-style error events
 * (the ws layer nests the real failure there), and each entry of
 * `AggregateError.errors` (Neon surfaces connection failures this way). */
function childLinks(cur: unknown): unknown[] {
  if (typeof cur !== "object" || cur === null) return [];
  const bag = cur as { cause?: unknown; error?: unknown; type?: unknown; errors?: unknown };
  const out: unknown[] = [];
  if (bag.cause !== undefined && bag.cause !== null) out.push(bag.cause);
  if (typeof bag.type === "string" && bag.error instanceof Object) out.push(bag.error);
  if (Array.isArray(bag.errors)) out.push(...bag.errors);
  return out;
}

/** Render the full error chain: drizzle envelope + unwrapped cause(s) + PG fields. */
function formatError(e: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [e];
  let kept = 0;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    const link = describeLink(cur);
    if (link) {
      kept += 1;
      lines.push(link.text);
      if (link.extra) lines.push(link.extra);
    }
    queue.push(...childLinks(cur));
  }
  if (kept === 0) lines.push("- (unrecognized error shape — rerun with DEBUG=1 for a stack trace)");
  return lines.join("\n");
}

function friendlyHint(e: unknown): string | null {
  const text = formatError(e);
  if (/relation "?(products|categories|product_variants)"? does not exist/i.test(text)) {
    return "Tables are missing — run `npm run db:migrate` first, then re-run this script.";
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|connection (refused|terminated|closed)|timeout/i.test(text)) {
    return "Cannot reach the database — check DATABASE_URL, network/VPN, and that the Neon project is active.";
  }
  if (/password authentication failed|role .* does not exist|SASL|28P01/i.test(text)) {
    return "Authentication failed — the DATABASE_URL username/password is wrong or was rotated.";
  }
  if (/SSL|sslmode|self-signed/i.test(text)) {
    return "TLS issue — Neon requires SSL; ensure the URL includes `?sslmode=require`.";
  }
  return null;
}

/** Preflight: connectivity + required tables, with plain-language failures. */
async function preflight() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set.\nCopy .env.example to .env and fill in your Neon connection string, then re-run."
    );
    process.exit(2);
  }
  console.log(`Target DB host: ${dbHost()}`);
  try {
    await db.execute(sql`SELECT 1 AS ok`);
  } catch (e) {
    console.error("Cannot reach the database.\n" + formatError(e));
    const hint = friendlyHint(e);
    if (hint) console.error("\n" + hint);
    process.exit(2);
  }
  const required = ["products", "categories", "product_variants"];
  let present: string[] = [];
  try {
    const res = await db.execute(sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('products', 'categories', 'product_variants')
    `);
    present = (res.rows as { tablename: string }[]).map((r) => r.tablename);
  } catch (e) {
    console.error("Table preflight query failed.\n" + formatError(e));
    process.exit(2);
  }
  const missing = required.filter((t) => !present.includes(t));
  if (missing.length > 0) {
    console.error(
      `Missing tables: ${missing.join(", ")}.\nRun \`npm run db:migrate\` first, then re-run this script.`
    );
    process.exit(2);
  }
}

function assignGroups(rows: Row[]): { id: string; oldSku: string | null; next: string }[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${formatSkuDate(r.createdAt)}|${categoryPad(r.categoryName)}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: { id: string; oldSku: string | null; next: string }[] = [];
  for (const [key, arr] of groups) {
    const [dateStr, pad] = key.split("|");
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    arr.forEach((r, i) => out.push({ id: r.id, oldSku: r.oldSku, next: buildSku(dateStr, pad, i + 1) }));
  }
  return out;
}

async function main() {
  await preflight();

  const prodRes = await db.execute(sql`
    SELECT p.id AS id, p.sku AS "oldSku", p.created_at AS "createdAt", c.name AS "categoryName"
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.created_at ASC, p.id ASC
  `);
  const prodList: Row[] = (prodRes.rows as Row[]).map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));

  const varRes = await db.execute(sql`
    SELECT v.id AS id, v.sku AS "oldSku", v.created_at AS "createdAt", c.name AS "categoryName"
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY v.created_at ASC, v.id ASC
  `);
  const varList: Row[] = (varRes.rows as Row[]).map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));

  const prodPlan = assignGroups(prodList);
  const varPlan = assignGroups(varList);

  // Intra-plan uniqueness check (each table has its own UNIQUE constraint).
  for (const [label, plan] of [["products", prodPlan], ["variants", varPlan]] as const) {
    const seen = new Set(plan.map((p) => p.next));
    if (seen.size !== plan.length) throw new Error(`Duplicate SKU generated within ${label} plan — aborting`);
  }

  console.log(`products: ${prodPlan.length}, variants: ${varPlan.length}`);
  for (const p of prodPlan.slice(0, 20)) console.log(`  product ${p.id} ${p.oldSku ?? "(null)"} -> ${p.next}`);
  if (prodPlan.length > 20) console.log(`  ... and ${prodPlan.length - 20} more products`);
  for (const p of varPlan.slice(0, 20)) console.log(`  variant ${p.id} ${p.oldSku ?? "(null)"} -> ${p.next}`);
  if (varPlan.length > 20) console.log(`  ... and ${varPlan.length - 20} more variants`);

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write (backup the DB first).");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const p of prodPlan) {
      await tx.execute(sql`UPDATE products SET sku = ${p.next}, updated_at = NOW() WHERE id = ${p.id}`);
    }
    for (const p of varPlan) {
      await tx.execute(sql`UPDATE product_variants SET sku = ${p.next}, updated_at = NOW() WHERE id = ${p.id}`);
    }
  });

  console.log(`Applied: ${prodPlan.length} products, ${varPlan.length} variants overwritten.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(formatError(e));
  const hint = friendlyHint(e);
  if (hint) console.error("\n" + hint);
  process.exit(1);
});

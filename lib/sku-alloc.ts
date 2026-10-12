// Server-only SKU allocation: next MMDDYYYY-PAD-NNNN sequence per table.
// lib/sku.ts stays pure (imported by validators → client bundle); DB access lives here.
import { sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { buildSku, categoryPad, formatSkuDate, isSkuFormatted, parseSkuSeq } from "./sku";

async function maxSeqForPrefix(client: DbClient, table: "products" | "product_variants", prefix: string): Promise<number> {
  const like = `${prefix}%`;
  const res =
    table === "products"
      ? await client.execute(sql`SELECT sku FROM products WHERE sku LIKE ${like}`)
      : await client.execute(sql`SELECT sku FROM product_variants WHERE sku LIKE ${like}`);
  let max = 0;
  for (const r of res.rows as { sku: string }[]) {
    const n = parseSkuSeq(String(r.sku));
    if (n !== null && n > max) max = n;
  }
  return max;
}

/** Next free SKU in a table for (date, pad). Reads current max suffix + 1. */
export async function nextSku(
  client: DbClient,
  table: "products" | "product_variants",
  dateStr: string,
  pad: string
): Promise<string> {
  const max = await maxSeqForPrefix(client, table, `${dateStr}-${pad}-`);
  return buildSku(dateStr, pad, max + 1);
}

/** Allocate a SKU, skipping any in `taken` (e.g. the sibling product SKU). */
export async function allocateSku(
  client: DbClient,
  table: "products" | "product_variants",
  dateStr: string,
  pad: string,
  taken: Set<string> = new Set()
): Promise<string> {
  let seq = (await maxSeqForPrefix(client, table, `${dateStr}-${pad}-`)) + 1;
  let candidate = buildSku(dateStr, pad, seq);
  while (taken.has(candidate)) {
    seq += 1;
    candidate = buildSku(dateStr, pad, seq);
  }
  return candidate;
}

/** Resolve the PAD for a category id (GEN fallback when missing). */
export async function padForCategory(client: DbClient, categoryId: string | null | undefined): Promise<string> {
  if (!categoryId) return "GEN";
  const res = await client.execute(sql`SELECT name FROM categories WHERE id = ${categoryId} LIMIT 1`);
  const row = (res.rows as { name: string }[])[0];
  return categoryPad(row?.name ?? null);
}

/**
 * Fill blank/legacy variant SKUs, keeping existing conforming SKUs untouched.
 * `taken` pre-seeds reserved values (e.g. the product SKU).
 */
export async function fillVariantSkus<V extends { sku: string }>(
  client: DbClient,
  categoryId: string | null | undefined,
  variants: V[],
  taken: Set<string> = new Set(),
  date: Date = new Date()
): Promise<V[]> {
  const dateStr = formatSkuDate(date);
  const pad = await padForCategory(client, categoryId);
  const out: V[] = [];
  for (const v of variants) {
    if (isSkuFormatted(v.sku) && !taken.has(v.sku)) {
      taken.add(v.sku);
      out.push(v);
    } else {
      const sku = await allocateSku(client, "product_variants", dateStr, pad, taken);
      taken.add(sku);
      out.push({ ...v, sku });
    }
  }
  return out;
}

/**
 * Fill blank/legacy SKUs in a parsed product input, returning a patched copy.
 * - Product SKU: filled when missing or not in the new format.
 * - Variant SKUs: filled when blank or not in the new format; kept unique
 *   against the product SKU and each other.
 * Existing conforming SKUs are never modified (edits don't churn SKUs).
 */
export async function fillMissingSkus<T extends { sku?: string | null; variants: { sku: string }[] }>(
  client: DbClient,
  categoryId: string | null | undefined,
  data: T,
  date: Date = new Date()
): Promise<T> {
  const dateStr = formatSkuDate(date);
  const pad = await padForCategory(client, categoryId);
  const taken = new Set<string>();
  let productSku = data.sku ?? null;
  if (!isSkuFormatted(productSku)) {
    productSku = await allocateSku(client, "products", dateStr, pad, taken);
  }
  if (productSku) taken.add(productSku);
  const variants = (await fillVariantSkus(client, categoryId, data.variants, taken, date)) as T["variants"];
  return { ...data, sku: productSku, variants };
}

/** True when the error looks like a Postgres unique-violation (SKU race) — safe to retry. */
export function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /unique|duplicate|23505/i.test(msg);
}

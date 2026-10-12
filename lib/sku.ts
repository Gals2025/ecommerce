// SKU format: MMDDYYYY-PAD-NNNN
// - MMDDYYYY: Asia/Manila date the inventory item was added (created_at, or today for new items)
// - PAD: first 3 A-Z letters of the category name, uppercased (fallback GEN)
// - NNNN: zero-padded sequence, resets per (date, PAD) group
export const SKU_REGEX = /^\d{8}-[A-Z]{3}-\d{4,}$/;
export const SKU_FALLBACK_PAD = "GEN";
export const SKU_TIMEZONE = "Asia/Manila";

export function isSkuFormatted(sku: string | null | undefined): boolean {
  if (!sku) return false;
  return SKU_REGEX.test(sku.trim());
}

export function categoryPad(categoryName: string | null | undefined): string {
  const letters = (categoryName ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const pad = letters.slice(0, 3);
  return pad.length === 3 ? pad : SKU_FALLBACK_PAD;
}

/** Format a Date as MMDDYYYY in Asia/Manila (UTC+8, no DST). */
export function formatSkuDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SKU_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}${get("day")}${get("year")}`;
}

export function buildSku(dateStr: string, pad: string, seq: number): string {
  const seqStr = seq <= 9999 ? String(seq).padStart(4, "0") : String(seq);
  return `${dateStr}-${pad}-${seqStr}`;
}

/** Parse the trailing sequence number from a SKU in our format. Returns null when not parseable. */
export function parseSkuSeq(sku: string): number | null {
  const m = sku.trim().match(/-(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** Next sequence for a prefix group given existing SKUs sharing that prefix. */
export function nextSeqForPrefix(existingSkus: string[]): number {
  let max = 0;
  for (const sku of existingSkus) {
    const n = parseSkuSeq(sku);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

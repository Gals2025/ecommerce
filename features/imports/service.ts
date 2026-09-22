import ExcelJS from "exceljs";
import { db } from "@/db";
import { brands, categories } from "@/db/schema";
import {
  canonicalizeProductOptions,
  productSchema,
  productStatusSchema,
  type ProductInput,
} from "@/validators";
import { pesosToCentavos } from "@/lib/money";

export const IMPORT_ROW_LIMIT = 1000;

export type ImportMode = "new" | "update";

export type RawRow = { index: number; values: Record<string, string> };

// Canonical column keys after header normalization.
const ALIASES: Record<string, string> = {
  product: "product",
  productname: "product",
  name: "product",
  slug: "slug",
  productsku: "productSku",
  product_sku: "productSku",
  variantsku: "variantSku",
  variant_sku: "variantSku",
  sku: "variantSku",
  variant: "variantName",
  variantname: "variantName",
  barcode: "barcode",
  brand: "brand",
  category: "category",
  baseprice: "basePrice",
  base_price: "basePrice",
  price: "basePrice",
  variantprice: "variantPrice",
  variant_price: "variantPrice",
  priceoverride: "variantPrice",
  cost: "cost",
  costprice: "cost",
  unitcost: "cost",
  status: "status",
  featured: "featured",
  stock: "stock",
  onhand: "stock",
  quantity: "stock",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[₱₴$()\-\s_]+/g, "");
}

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): { headers: string[]; records: string[][] } {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");
  // Rejoin lines inside quoted fields.
  const logical: string[] = [];
  let buf = "";
  let open = false;
  for (const line of lines) {
    buf = buf ? `${buf}\n${line}` : line;
    const quotes = (buf.match(/"/g) ?? []).length;
    // Odd quote count (accounting escapes roughly) → continuation.
    const unescaped = buf.replace(/""/g, "").split("").filter((c) => c === '"').length;
    open = unescaped % 2 === 1;
    void quotes;
    if (!open) {
      logical.push(buf);
      buf = "";
    }
  }
  if (buf) logical.push(buf);
  const nonEmpty = logical.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) return { headers: [], records: [] };
  return { headers: splitCSVLine(nonEmpty[0]), records: nonEmpty.slice(1).map(splitCSVLine) };
}

async function parseXLSX(buffer: Buffer): Promise<{ headers: string[]; records: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], records: [] };
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cell.text?.trim() ?? "");
    });
    rows.push(cells);
  });
  if (rows.length === 0) return { headers: [], records: [] };
  return { headers: rows[0], records: rows.slice(1) };
}

export async function parseImportFile(buffer: Buffer, filename: string): Promise<RawRow[]> {
  const lower = filename.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) throw new Error("Unsupported file — upload a .csv or .xlsx file");
  if (buffer.length === 0) throw new Error("Empty file");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("File too large (max 5MB)");

  const { headers, records } = isXlsx ? await parseXLSX(buffer) : parseCSV(buffer.toString("utf-8"));
  const mapped = headers.map((h) => ALIASES[normalizeHeader(h)] ?? "");
  if (!mapped.includes("product")) {
    throw new Error("Missing required column: Product (product name)");
  }
  const rows: RawRow[] = [];
  for (const [i, rec] of records.slice(0, IMPORT_ROW_LIMIT + 1).entries()) {
    if (rec.every((c) => (c ?? "").trim() === "")) continue;
    const values: Record<string, string> = {};
    mapped.forEach((key, ci) => {
      if (key) values[key] = (rec[ci] ?? "").trim();
    });
    rows.push({ index: i + 2, values }); // 1-based + header row
  }
  if (rows.length === 0) throw new Error("No data rows found");
  if (rows.length > IMPORT_ROW_LIMIT) throw new Error(`Too many rows (max ${IMPORT_ROW_LIMIT})`);
  return rows;
}

// ---------- value parsers ----------

export function parseMoney(s: string): number | null | "invalid" {
  const t = s.trim().replace(/[₱₴$,\s'"]/g, "");
  if (t === "" || t === "—" || t === "-") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return pesosToCentavos(n);
}

export function parseStock(s: string): number | null | "invalid" {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export function parseFeatured(s: string): boolean | null | "invalid" {
  const t = s.trim().toLowerCase();
  if (t === "") return null;
  if (["yes", "y", "true", "1", "featured"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return "invalid";
}

const STATUSES = productStatusSchema.options as readonly string[];

export function parseStatus(s: string): string | null | "invalid" {
  const t = s.trim().toLowerCase();
  if (t === "") return null;
  return (STATUSES as readonly string[]).includes(t) ? t : "invalid";
}

// ---------- grouping ----------

export type ImportGroup = {
  key: string;
  rowIndexes: number[];
  product: string;
  rows: Record<string, string>[];
};

export function groupRows(rows: RawRow[]): ImportGroup[] {
  const map = new Map<string, ImportGroup>();
  for (const r of rows) {
    const v = r.values;
    const key = (v.productSku || v.product).toLowerCase();
    const g =
      map.get(key) ??
      ({ key, rowIndexes: [], product: v.product || v.productSku, rows: [] } as ImportGroup);
    g.rowIndexes.push(r.index);
    g.rows.push(v);
    map.set(key, g);
  }
  return [...map.values()];
}

function firstNonEmpty(rows: Record<string, string>[], key: string): string {
  for (const r of rows) if (r[key]) return r[key];
  return "";
}

export type ResolvedRefs = {
  brandIdByName: Map<string, string>;
  categoryIdByName: Map<string, string>;
  /** Names that will be auto-created on confirm. */
  newBrands: string[];
  newCategories: string[];
};

/** Read-only brand/category lookup (case-insensitive). Auto-create happens on confirm. */
export async function fetchRefMaps(): Promise<Omit<ResolvedRefs, "newBrands" | "newCategories">> {
  const [b, c] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);
  return {
    brandIdByName: new Map(b.map((r) => [r.name.toLowerCase(), r.id])),
    categoryIdByName: new Map(c.map((r) => [r.name.toLowerCase(), r.id])),
  };
}

export type ValidatedGroup = {
  key: string;
  product: string;
  rowIndexes: number[];
  input: ProductInput | null;
  errors: string[];
  pendingBrands: string[];
  pendingCategories: string[];
  totalStock: number;
};

export function validateGroup(
  group: ImportGroup,
  refs: { brandIdByName: Map<string, string>; categoryIdByName: Map<string, string> },
  mode: ImportMode
): ValidatedGroup {
  const errors: string[] = [];
  const pendingBrands: string[] = [];
  const pendingCategories: string[] = [];
  const first = group.rows[0];

  const basePriceRaw = firstNonEmpty(group.rows, "basePrice");
  const basePrice = parseMoney(basePriceRaw);
  if (basePriceRaw === "") errors.push("• basePrice: Base price (₱) is required");
  else if (basePrice === "invalid") errors.push("• basePrice: Invalid peso amount");

  const statusRaw = firstNonEmpty(group.rows, "status");
  const statusParsed = parseStatus(statusRaw);
  if (statusParsed === "invalid")
    errors.push(`• status: Must be one of ${STATUSES.join(", ")}`);

  const featuredParsed = parseFeatured(firstNonEmpty(group.rows, "featured"));
  if (featuredParsed === "invalid") errors.push("• featured: Use yes/no");

  const brandName = firstNonEmpty(group.rows, "brand");
  let brandId: string | null = null;
  if (brandName) {
    const hit = refs.brandIdByName.get(brandName.toLowerCase());
    if (hit) brandId = hit;
    else pendingBrands.push(brandName);
  }
  const categoryName = firstNonEmpty(group.rows, "category");
  let categoryId: string | null = null;
  if (categoryName) {
    const hit = refs.categoryIdByName.get(categoryName.toLowerCase());
    if (hit) categoryId = hit;
    else pendingCategories.push(categoryName);
  }

  const variants: (ProductInput["variants"][number] & { _stock: number })[] = [];
  let totalStock = 0;
  group.rows.forEach((r, i) => {
    const label = group.rows.length > 1 ? `row ${group.rowIndexes[i]} ` : "";
    const sku = r.variantSku || (group.rows.length === 1 ? r.productSku : "");
    if (!sku) {
      errors.push(`• ${label}variantSku: SKU is required`);
      return;
    }
    const price = parseMoney(r.variantPrice);
    if (r.variantPrice && price === "invalid") {
      errors.push(`• ${label}variantPrice: Invalid peso amount`);
      return;
    }
    const cost = parseMoney(r.cost);
    if (r.cost && cost === "invalid") {
      errors.push(`• ${label}variantPrice: Invalid peso amount`.replace("variantPrice", "cost"));
      return;
    }
    const stock = parseStock(r.stock);
    if (stock === "invalid") {
      errors.push(`• ${label}stock: Must be a whole number ≥ 0`);
      return;
    }
    if (typeof stock === "number") totalStock += stock;
    variants.push({
      sku,
      name: r.variantName || null,
      barcode: r.barcode || null,
      priceOverride: typeof price === "number" ? price : null,
      comparePrice: null,
      costPrice: typeof cost === "number" ? cost : null,
      imageUrl: null,
      status: "active",
      trackInventory: true,
      optionValues: [],
      _stock: stock ?? 0,
    } as ProductInput["variants"][number] & { _stock: number });
  });

  const productSku = first.productSku || "";
  if (mode === "new" && group.rows.length === 1 && !first.variantSku && !productSku) {
    errors.push("• productSku: SKU is required when product has no variants");
  }

  let input: ProductInput | null = null;
  if (errors.length === 0) {
    const candidate = {
      name: group.product,
      slug: first.slug || undefined,
      sku: productSku || null,
      barcode: first.barcode || null,
      shortDescription: null,
      description: null,
      brandId,
      categoryId,
      basePrice: typeof basePrice === "number" ? basePrice : 0,
      comparePrice: null,
      costPrice: null,
      trackInventory: true,
      lowStockThreshold: null,
      weightG: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      status: typeof statusParsed === "string" ? statusParsed : "draft",
      featured: typeof featuredParsed === "boolean" ? featuredParsed : false,
      images: [],
      attributes: [],
      variants: variants.map((w) => {
        const { _stock: _ignored, ...v } = w;
        void _ignored;
        return v;
      }),
    };
    const parsed = productSchema.safeParse(canonicalizeProductOptions(candidate));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.length > 0 ? `${String(issue.path.join("."))}: ` : "";
        errors.push(`• ${path}${issue.message}`);
      }
    } else {
      input = parsed.data;
    }
  }

  return {
    key: group.key,
    product: group.product,
    rowIndexes: group.rowIndexes,
    input,
    errors,
    pendingBrands,
    pendingCategories,
    totalStock,
  };
}

/** Variant-level stock keyed by SKU, parallel to a validated group's variants. */
export function groupStock(group: ImportGroup): Map<string, number> {
  const map = new Map<string, number>();
  group.rows.forEach((r) => {
    const sku = r.variantSku || r.productSku;
    if (!sku) return;
    const s = parseStock(r.stock);
    map.set(sku, typeof s === "number" ? s : 0);
  });
  return map;
}

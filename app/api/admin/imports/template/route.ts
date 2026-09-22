import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { toCSV, toXLSX, type ExportColumn, type ExportRow } from "@/lib/exports";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const columns: ExportColumn[] = [
  { key: "product", header: "Product", width: 30 },
  { key: "productSku", header: "Product SKU", width: 16 },
  { key: "variantSku", header: "Variant SKU", width: 16 },
  { key: "variantName", header: "Variant", width: 16 },
  { key: "barcode", header: "Barcode", width: 16 },
  { key: "brand", header: "Brand", width: 16 },
  { key: "category", header: "Category", width: 16 },
  { key: "basePrice", header: "Base price (₱)", width: 16 },
  { key: "variantPrice", header: "Variant price (₱)", width: 16 },
  { key: "cost", header: "Cost (₱)", width: 14 },
  { key: "status", header: "Status", width: 12 },
  { key: "featured", header: "Featured", width: 10 },
  { key: "stock", header: "Stock", width: 10 },
];

const examples: ExportRow[] = [
  {
    product: "Pro Court Paddle",
    productSku: "PC-001",
    variantSku: "PC-001",
    variantName: "Default",
    barcode: "",
    brand: "Pickle Unltd",
    category: "Paddles",
    basePrice: "₱3,499.00",
    variantPrice: "",
    cost: "₱2,100.00",
    status: "active",
    featured: "no",
    stock: "50",
  },
  {
    product: "Tour Ball 3-Pack",
    productSku: "TB-003",
    variantSku: "",
    variantName: "",
    barcode: "",
    brand: "",
    category: "Balls",
    basePrice: "₱499.00",
    variantPrice: "",
    cost: "",
    status: "draft",
    featured: "no",
    stock: "",
  },
];

export async function GET(req: Request) {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const ok = await hasPermission(session.user.id, "catalog.manage").catch(() => false);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const { audit } = await import("@/lib/audit");
  await audit(session.user.id, "import.template", "export", "products-template", { format }).catch(() => {});
  if (format === "xlsx") {
    const buf = await toXLSX(examples, columns, "Template");
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="product-import-template.xlsx"',
      },
    });
  }
  return new Response(toCSV(examples, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="product-import-template.csv"',
    },
  });
}

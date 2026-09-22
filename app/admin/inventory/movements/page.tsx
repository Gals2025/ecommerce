import { db } from "@/db";
import { inventoryLocations, inventoryMovements, products, productVariants } from "@/db/schema";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { formatManila } from "@/lib/datetime";
import { formatPHP } from "@/lib/money";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button, Input, Select } from "@/components/ui";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";
import { MOVEMENT_TYPES } from "@/db/schema";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const type = first(raw.type);
  const q = first(raw.q);
  const conds: SQL[] = [];
  if (type && (MOVEMENT_TYPES as readonly string[]).includes(type)) {
    conds.push(eq(inventoryMovements.reason, type));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  let rows: {
    id: string; reason: string; qtyOnHand: number; qtyReserved: number;
    balanceAfter: number | null; reservedAfter: number | null;
    unitCost: number | null; supplier: string | null; reference: string | null;
    refType: string | null; refId: string | null; note: string | null;
    createdAt: Date; sku: string; productName: string;
    fromCode: string | null; toCode: string | null;
  }[] = [];
  try {
    const { alias } = await import("drizzle-orm/pg-core");
    const fromLoc = alias(inventoryLocations, "fromLoc");
    const toLoc = alias(inventoryLocations, "toLoc");
    let data = await db
      .select({
        id: inventoryMovements.id,
        reason: inventoryMovements.reason,
        qtyOnHand: inventoryMovements.qtyOnHandChange,
        qtyReserved: inventoryMovements.qtyReservedChange,
        balanceAfter: inventoryMovements.balanceAfter,
        reservedAfter: inventoryMovements.reservedAfter,
        unitCost: inventoryMovements.unitCost,
        supplier: inventoryMovements.supplier,
        reference: inventoryMovements.reference,
        refType: inventoryMovements.refType,
        refId: inventoryMovements.refId,
        note: inventoryMovements.note,
        createdAt: inventoryMovements.createdAt,
        sku: productVariants.sku,
        productName: products.name,
        fromCode: fromLoc.code,
        toCode: toLoc.code,
      })
      .from(inventoryMovements)
      .innerJoin(productVariants, eq(inventoryMovements.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(fromLoc, eq(inventoryMovements.fromLocationId, fromLoc.id))
      .leftJoin(toLoc, eq(inventoryMovements.toLocationId, toLoc.id))
      .where(where)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(100);
    if (q) {
      const needle = q.toLowerCase();
      data = data.filter(
        (r) => r.sku.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle) || (r.reference ?? "").toLowerCase().includes(needle)
      );
    }
    rows = data;
  } catch {
    return <DbUnreachable />;
  }

  return (
    <PageGuard permission="inventory.adjust" page="/admin/inventory/movements">
    <div>
      <PageHeader
        title="Movement history"
        description="Append-only ledger. Corrections appear as new compensating movements — rows are never edited. Full export covers the newest 50,000 movements."
        actions={<ExportButtons endpoint="/api/admin/exports/movements" />}
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <label className="text-xs">Type
          <Select name="type" defaultValue={type}>
            <option value="">All types</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </label>
        <label className="text-xs">Search SKU / product / reference
          <Input name="q" defaultValue={q} placeholder="…" />
        </label>
        <Button type="submit" variant="secondary" size="sm">Filter</Button>
      </form>
      <p className="mb-2 text-xs text-gray-500">Showing first 100 movements (newest first).</p>
      <div className="space-y-1 text-sm">
        {rows.map((m) => (
          <div key={m.id} className="rounded border p-2">
            <span className="font-medium">{m.reason}</span>{" "}
            <span className="text-xs">on-hand {m.qtyOnHand >= 0 ? "+" : ""}{m.qtyOnHand} • reserved {m.qtyReserved >= 0 ? "+" : ""}{m.qtyReserved}</span>{" "}
            <span className="text-xs text-gray-600">{m.productName} ({m.sku})</span>
            <div className="text-xs text-gray-500">
              {m.fromCode ? `from ${m.fromCode} ` : ""}{m.toCode ? `to ${m.toCode} ` : ""}
              • balance after: {m.balanceAfter ?? "—"} on-hand / {m.reservedAfter ?? "—"} reserved
              {m.unitCost != null ? ` • cost ${formatPHP(m.unitCost)}` : ""}
              {m.supplier ? ` • ${m.supplier}` : ""}{m.reference ? ` • ref ${m.reference}` : ""}
              {m.refType ? ` • ${m.refType} ${m.refId?.slice(0, 8) ?? ""}` : ""}
              {" • "}{formatManila(m.createdAt)}
            </div>
            {m.note && <div className="text-xs italic text-gray-600">{m.note}</div>}
          </div>
        ))}
        {rows.length === 0 && <EmptyState title="No movements" description="Movements will appear after receiving or adjusting stock." />}
      </div>
    </div>
    </PageGuard>
  );
}

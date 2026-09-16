import Link from "next/link";
import { formatPHP } from "@/lib/money";
import { formatManila } from "@/lib/datetime";
import type { ReceiptCostLayer } from "@/features/reports/service";

function pairLabel(l: ReceiptCostLayer): string {
  const cost = l.unitCost == null ? "no cost" : formatPHP(l.unitCost);
  return `${l.qtyReceived} × ${cost}`;
}

function layerTitle(l: ReceiptCostLayer): string {
  const parts = [
    l.supplier ?? "Unknown supplier",
    formatManila(l.lastReceivedAt, "MMM d, yyyy"),
    l.reference ? `ref ${l.reference}` : null,
  ].filter(Boolean);
  return parts.join(" • ");
}

export function CostLayersCell({
  sku,
  wac,
  unitCost,
  costMissing,
  layers,
}: {
  sku: string;
  wac: number | null;
  unitCost: number;
  costMissing: boolean;
  layers: ReceiptCostLayer[];
}) {
  if (costMissing) {
    return (
      <div>
        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
          cost missing
        </span>
        {layers.length > 0 && (
          <div className="mt-0.5 text-xs text-gray-500">
            {layers.map(pairLabel).join(" · ")}
          </div>
        )}
      </div>
    );
  }
  const multi = layers.length > 1 && wac != null;
  const visible = layers.slice(0, 2);
  const extra = layers.length - visible.length;
  return (
    <div>
      <div>
        {formatPHP(unitCost)}
        {multi && <span className="text-xs text-gray-500"> avg</span>}
      </div>
      {layers.length > 1 && (
        <div
          className="text-xs text-gray-500"
          title={layers.map((l) => `${pairLabel(l)} (${layerTitle(l)})`).join("\n")}
        >
          {visible.map(pairLabel).join(" · ")}
          {extra > 0 && ` · +${extra} more`}
        </div>
      )}
      {layers.length > 0 && (
        <details className="mt-1 text-left">
          <summary className="cursor-pointer text-xs text-blue-700 hover:underline">
            Receipts ({layers.length})
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs font-normal text-gray-600">
            {layers.map((l, i) => (
              <li key={i} title={layerTitle(l)}>
                {l.supplier ?? "Unknown supplier"} • {formatManila(l.lastReceivedAt, "MMM d, yyyy")} •{" "}
                {l.qtyReceived} received • {l.unitCost == null ? "no cost" : formatPHP(l.unitCost)}
                {l.reference ? ` • ref ${l.reference}` : ""}
              </li>
            ))}
          </ul>
          <Link
            href={`/admin/inventory/movements?q=${encodeURIComponent(sku)}`}
            className="mt-0.5 inline-block text-xs text-blue-700 hover:underline"
          >
            View ledger
          </Link>
        </details>
      )}
    </div>
  );
}

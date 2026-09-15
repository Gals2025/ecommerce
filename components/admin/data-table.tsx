"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  value?: (row: T) => string | number;
};

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  emptyTitle = "No records",
  emptyDescription,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.value) return 0;
    const va = col.value(a);
    const vb = col.value(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">{emptyTitle}</p>
        {emptyDescription && <p className="mt-1 text-sm text-gray-500">{emptyDescription}</p>}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                {c.sortable ? (
                  <button
                    onClick={() => {
                      if (sortKey === c.key) setDir((d) => (d === 1 ? -1 : 1));
                      else {
                        setSortKey(c.key);
                        setDir(1);
                      }
                    }}
                    className={cn("hover:underline", sortKey === c.key && "font-bold")}
                  >
                    {c.header} {sortKey === c.key ? (dir === 1 ? "↑" : "↓") : ""}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2">
                  {c.render ? c.render(r) : c.value ? String(c.value(r)) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

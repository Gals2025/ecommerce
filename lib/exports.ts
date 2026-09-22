import ExcelJS from "exceljs";
import { formatPHP, centavosToPesos } from "./money";
import { formatManila } from "./datetime";

export type ExportCellKind = "text" | "number" | "money" | "date";

export type ExportColumn = {
  key: string;
  header: string;
  width?: number;
  kind?: ExportCellKind;
};

export type ExportRow = Record<string, string | number | boolean | Date | null | undefined>;

function csvCell(value: unknown, kind: ExportCellKind): string {
  if (value == null || value === "") return kind === "money" ? "—" : "";
  if (kind === "money") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return formatPHP(Math.round(n));
  }
  if (kind === "date") {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "";
    return formatManila(d);
  }
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: ExportRow[], columns: ExportColumn[]): string {
  const header = columns.map((c) => csvCell(c.header, "text")).join(",");
  const lines = rows.map((r) =>
    columns.map((c) => csvCell(r[c.key], c.kind ?? "text")).join(",")
  );
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}

export async function toXLSX(rows: ExportRow[], columns: ExportColumn[], sheetName = "Export"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 22,
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    const rowValues = columns.map((c) => {
      const v = r[c.key];
      const kind = c.kind ?? "text";
      if (v == null || v === "") return kind === "money" ? "—" : "";
      if (kind === "money") {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return "—";
        return centavosToPesos(Math.round(n));
      }
      if (kind === "date") {
        const d = v instanceof Date ? v : new Date(String(v));
        return Number.isNaN(d.getTime()) ? "" : d;
      }
      if (kind === "number") {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : "";
      }
      return String(v);
    });
    ws.addRow(rowValues);
  }

  // Minimal styling: peso + date formats on data cells.
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === "money") col.numFmt = '[$₱-en-PH]#,##0.00';
    if (c.kind === "date") col.numFmt = "yyyy-mm-dd hh:mm";
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function exportFilename(base: string, ext: "csv" | "xlsx"): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${base}-${day}.${ext}`;
}

import { NextResponse } from "next/server";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { toCSV, toXLSX, exportFilename } from "@/lib/exports";
import {
  MOVEMENT_EXPORT_LIMIT,
  getMovementExportRows,
  movementExportColumns,
} from "@/features/exports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return null;
  const ok =
    (await hasPermission(session.user.id, "inventory.adjust").catch(() => false)) ||
    (await hasPermission(session.user.id, "reports.view").catch(() => false));
  return ok ? session : null;
}

export async function GET(req: Request) {
  const session = await guard();
  if (!session?.user) {
    const { audit } = await import("@/lib/audit");
    await audit("anonymous", "export.denied", "export", "movements", {}).catch(() => {});
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await getMovementExportRows();
  const capped = rows.length >= MOVEMENT_EXPORT_LIMIT;
  const { audit } = await import("@/lib/audit");
  await audit(session.user.id, "export.movements", "export", "movements", { format, rows: rows.length }).catch(() => {});
  const headers: Record<string, string> =
    format === "xlsx"
      ? {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${exportFilename("movements", "xlsx")}"`,
        }
      : {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${exportFilename("movements", "csv")}"`,
        };
  if (capped) headers["x-export-capped"] = String(MOVEMENT_EXPORT_LIMIT);
  if (format === "xlsx") {
    const buf = await toXLSX(rows, movementExportColumns, "Movements");
    return new Response(new Uint8Array(buf), { headers });
  }
  return new Response(toCSV(rows, movementExportColumns), { headers });
}

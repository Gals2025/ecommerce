import { NextResponse } from "next/server";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { toCSV, toXLSX, exportFilename } from "@/lib/exports";
import {
  getInventoryExportRows,
  inventoryExportColumns,
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
    await audit("anonymous", "export.denied", "export", "inventory", {}).catch(() => {});
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await getInventoryExportRows();
  const { audit } = await import("@/lib/audit");
  await audit(session.user.id, "export.inventory", "export", "inventory", { format, rows: rows.length }).catch(() => {});
  if (format === "xlsx") {
    const buf = await toXLSX(rows, inventoryExportColumns, "Inventory");
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${exportFilename("inventory", "xlsx")}"`,
      },
    });
  }
  return new Response(toCSV(rows, inventoryExportColumns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename("inventory", "csv")}"`,
    },
  });
}

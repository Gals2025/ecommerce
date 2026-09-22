import { NextResponse } from "next/server";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import { toCSV, toXLSX, exportFilename } from "@/lib/exports";
import {
  getProductExportRows,
  productExportColumns,
} from "@/features/exports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return null;
  const ok =
    (await hasPermission(session.user.id, "catalog.manage").catch(() => false)) ||
    (await hasPermission(session.user.id, "reports.view").catch(() => false));
  return ok ? session : null;
}

export async function GET(req: Request) {
  const session = await guard();
  if (!session?.user) {
    const { audit } = await import("@/lib/audit");
    await audit("anonymous", "export.denied", "export", "products", {}).catch(() => {});
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await getProductExportRows();
  const { audit } = await import("@/lib/audit");
  await audit(session.user.id, "export.products", "export", "products", { format, rows: rows.length }).catch(() => {});
  if (format === "xlsx") {
    const buf = await toXLSX(rows, productExportColumns, "Products");
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${exportFilename("products", "xlsx")}"`,
      },
    });
  }
  return new Response(toCSV(rows, productExportColumns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename("products", "csv")}"`,
    },
  });
}

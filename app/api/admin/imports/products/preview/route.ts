import { NextResponse } from "next/server";
import { getStrictAdminSession, hasPermission } from "@/lib/rbac";
import {
  fetchRefMaps,
  groupRows,
  parseImportFile,
  validateGroup,
  type ImportMode,
} from "@/features/imports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getStrictAdminSession().catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const allowed = await hasPermission(session.user.id, "catalog.manage").catch(() => false);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const modeRaw = form?.get("mode");
  const mode: ImportMode = modeRaw === "update" ? "update" : "new";
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  let rows;
  try {
    rows = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parse failed" }, { status: 400 });
  }

  const refs = await fetchRefMaps();
  const groups = groupRows(rows).map((g) => {
    const v = validateGroup(g, refs, mode);
    return {
      product: v.product,
      rows: v.rowIndexes,
      ok: v.errors.length === 0,
      errors: v.errors,
      newBrands: [...new Set(v.pendingBrands)],
      newCategories: [...new Set(v.pendingCategories)],
      stock: v.totalStock,
    };
  });
  const okCount = groups.filter((g) => g.ok).length;
  return NextResponse.json({
    mode,
    totalRows: rows.length,
    groups,
    summary: {
      products: groups.length,
      valid: okCount,
      invalid: groups.length - okCount,
      newBrands: [...new Set(groups.flatMap((g) => g.newBrands))],
      newCategories: [...new Set(groups.flatMap((g) => g.newCategories))],
    },
  });
}

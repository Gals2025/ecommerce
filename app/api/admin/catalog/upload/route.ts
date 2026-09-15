import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { uploadCatalogImage } from "@/lib/blob";
import { audit } from "@/lib/audit";

const KINDS = new Set(["products", "categories", "brands", "variants"]);

export async function POST(req: Request) {
  let actorId: string | null = null;
  try {
    const session = await requireAdmin();
    actorId = session.user.id;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  const kindRaw = formData.get("kind");
  const kind = (typeof kindRaw === "string" && KINDS.has(kindRaw) ? kindRaw : "products") as
    | "products"
    | "categories"
    | "brands"
    | "variants";
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  try {
    const url = await uploadCatalogImage(file, kind);
    if (actorId) await audit(actorId, "catalog.upload", "catalog", kind, { url }).catch(() => {});
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const status = /Only JPG|under 4MB/.test(message) ? 400 : 500;
    // Validation errors are safe to echo; storage internals are not.
    if (status === 500) console.error("[upload] failed", message);
    return NextResponse.json({ error: status === 400 ? message : "Upload failed" }, { status });
  }
}

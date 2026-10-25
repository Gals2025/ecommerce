import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getStrictAdminSession, getUserRoles } from "@/lib/rbac";
import { rolesHavePermission } from "@/lib/permissions";

export async function POST(request: Request) {
 try {
  const session = await getStrictAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = await getUserRoles(session.user.id);
  if (!rolesHavePermission(roles, "promotions.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "PNG, JPG or WebP only" }, { status: 400 });
  if (file.size > 2 * 1024 * 1024 || file.size === 0) return NextResponse.json({ error: "Image must be under 2MB" }, { status: 400 });
  const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const blob = await put(`open-plays/qr/${crypto.randomUUID()}.${extension}`, file, { access: "public", addRandomSuffix: false, contentType: file.type });
  return NextResponse.json({ url: blob.url });
 } catch { return NextResponse.json({ error: "Upload failed. Verify Blob storage is configured." }, { status: 500 }); }
}

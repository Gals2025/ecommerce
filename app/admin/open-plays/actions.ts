"use server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStrictAdminSession, getUserRoles } from "@/lib/rbac";
import { rolesHavePermission } from "@/lib/permissions";
import { normalize, readShowcase, safeUrl } from "@/features/open-plays";

async function authorize() {
 const session = await getStrictAdminSession();
 if (!session) throw new Error("Unauthorized");
 const roles = await getUserRoles(session.user.id);
 if (!rolesHavePermission(roles, "promotions.manage")) throw new Error("Forbidden");
}
export async function saveOpenPlays(form: FormData) {
 await authorize();
 const raw = JSON.parse(String(form.get("payload") ?? "{}"));
 const value = normalize(raw);
 if (value.reclubUrl && !safeUrl(value.reclubUrl)) throw new Error("Invalid Reclub URL");
 for (const s of value.sessions) if (s.url && !safeUrl(s.url)) throw new Error("Invalid session URL");
 const data = JSON.stringify(value);
 await db.execute(sql`INSERT INTO open_play_showcase (id,draft) VALUES (1,${data}::jsonb)
 ON CONFLICT (id) DO UPDATE SET draft = EXCLUDED.draft, updated_at = now()`);
 revalidatePath("/admin/open-plays");
}
export async function publishOpenPlays() {
 await authorize();
 const { draft } = await readShowcase();
 const data = JSON.stringify(draft);
 await db.execute(sql`INSERT INTO open_play_showcase (id,published,draft) VALUES (1,${data}::jsonb,${data}::jsonb)
 ON CONFLICT (id) DO UPDATE SET published = EXCLUDED.published, updated_at = now()`);
 revalidatePath("/"); revalidatePath("/admin/open-plays");
}

export async function deleteOpenPlayQr() {
 await authorize();
 const { draft, published } = await readShowcase();
 const urls = [...new Set([draft.qrImageUrl, published.qrImageUrl].filter(Boolean))];
 // Clear only QR fields, preserving every other saved draft/published value.
 await db.execute(sql`UPDATE open_play_showcase SET
 draft = jsonb_set(draft, '{qrImageUrl}', '""'::jsonb, true),
 published = jsonb_set(published, '{qrImageUrl}', '""'::jsonb, true),
 updated_at = now() WHERE id = 1`);
 revalidatePath("/");
 revalidatePath("/admin/open-plays");
 // Delete only files inside this feature's Vercel Blob namespace.
 const { del } = await import("@vercel/blob");
 const managed = urls.filter(value => {
  try {
   const u = new URL(value);
   return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith("/open-plays/qr/");
  } catch { return false; }
 });
 if (managed.length) {
  try { await del(managed); } catch {
   // The QR is no longer published, but the blob may require manual cleanup.
   return { cleaned: false };
  }
 }
 return { cleaned: true };
}

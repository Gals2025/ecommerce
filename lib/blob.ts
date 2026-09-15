import { put } from "@vercel/blob";

// NOTE: a previous unauthenticated uploadProof() helper was deleted here.
// Proof/receipt uploads must go through a validated, permission-checked path
// (see uploadCatalogImage + app/api/admin/catalog/upload/route.ts). Do not
// reintroduce a direct FormData→Blob put without auth + type/size checks.

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function validateImageFile(file: File) {
  if (!IMAGE_MIMES.has(file.type)) {
    throw new Error("Only JPG, PNG, WebP, or GIF images are allowed");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 4MB");
  }
}

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(0, 80);
}

/** Upload a catalog image (product, variant, category, brand logo) to Vercel Blob. */
export async function uploadCatalogImage(file: File, kind: "products" | "categories" | "brands" | "variants" = "products") {
  validateImageFile(file);
  const key = `${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
  const blob = await put(key, file, { access: "public" });
  return blob.url;
}

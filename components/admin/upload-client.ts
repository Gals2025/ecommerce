export type CatalogUploadKind = "products" | "categories" | "brands" | "variants";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function validateCatalogFile(file: File) {
  if (!IMAGE_MIMES.has(file.type)) {
    throw new Error("Only JPG, PNG, WebP, or GIF images are allowed");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 4MB");
  }
}

function buildUploadForm(file: File, kind: CatalogUploadKind) {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return form;
}

async function postUpload(file: File, kind: CatalogUploadKind) {
  return fetch("/api/admin/catalog/upload", {
    method: "POST",
    body: buildUploadForm(file, kind),
  });
}

/** Upload a file to the admin catalog endpoint, refreshing the session once on 401. */
export async function uploadCatalogFile(file: File, kind: CatalogUploadKind): Promise<string> {
  validateCatalogFile(file);

  let res = await postUpload(file, kind);
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);
    if (!refreshed?.ok) throw new Error("Session expired - please sign in again.");
    res = await postUpload(file, kind);
  }
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(
      res.status === 401 ? "Session expired - please sign in again." : (body.error ?? "Upload failed")
    );
  }
  return body.url;
}

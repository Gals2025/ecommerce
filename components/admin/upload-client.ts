/** Upload a file to the admin catalog endpoint, refreshing the session once on 401.
 *
 * Access tokens are short-lived (15m) while the refresh cookie is Path-scoped
 * to /api/auth, so XHRs to /api/admin/* can't use it implicitly. On 401 we
 * explicitly rotate via /api/auth/refresh (which receives the refresh cookie)
 * and retry the upload once with the fresh access cookie.
 */
export async function uploadCatalogFile(form: FormData): Promise<string> {
  let res = await fetch("/api/admin/catalog/upload", { method: "POST", body: form });
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);
    if (!refreshed?.ok) throw new Error("Session expired — please sign in again.");
    res = await fetch("/api/admin/catalog/upload", { method: "POST", body: form });
  }
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(
      res.status === 401 ? "Session expired — please sign in again." : (body.error ?? "Upload failed")
    );
  }
  return body.url;
}

import Link from "next/link";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { formatPHP } from "@/lib/money";
import { productListParamsSchema } from "@/validators";
import { PageHeader } from "@/components/admin/page-header";
import { PageGuard } from "@/components/admin/page-guard";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Button, Input, Select } from "@/components/ui";
import { Pagination } from "@/components/ui/pagination";
import { DbUnreachable, EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["draft", "active", "inactive", "archived"] as const;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function pageUrl(base: Record<string, string>, overrides: Record<string, string>) {
  const params = new URLSearchParams({ ...base, ...overrides });
  for (const [k, v] of Object.entries(overrides)) if (v === "") params.delete(k);
  const qs = params.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = productListParamsSchema.safeParse({
    q: first(raw.q),
    categoryId: first(raw.categoryId) || null,
    brandId: first(raw.brandId) || null,
    status: first(raw.status) || null,
    featured: (["all", "yes", "no"] as const).includes(first(raw.featured) as "all") ? first(raw.featured) : "all",
    sort: first(raw.sort) || "newest",
    page: Number(first(raw.page)) || 1,
    pageSize: PAGE_SIZE,
  });
  const p = parsed.success
    ? parsed.data
    : { q: "", categoryId: null, brandId: null, status: null, featured: "all" as const, sort: "newest" as const, page: 1, pageSize: PAGE_SIZE };

  const base: Record<string, string> = {};
  if (p.q) base.q = p.q;
  if (p.categoryId) base.categoryId = p.categoryId;
  if (p.brandId) base.brandId = p.brandId;
  if (p.status) base.status = p.status;
  if (p.featured !== "all") base.featured = p.featured;
  if (p.sort !== "newest") base.sort = p.sort;

  const conds: SQL[] = [];
  if (p.q) {
    const like = `%${p.q}%`;
    conds.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.slug, like))!);
  }
  if (p.categoryId) conds.push(eq(products.categoryId, p.categoryId));
  if (p.brandId) conds.push(eq(products.brandId, p.brandId));
  if (p.status) conds.push(eq(products.status, p.status));
  if (p.featured === "yes") conds.push(eq(products.featured, true));
  if (p.featured === "no") conds.push(eq(products.featured, false));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const orderBy =
    p.sort === "name" ? asc(products.name)
    : p.sort === "name_desc" ? desc(products.name)
    : p.sort === "price" ? asc(products.basePrice)
    : p.sort === "price_desc" ? desc(products.basePrice)
    : desc(products.createdAt);

  let rows: {
    id: string; name: string; slug: string; sku: string | null; basePrice: number;
    status: string; featured: boolean; brandName: string | null; categoryName: string | null;
  }[] = [];
  let total = 0;
  let dbError = false;
  let brandOpts: { id: string; name: string }[] = [];
  let catOpts: { id: string; name: string }[] = [];
  try {
    brandOpts = await db.select({ id: brands.id, name: brands.name }).from(brands);
    catOpts = await db.select({ id: categories.id, name: categories.name }).from(categories);
    const [c] = await db.select({ n: count() }).from(products).where(where);
    total = Number(c?.n ?? 0);
    rows = await db
      .select({
        id: products.id, name: products.name, slug: products.slug, sku: products.sku,
        basePrice: products.basePrice, status: products.status, featured: products.featured,
        brandName: brands.name, categoryName: categories.name,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((p.page - 1) * PAGE_SIZE);
  } catch {
    dbError = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageGuard permission="catalog.manage" page="/admin/products">
    <div>
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"} • search, filter, sort, paginate`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons endpoint="/api/admin/exports/products" />
            <Link href="/admin/products/new">
              <Button>New product</Button>
            </Link>
          </div>
        }
      />
      {dbError && <DbUnreachable />}
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-6">
        <label className="col-span-2 text-xs">Search
          <Input name="q" defaultValue={p.q} placeholder="Name, SKU, slug…" />
        </label>
        <label className="text-xs">Category
          <Select name="categoryId" defaultValue={p.categoryId ?? ""}>
            <option value="">All</option>
            {catOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="text-xs">Brand
          <Select name="brandId" defaultValue={p.brandId ?? ""}>
            <option value="">All</option>
            {brandOpts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </label>
        <label className="text-xs">Status
          <Select name="status" defaultValue={p.status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </label>
        <label className="text-xs">Featured
          <Select name="featured" defaultValue={p.featured}>
            <option value="all">All</option>
            <option value="yes">Featured</option>
            <option value="no">Not featured</option>
          </Select>
        </label>
        <label className="text-xs">Sort
          <Select name="sort" defaultValue={p.sort}>
            <option value="newest">Newest</option>
            <option value="name">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="price">Price low–high</option>
            <option value="price_desc">Price high–low</option>
          </Select>
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-6">
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          <Link href="/admin/products" className="text-sm text-gray-500 hover:underline">Reset</Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Category / Brand</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name} {r.featured && <span className="text-xs text-amber-600">★</span>}</div>
                  <div className="text-xs text-gray-500">{r.slug}</div>
                </td>
                <td className="px-3 py-2 text-xs">{r.sku ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.categoryName ?? "—"} / {r.brandName ?? "—"}</td>
                <td className="px-3 py-2">{formatPHP(r.basePrice)}</td>
                <td className="px-3 py-2 text-xs"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right text-xs">
                  <Link href={`/admin/products/${r.id}`} className="hover:underline">View</Link>{" · "}
                  <Link href={`/admin/products/${r.id}/edit`} className="hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && !dbError && (
        <div className="mt-3">
          <EmptyState
            title="No products match"
            description="Try adjusting your search or filters."
            action={
              <Link href="/admin/products/new">
                <Button size="sm">New product</Button>
              </Link>
            }
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-500">Page {p.page} of {totalPages}</span>
        <Pagination page={p.page} totalPages={totalPages} hrefFor={(pg) => pageUrl(base, { page: String(pg) })} />
      </div>
    </div>
    </PageGuard>
  );
}

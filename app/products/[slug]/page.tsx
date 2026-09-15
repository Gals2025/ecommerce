import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { getCategoriesTree, getMemberDiscountPct, getProductDetail, getVisibleProducts } from "@/features/catalog/storefront";
import { StoreFooter, StoreHeader } from "@/components/store/header";
import { ProductCard } from "@/components/store/product-card";
import { ProductDetailClient } from "@/components/store/product-detail";
import { DbUnreachable } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession().catch(() => null);
  let product: Awaited<ReturnType<typeof getProductDetail>>;
  try {
    product = await getProductDetail(slug);
  } catch {
    return <DbUnreachable />;
  }
  if (!product) notFound();

  const [cats, memberPct, related] = await Promise.all([
    getCategoriesTree().catch(() => []),
    getMemberDiscountPct(session?.user.id ?? null).catch(() => null),
    getVisibleProducts({ categoryId: product.categoryId, sort: "newest" }, 5, 0)
      .then((r) => r.items.filter((i) => i.id !== product!.id).slice(0, 4))
      .catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Link href="/shop" className="text-sm text-gray-600 hover:underline">← Back to shop</Link>
        <div className="mt-3">
          <ProductDetailClient product={product} memberPct={memberPct} />
        </div>
        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold">Related products</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((i) => <ProductCard key={i.id} item={i} memberPct={memberPct} />)}
            </div>
          </section>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}

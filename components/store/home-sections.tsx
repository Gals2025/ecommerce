import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Backpack,
  BadgePercent,
  ChevronRight,
  Circle,
  Shirt,
  Sparkles,
  Tag,
  Trophy,
  Zap,
} from "lucide-react";
import type { StoreProductCard } from "@/features/catalog/storefront";
import type { StoreNavCategory } from "./header";
import { ProductCard } from "./product-card";
import { FlashCountdown } from "./flash-countdown";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui";
import { cardIsVisible, type CardSlot, type HomeCard } from "@/features/catalog/homepage-cards";

/* ---------------------------------- Hero ---------------------------------- */

const HERO_TICKS = ["Member prices on every order", "Nationwide delivery", "COD · GCash · Bank transfer"];

export function Hero({ paddleCategoryId }: { paddleCategoryId: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-stone-950 text-white shadow-soft">
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 right-1/4 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden />
      <div className="relative grid gap-6 px-6 py-10 sm:px-12 sm:py-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Dink · Drive · Dominate
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            More than a paddle.
            <span className="block text-emerald-400">Own the court.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-300 sm:text-base">
            Brand-new paddles, tournament balls & court-ready apparel — with member prices and nationwide delivery.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href={paddleCategoryId ? `/shop?categoryId=${paddleCategoryId}` : "/shop"}
              className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
            >
              Shop paddles <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/membership" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white")}>
              Membership
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-stone-300">
            {HERO_TICKS.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden select-none lg:block" aria-hidden>
          <p className="text-right font-display text-2xl font-semibold uppercase leading-tight tracking-wide text-white/25">
            Good dinks
            <br />
            Great things
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Category rail ----------------------------- */

function categoryIcon(slug: string, name: string) {
  const s = `${slug} ${name}`.toLowerCase();
  if (s.includes("paddle")) return Zap;
  if (s.includes("ball")) return Circle;
  if (s.includes("apparel") || s.includes("wear") || s.includes("cloth")) return Shirt;
  if (s.includes("accessor") || s.includes("bag") || s.includes("grip")) return Backpack;
  return Tag;
}

export function CategoryRail({ categories }: { categories: (StoreNavCategory & { imageUrl?: string | null })[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Shop by category</h2>
        <Link href="/shop" className="flex min-h-[44px] items-center gap-0.5 py-1 text-sm font-medium text-emerald-800 underline-offset-4 hover:underline">
          View all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {categories.map((c) => {
          const Icon = categoryIcon(c.slug, c.name);
          return (
            <Link key={c.id} href={`/shop?categoryId=${c.id}`} className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center">
              <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-stone-200/80 bg-white shadow-soft transition-all group-hover:border-emerald-600/40 group-hover:shadow-lift">
                {c.imageUrl ? (
                  <Image src={c.imageUrl} alt={c.name} width={64} height={64} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-6 w-6 text-emerald-800" />
                )}
              </span>
              <span className="text-xs font-medium leading-tight text-stone-700 group-hover:text-emerald-800">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- Product row ------------------------------ */

export function ProductRow({
  title,
  subtitle,
  href,
  linkLabel = "View all",
  items,
  memberPct,
  rankFrom = 0,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  items: StoreProductCard[];
  memberPct?: number | null;
  /** When > 0, show #rank badges starting at this number (best sellers). */
  rankFrom?: number;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="flex min-h-[44px] shrink-0 items-center gap-0.5 py-1 text-sm font-medium text-emerald-800 underline-offset-4 hover:underline">
            {linkLabel} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2 snap-x">
        {items.map((i, idx) => (
          <div key={i.id} className="w-40 shrink-0 snap-start sm:w-52">
            <ProductCard
              item={i}
              memberPct={memberPct}
              rank={rankFrom > 0 ? rankFrom + idx : null}
              featuredBadge={rankFrom === 0 && i.featured}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- Promo split ------------------------------ */

export type SplitPromo = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  value: number | null;
  endAt: Date | null;
};

export function PromoSplit({ promos, cards }: { promos: SplitPromo[]; cards: Record<CardSlot, HomeCard> }) {
  const flashCard = cards.flash_sale;
  const newCard = cards.new_arrivals;
  const flash = flashCard.promotionId
    ? promos.find((p) => p.id === flashCard.promotionId) ?? null
    : promos.find((p) => p.kind === "percent" || p.kind === "fixed") ?? null;
  const activeFlash = flash && (flash.kind === "percent" || flash.kind === "fixed") ? flash : null;
  const visibleFlash = cardIsVisible(flashCard);
  const visibleNew = cardIsVisible(newCard);
  if (!visibleFlash && !visibleNew) return null;
  const theme = (value: string) => value === "forest" ? "bg-gradient-to-br from-emerald-950 to-emerald-600 text-white"
    : value === "dark" ? "bg-stone-950 text-white"
    : value === "light" ? "border border-stone-200/80 bg-white text-stone-900"
    : "bg-gradient-to-br from-red-700 via-red-600 to-amber-600 text-white";
  return (
    <section className={`mt-10 grid gap-3 ${visibleFlash && visibleNew ? "lg:grid-cols-2" : ""}`}>
      {/* Flash sale */}
      {visibleFlash && <div className={`relative overflow-hidden rounded-3xl p-6 shadow-soft sm:p-7 ${theme(flashCard.theme)}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] opacity-90">
          <Zap className="h-4 w-4" /> {flashCard.eyebrow}
        </div>
        {activeFlash ? (
          <>
            <p className="mt-2 font-display text-3xl font-semibold leading-none sm:text-4xl">
              Up to {activeFlash.kind === "percent" ? `${activeFlash.value ?? 0}%` : `₱${((activeFlash.value ?? 0) / 100).toFixed(0)}`} off
            </p>
            <p className="mt-1.5 max-w-xs text-sm opacity-85">{flashCard.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={flashCard.buttonHref} className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-semibold transition ${flashCard.theme === "light" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-white text-red-700 hover:bg-red-50"}`}>
                {flashCard.buttonText}
              </Link>
              {activeFlash.endAt ? <FlashCountdown endAt={activeFlash.endAt} /> : <span className="text-xs font-medium uppercase tracking-wider opacity-80">Limited time</span>}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{flashCard.promotionId ? "Discover the latest deals" : flashCard.headline}</p>
            <p className="mt-1.5 text-sm opacity-85">{flashCard.description}</p>
            <div className="mt-4">
              <Link href={flashCard.buttonHref} className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-semibold transition ${flashCard.theme === "light" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-white text-red-700 hover:bg-red-50"}`}>
                {flashCard.buttonText}
              </Link>
            </div>
          </>
        )}
      </div>}
      {/* New arrivals */}
      {visibleNew && <div className={`relative overflow-hidden rounded-3xl p-6 shadow-soft sm:p-7 ${theme(newCard.theme)}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">
          <Sparkles className="h-4 w-4" /> {newCard.eyebrow}
        </div>
        <p className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{newCard.headline}</p>
        <p className="mt-1.5 max-w-xs text-sm opacity-70">{newCard.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={newCard.buttonHref} className={cn(buttonVariants({ variant: "primary" }))}>
            {newCard.buttonText} <ArrowRight className="h-4 w-4" />
          </Link>
          {newCard.asideText && <span className="flex items-center gap-1 text-xs font-medium opacity-60">
            <Trophy className="h-3.5 w-3.5" /> {newCard.asideText}
          </span>}
        </div>
      </div>}
    </section>
  );
}

/* ------------------------------ Membership CTA ----------------------------- */

export type TierRow = { id: string; name: string; discountPct: number };

export function MembershipBanner({ tiers, topDiscount }: { tiers: TierRow[]; topDiscount: number | null }) {
  return (
    <section className="mt-10 overflow-hidden rounded-3xl bg-stone-950 text-white shadow-soft">
      <div className="grid sm:grid-cols-2">
        <div className="p-6 sm:p-8">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <BadgePercent className="h-4 w-4" /> Pickle Unltd membership
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Unlock member prices{topDiscount ? ` up to ${topDiscount}% off` : ""}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-300">
            Earn tiers as you shop. Higher tiers mean bigger automatic discounts on every order.
          </p>
          <Link href="/membership" className={cn(buttonVariants({ variant: "primary" }), "mt-4 inline-flex min-h-[44px] items-center")}>
            Join now
          </Link>
        </div>
        <div className="bg-white/5 p-6 sm:p-8">
          <div className="space-y-2 text-sm">
            {tiers.slice(0, 4).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
                <span className="font-medium text-white">{t.name}</span>
                <span className="text-emerald-300">{t.discountPct}% off</span>
              </div>
            ))}
            {tiers.length === 0 && <p className="text-stone-400">Membership tiers coming soon.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

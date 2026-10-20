"use client";

import { useState } from "react";
import { saveHomepageCard } from "@/actions/homepage-cards";
import type { HomeCard } from "@/features/catalog/homepage-cards";

type Offer = { id: string; name: string; kind: string; value: number; isActive: boolean; startAt: Date | null; endAt: Date | null };
const dateInput = (date: Date | null) => {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(date));
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
};

export function CardEditor({ card, offers }: { card: HomeCard; offers: Offer[] }) {
  const [form, setForm] = useState({
    eyebrow: card.eyebrow, headline: card.headline, description: card.description,
    buttonText: card.buttonText, buttonHref: card.buttonHref, theme: card.theme, asideText: card.asideText,
  });
  const [promotionId, setPromotionId] = useState(card.promotionId ?? "");
  const [visible, setVisible] = useState(card.isVisible);
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const flash = card.slot === "flash_sale";
  const linked = offers.find((p) => p.id === promotionId);
  const now = new Date();
  const activeLinked = linked && (!linked.startAt || new Date(linked.startAt) <= now) && (!linked.endAt || new Date(linked.endAt) >= now);
  const previewHeadline = activeLinked
    ? `Up to ${linked.kind === "percent" ? `${linked.value}%` : `₱${(linked.value / 100).toFixed(0)}`} off`
    : flash && promotionId ? "Discover the latest deals" : form.headline;
  const bg = form.theme === "sunset" ? "bg-gradient-to-br from-red-700 via-red-600 to-amber-600 text-white"
    : form.theme === "forest" ? "bg-gradient-to-br from-emerald-950 to-emerald-600 text-white"
    : form.theme === "dark" ? "bg-stone-950 text-white" : "border border-stone-200 bg-white text-stone-900";
  return <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
    <h2 className="font-display text-xl font-semibold">{flash ? "Flash Sale" : "New Arrivals"}</h2>
    <p className="mt-1 text-sm text-stone-500">{flash ? "Left card" : "Right card"} on the storefront homepage.</p>
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <form action={saveHomepageCard} className="grid gap-3 text-sm">
        <input type="hidden" name="slot" value={card.slot} />
        {([ ["eyebrow", "Small label", 40], ["headline", "Headline", 100], ["description", "Description", 240],
          ["buttonText", "Button text", 40], ["buttonHref", "Button destination (internal path)", 250] ] as const).map(([key, label, max]) =>
          <label key={key} className="grid gap-1 font-medium">{label}
            <input className="w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" name={key} value={form[key]}
              onChange={(e) => update(key, e.target.value)} required maxLength={max} />
          </label>)}
        {!flash && <label className="grid gap-1 font-medium">Small note beside button (optional)
          <input className="w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" name="asideText" value={form.asideText}
            onChange={(e) => update("asideText", e.target.value)} maxLength={60} />
        </label>}
        <label className="grid gap-1 font-medium">Color theme
          <select className="rounded-lg border border-stone-300 px-3 py-2 font-normal" name="theme" value={form.theme} onChange={(e) => update("theme", e.target.value)}>
            <option value="sunset">Sunset red</option><option value="forest">Forest green</option>
            <option value="light">White</option><option value="dark">Dark</option>
          </select>
        </label>
        {flash && <label className="grid gap-1 font-medium">Linked discount (optional)
          <select className="rounded-lg border border-stone-300 px-3 py-2 font-normal" name="promotionId" value={promotionId} onChange={(e) => setPromotionId(e.target.value)}>
            <option value="">Automatic first active discount</option>
            {offers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="font-normal text-stone-500">A linked active offer supplies the discount headline and countdown. Otherwise your headline appears.</span>
        </label>}
        <label className="flex items-center gap-2"><input type="checkbox" name="isVisible" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show card</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Show from (Manila time)<input type="datetime-local" name="startAt" defaultValue={dateInput(card.startAt)} className="rounded-lg border px-3 py-2" /></label>
          <label className="grid gap-1">Show until (Manila time)<input type="datetime-local" name="endAt" defaultValue={dateInput(card.endAt)} className="rounded-lg border px-3 py-2" /></label>
        </div>
        <button type="submit" className="w-fit rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">Publish card</button>
      </form>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-500">Preview {visible ? "" : "(hidden on storefront)"}</p>
        <div className={`min-h-64 rounded-3xl p-7 shadow-sm ${bg}`}>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">{form.eyebrow}</p>
          <h3 className="mt-3 font-display text-3xl font-semibold leading-tight">{previewHeadline}</h3>
          <p className="mt-2 text-sm opacity-75">{form.description}</p>
          <span className={`mt-5 inline-block rounded-full px-4 py-2 text-sm font-semibold ${form.theme === "light" ? "bg-emerald-700 text-white" : "bg-white text-stone-900"}`}>{form.buttonText}</span>
          {!flash && form.asideText && <span className="ml-3 text-xs opacity-60">{form.asideText}</span>}
        </div>
      </div>
    </div>
  </section>;
}

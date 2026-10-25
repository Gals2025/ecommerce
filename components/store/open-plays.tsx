import { CalendarDays, Clock3, MapPin, ArrowUpRight, QrCode } from "lucide-react";
import { safeUrl, type Showcase } from "@/features/open-plays";
export function OpenPlaysShowcase({ data }: { data: Showcase }) {
 if (!data.visible) return null;
 const sessions = data.sessions.filter(s => s.visible && s.date && s.date >= new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Manila"})).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
 const clubUrl = safeUrl(data.reclubUrl);
 return <section className="mt-10 overflow-hidden rounded-3xl bg-stone-950 text-white shadow-soft">
  <div className="grid lg:grid-cols-[1fr_1.15fr]">
   <div className="bg-gradient-to-br from-stone-950 via-stone-900 to-emerald-950 p-7 sm:p-10">
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300"><CalendarDays className="h-4 w-4"/>{data.eyebrow}</p>
    <h2 className="mt-5 font-display text-4xl font-semibold leading-tight sm:text-5xl">{data.headline}</h2>
    <p className="mt-4 max-w-lg text-stone-300">{data.description}</p>
    {clubUrl ? <a href={clubUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-500">{data.buttonText}<ArrowUpRight className="h-4 w-4"/></a> : <span className="mt-6 inline-block rounded-full border border-white/20 px-6 py-3 text-sm text-stone-400">Reclub link coming soon</span>}
   </div>
   <div className="p-6 sm:p-8"><h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-emerald-300"><CalendarDays className="h-5 w-5"/>Upcoming open plays</h3>
    <div className="mt-5 space-y-3">{sessions.length ? sessions.map((s,i)=>{
     const url=safeUrl(s.url);
     return <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{s.title}</p><p className="mt-1 text-xs text-emerald-300">{s.date} · {s.level}</p><p className="mt-2 flex items-center gap-2 text-sm text-stone-300"><Clock3 className="h-4 w-4"/>{s.time}</p><p className="mt-1 flex items-center gap-2 text-sm text-stone-300"><MapPin className="h-4 w-4"/>{s.venue}</p></div>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`View ${s.title} on Reclub`} className="rounded-full border border-emerald-500/40 p-3 text-emerald-300"><ArrowUpRight className="h-5 w-5"/></a> : <span className="text-xs text-stone-500">Link soon</span>}</div>
     </div>}) : <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-stone-300">New open play schedules coming soon. Check back for upcoming games!</p>}</div>
    <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-stone-400">{data.qrImageUrl ? <><img src={data.qrImageUrl} alt="Scan PickleUNLTD Reclub QR code" className="h-28 w-28 rounded-lg bg-white object-contain p-2"/><span>Scan to view Reclub schedules</span></> : <><QrCode className="h-7 w-7"/>Reclub QR code coming soon.</>}</div>
   </div>
  </div>
 </section>;
}

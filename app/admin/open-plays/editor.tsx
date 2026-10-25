"use client";
import { useState, useTransition } from "react";
import { publishOpenPlays, saveOpenPlays } from "./actions";
import type { Showcase, Session } from "@/features/open-plays";

const blank: Session = { title: "", date: "", time: "", venue: "", level: "All levels", url: "", visible: false };
export function OpenPlaysEditor({ initial }: { initial: Showcase }) {
 const [data, setData] = useState(initial);
 const [busy, start] = useTransition();
 const [message, setMessage] = useState("");
 const [uploading, setUploading] = useState(false);
 async function upload(file: File) { setUploading(true); setMessage(""); try { const form = new FormData(); form.set("file",file); const response = await fetch("/api/admin/open-plays/qr",{method:"POST",body:form}); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Upload failed"); setData(d=>({...d,qrImageUrl:result.url})); setMessage("QR uploaded. Save draft and publish to display it."); } catch(e) {setMessage(String(e));} finally {setUploading(false);} }
 const field = (key: keyof Omit<Showcase,"sessions"|"visible"|"qrImageUrl">, label: string) => <label className="block text-sm font-medium">{label}<input className="mt-1 w-full rounded-lg border p-2" value={data[key]} onChange={e => setData(d => ({ ...d, [key]: e.target.value }))}/></label>;
 const updateSession = (index: number, patch: Partial<Session>) => setData(d => ({ ...d, sessions: d.sessions.map((s,i) => i === index ? {...s,...patch} : s) }));
 function save() { start(async () => { try { const f = new FormData(); f.set("payload",JSON.stringify(data)); await saveOpenPlays(f); setMessage("Draft saved. Publish separately to update the storefront."); } catch(e) { setMessage(String(e)); } }); }
 function publish() { start(async () => { try { await publishOpenPlays(); setMessage("Saved draft published."); } catch(e) { setMessage(String(e)); } }); }
 return <div className="space-y-6">
  <div className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
   {field("eyebrow","Eyebrow")}{field("headline","Headline")}{field("description","Description")}
   {field("buttonText","Button label")}{field("reclubUrl","Reclub club/schedule URL (leave blank until available)")}
   <label className="flex items-center gap-2"><input type="checkbox" checked={data.visible} onChange={e=>setData(d=>({...d,visible:e.target.checked}))}/>Show section on homepage</label>
  </div>
  <div className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Reclub QR image</h2><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file) void upload(file);}} />{uploading && <p>Uploading...</p>}{data.qrImageUrl && <div className="space-y-2"><img src={data.qrImageUrl} alt="Uploaded Reclub QR preview" className="h-36 w-36 object-contain" /><button type="button" className="text-sm text-red-700" onClick={()=>setData(d=>({...d,qrImageUrl:""}))}>Remove QR</button></div>}<p className="text-xs text-stone-500">PNG, JPG, WebP · max 2MB. Save and publish separately.</p></div>
  <div className="space-y-3"><h2 className="text-lg font-semibold">Open play sessions</h2>
  {data.sessions.map((s,i)=><div key={i} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
   {(["title","date","time","venue","level","url"] as const).map(k=><label key={k} className="text-sm capitalize">{k}<input type={k==="date"?"date":"text"} className="mt-1 w-full rounded border p-2" value={s[k]} onChange={e=>updateSession(i,{[k]:e.target.value})}/></label>)}
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.visible} onChange={e=>updateSession(i,{visible:e.target.checked})}/>Show session</label>
   <button type="button" className="text-left text-sm text-red-700" onClick={()=>setData(d=>({...d,sessions:d.sessions.filter((_,j)=>j!==i)}))}>Remove session</button>
  </div>)}
  <button type="button" className="rounded-lg border px-4 py-2" onClick={()=>setData(d=>({...d,sessions:[...d.sessions, {...blank}]}))}>+ Add session</button>
  </div>
  <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={save} className="rounded-lg bg-stone-900 px-5 py-3 text-white disabled:opacity-50">Save draft</button><button disabled={busy} onClick={publish} className="rounded-lg bg-emerald-700 px-5 py-3 text-white disabled:opacity-50">Publish saved draft</button></div>
  {message && <p role="status" className="text-sm">{message}</p>}
  <p className="text-xs text-stone-500">Save draft before publishing. Blank links show as unavailable; uploaded QR images appear after publishing.</p>
 </div>;
}

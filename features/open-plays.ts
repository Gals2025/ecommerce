import { db } from "@/db";
import { sql } from "drizzle-orm";

export type Session = { title: string; date: string; time: string; venue: string; level: string; url: string; visible: boolean };
export type Showcase = { eyebrow: string; headline: string; description: string; buttonText: string; reclubUrl: string; visible: boolean; sessions: Session[] };
export const defaults: Showcase = {
 eyebrow: "PICKLEUNLTD OPEN PLAYS", headline: "Find your next game.",
 description: "Meet new players, enjoy competitive rallies, and reserve your spot through Reclub.",
 buttonText: "View all schedules", reclubUrl: "", visible: true,
 sessions: []
};
export function normalize(value: unknown): Showcase {
 const v = value && typeof value === "object" ? value as Partial<Showcase> : {};
 return { ...defaults, ...v, sessions: Array.isArray(v.sessions) ? v.sessions.filter(s => s && typeof s === "object").slice(0, 20).map(s => ({
 title: String(s.title ?? "").slice(0, 120), date: String(s.date ?? ""), time: String(s.time ?? ""),
 venue: String(s.venue ?? "").slice(0, 180), level: String(s.level ?? "").slice(0, 60),
 url: String(s.url ?? ""), visible: s.visible === true
 })) : [] };
}
export function safeUrl(url: string): string | null {
 try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}
export async function readShowcase(): Promise<{ draft: Showcase; published: Showcase }> {
 const result = await db.execute(sql`SELECT draft, published FROM open_play_showcase WHERE id = 1`);
 const row = result.rows[0] as { draft?: unknown; published?: unknown } | undefined;
 return { draft: normalize(row?.draft), published: normalize(row?.published) };
}

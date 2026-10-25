import { PageGuard } from "@/components/admin/page-guard";
import { readShowcase } from "@/features/open-plays";
import { OpenPlaysEditor } from "./editor";
export const dynamic = "force-dynamic";
export default async function OpenPlaysAdmin() {
 let draft;
 try { draft = (await readShowcase()).draft; } catch {
  return <PageGuard permission="promotions.manage" page="/admin/open-plays"><div className="rounded-xl border bg-amber-50 p-6"><h1 className="font-semibold">Open Plays setup required</h1><p>Apply db/migrations/0016_open_plays.sql to the staging database, then refresh.</p></div></PageGuard>;
 }
 return <PageGuard permission="promotions.manage" page="/admin/open-plays"><div className="space-y-5"><h1 className="text-2xl font-semibold">Open Plays Manager</h1><p className="text-sm text-stone-600">Edit the homepage showcase, session schedules and Reclub links.</p><OpenPlaysEditor initial={draft}/></div></PageGuard>;
}

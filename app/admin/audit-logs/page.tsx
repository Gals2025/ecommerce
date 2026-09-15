import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { formatManila } from "@/lib/datetime";
import { PageGuard } from "@/components/admin/page-guard";
import { DbUnreachable } from "@/components/ui/empty-state";

export default async function AuditLogsPage() {
  let logs: typeof auditLogs.$inferSelect[] = [];
  try {
    logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  } catch {
    return <DbUnreachable />;
  }
  return (
    <PageGuard roles={["ADMIN", "SUPER_ADMIN"]} page="/admin/audit-logs">
    <div>
      <h1 className="text-xl font-bold">Audit Logs</h1>
      <div className="mt-4 space-y-1 text-sm">
        {logs.map((l) => (
          <div key={l.id} className="rounded border p-2">
            <span className="font-medium">{l.action}</span> • {l.entity} {l.entityId.slice(0, 8)} •{" "}
            <span className="text-gray-500">{formatManila(l.createdAt)}</span>
          </div>
        ))}
        {logs.length === 0 && <p className="text-sm">No audit entries yet.</p>}
      </div>
    </div>
    </PageGuard>
  );
}

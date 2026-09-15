import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  diff?: unknown
) {
  await db.insert(auditLogs).values({
    actorId,
    action,
    entity,
    entityId,
    diff: diff ? JSON.stringify(diff) : null,
  });
}

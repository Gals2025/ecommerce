import { formatInTimeZone } from "date-fns-tz";

export const MANILA_TZ = "Asia/Manila";

export function formatManila(date: Date | string, fmt = "MMM d, yyyy h:mm a"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, MANILA_TZ, fmt);
}

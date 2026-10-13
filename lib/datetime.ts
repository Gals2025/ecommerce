import { formatInTimeZone } from "date-fns-tz";

export const MANILA_TZ = "Asia/Manila";

export function formatManila(date: Date | string | null | undefined, fmt = "MMM d, yyyy h:mm a"): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
    return formatInTimeZone(d, MANILA_TZ, fmt);
  } catch {
    // Never let a bad timestamp crash a Server Component render (React #441).
    return "—";
  }
}

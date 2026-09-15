import { formatInTimeZone } from "date-fns-tz";
import { MANILA_TZ } from "./datetime";

// Reporting conventions (single source). DB-free and unit-tested —
// features/dashboard + features/reports execute these, never reimplement.

/** Revenue counts money actually received: paid/partially_paid payments or
 * completed orders. Cancelled/refunded orders never count (refunds are
 * subtracted separately, so including refunded orders would double-count). */
export function isRevenueOrder(o: { status: string; paymentStatus?: string | null }): boolean {
  if (o.status === "cancelled" || o.status === "refunded") return false;
  if (o.status === "completed") return true;
  return o.paymentStatus === "paid" || o.paymentStatus === "partially_paid";
}

/** Revenue = paid-family grand totals minus completed refunds. */
export function revenueOf(
  orders: { status: string; paymentStatus?: string | null; grandTotal: number }[],
  refunds: { amount: number; status: string }[]
): number {
  const gross = orders.filter(isRevenueOrder).reduce((s, o) => s + o.grandTotal, 0);
  const refunded = refunds.filter((r) => r.status === "completed").reduce((s, r) => s + r.amount, 0);
  return Math.max(0, gross - refunded);
}

export type Bucket = "day" | "week" | "month";

function manilaParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** Monday (Manila) starting the week containing d, as YYYY-MM-DD. */
export function manilaWeekStart(d: Date): string {
  // Weekday in Manila: 0=Sunday..6=Saturday via en-US short weekday is locale-fragile;
  // compute from UTC-of-Manila-midnight arithmetic instead.
  const { y, m, day } = manilaParts(d);
  const manilaMidnightUTC = Date.UTC(y, m - 1, day, -8, 0, 0); // +08:00 offset
  // Weekday of the Manila calendar date (NOT the UTC instant's weekday).
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const back = (dow + 6) % 7; // days since Monday
  const monday = new Date(manilaMidnightUTC - back * 86400000);
  return formatInTimeZone(monday, MANILA_TZ, "yyyy-MM-dd");
}

export function bucketKey(d: Date | string, bucket: Bucket): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (bucket === "day") return formatInTimeZone(date, MANILA_TZ, "yyyy-MM-dd");
  if (bucket === "week") return manilaWeekStart(date);
  return formatInTimeZone(date, MANILA_TZ, "yyyy-MM");
}

/** Fill every bucket between from..to (inclusive) so charts never gap. */
export function bucketRange(from: Date, to: Date, bucket: Bucket): string[] {
  const keys: string[] = [];
  if (bucket === "month") {
    const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cur <= end) {
      keys.push(bucketKey(cur, "month"));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return keys;
  }
  const dayMs = bucket === "week" ? 7 * 86400000 : 86400000;
  // Anchor on Manila calendar days.
  const f = manilaParts(from);
  const t = manilaParts(to);
  let cur = Date.UTC(f.y, f.m - 1, f.day);
  const end = Date.UTC(t.y, t.m - 1, t.day);
  while (cur <= end) {
    keys.push(bucketKey(new Date(cur + 8 * 3600000), bucket));
    cur += dayMs;
  }
  return [...new Set(keys)];
}

/** Low-stock rule: product threshold when set, else available ≤ 5. */
export function isLowStock(available: number, threshold: number | null | undefined): boolean {
  if (available <= 0) return false; // that is out-of-stock, counted separately
  return available <= (threshold ?? 5);
}

export function isOutOfStock(available: number): boolean {
  return available <= 0;
}

/** Manila day boundaries [start, end) as UTC instants for SQL filtering. */
export function manilaDayRange(date: Date): { start: Date; end: Date } {
  const { y, m, day } = manilaParts(date);
  const start = new Date(Date.UTC(y, m - 1, day, -8, 0, 0));
  return { start, end: new Date(start.getTime() + 86400000) };
}

/** Manila month boundaries [start, end) as UTC instants. */
export function manilaMonthRange(date: Date): { start: Date; end: Date } {
  const { y, m } = manilaParts(date);
  const start = new Date(Date.UTC(y, m - 1, 1, -8, 0, 0));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, -8, 0, 0));
  return { start, end };
}

/** Parse an optional YYYY-MM-DD filter date (Manila). Returns null when blank. */
export function parseFilterDate(v: string | undefined, endOfDay: boolean): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, -8, 0, 0));
  if (Number.isNaN(+start)) return null;
  return endOfDay ? new Date(start.getTime() + 86400000) : start;
}

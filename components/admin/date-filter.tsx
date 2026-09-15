import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { MANILA_TZ } from "@/lib/datetime";
import { parseFilterDate } from "@/lib/reports";

function manilaToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return formatInTimeZone(d, MANILA_TZ, "yyyy-MM-dd");
}

function monthStart(): string {
  const manila = formatInTimeZone(new Date(), MANILA_TZ, "yyyy-MM-dd");
  return manila.slice(0, 8) + "01";
}

/** GET date filter with presets + custom range. Preserves extra params. */
export function DateFilter({
  from,
  to,
  extra = {},
  showBucket = false,
  bucket,
}: {
  from: string;
  to: string;
  extra?: Record<string, string>;
  showBucket?: boolean;
  bucket?: string;
}) {
  const presets: { label: string; f: string; t: string }[] = [
    { label: "Today", f: manilaToday(), t: manilaToday(1) },
    { label: "7d", f: manilaToday(-6), t: manilaToday(1) },
    { label: "30d", f: manilaToday(-29), t: manilaToday(1) },
    { label: "Month", f: monthStart(), t: manilaToday(1) },
  ];
  const qs = (p: Record<string, string>) => "?" + new URLSearchParams({ ...extra, ...p }).toString();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 text-xs">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={qs({ from: p.f, to: p.t })}
            className={`rounded border px-2 py-1 hover:bg-gray-50 ${from === p.f && to === p.t ? "bg-black text-white" : ""}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form method="get" className="flex flex-wrap items-center gap-1 text-xs">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {showBucket && (
          <select name="bucket" defaultValue={bucket ?? "day"} className="rounded border px-2 py-1">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        )}
        <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" />
        <span>→</span>
        <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" />
        <button type="submit" className="rounded border px-2 py-1 hover:bg-gray-50">Apply</button>
      </form>
    </div>
  );
}

/** Resolve from/to params to a [from, to) range; defaults to last 30 Manila days. */
export function resolveRange(raw: Record<string, string | string[] | undefined>): {
  from: string;
  to: string;
  range: { from: Date; to: Date };
} {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const defTo = manilaToday(1);
  const defFrom = manilaToday(-29);
  const from = first(raw.from) || defFrom;
  const to = first(raw.to) || defTo;
  const f = parseFilterDate(from, false) ?? parseFilterDate(defFrom, false)!;
  const t = parseFilterDate(to, true) ?? parseFilterDate(defTo, true)!;
  return { from, to, range: { from: f, to: t } };
}

export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-stone-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

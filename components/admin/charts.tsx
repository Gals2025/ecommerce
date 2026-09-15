// Dependency-free SVG charts (server components, no client JS).

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = v / 10 ** exp;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export function VBar({
  data,
  format = (v: number) => String(v),
  height = 180,
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  height?: number;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="text-sm text-stone-500">No data for this period.</p>;
  }
  const W = 640;
  const H = height;
  const padL = 56;
  const padB = 28;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const bw = (W - padL) / data.length;
  const showEvery = Math.max(1, Math.ceil(data.length / 12));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {[0, 0.5, 1].map((f) => {
        const y = 8 + (1 - f) * (H - padB - 8);
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={W} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7280">
              {format(max * f)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 2 : 0, ((H - padB - 8) * d.value) / max);
        const x = padL + i * bw + bw * 0.2;
        return (
          <g key={i}>
            <title>{`${d.label}: ${format(d.value)}`}</title>
            <rect x={x} y={H - padB - h} width={Math.max(1, bw * 0.6)} height={h} rx={2} fill="#047857" />
            {i % showEvery === 0 && (
              <text x={x} y={H - 10} fontSize={10} fill="#78716c">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function HBar({
  data,
  format = (v: number) => String(v),
  sub,
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  sub?: (i: number) => string | null;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="text-sm text-stone-500">No data for this period.</p>;
  }
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  return (
    <ul className="space-y-1.5">
      {data.map((d, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{d.label}{sub?.(i) ? <span className="text-stone-500"> {sub(i)}</span> : null}</span>
            <span className="shrink-0 font-medium">{format(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-stone-100">
            <div className="h-full rounded bg-emerald-700" style={{ width: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DONUT_COLORS = ["#047857", "#059669", "#10b981", "#f59e0b", "#78716c", "#a8a29e", "#d6d3d1", "#065f46"];

export function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-sm text-stone-500">No data for this period.</p>;
  }
  const R = 54;
  const C = 2 * Math.PI * R;
  const segs = data.reduce(
    (out, d, i) => {
      const frac = total > 0 ? d.value / total : 0;
      const seg = { ...d, dash: frac * C, gap: C - frac * C, off: -out.acc * C, color: DONUT_COLORS[i % DONUT_COLORS.length] };
      return { acc: out.acc + frac, segs: [...out.segs, seg] };
    },
    { acc: 0, segs: [] as ({ label: string; value: number; dash: number; gap: number; off: number; color: string })[] }
  ).segs;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img">
        <circle cx={70} cy={70} r={R} fill="none" stroke="#f3f4f6" strokeWidth={18} />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={70}
            cy={70}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={18}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={s.off}
            transform="rotate(-90 70 70)"
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        ))}
        <text x={70} y={70} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={700}>
          {total}
        </text>
      </svg>
      <ul className="space-y-1 text-sm">
        {segs.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

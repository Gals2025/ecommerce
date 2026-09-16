"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    h: String(Math.floor(s / 3600)).padStart(2, "0"),
    m: String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    s: String(s % 60).padStart(2, "0"),
  };
}

/** Live countdown to a promo end time. Renders nothing once expired. */
export function FlashCountdown({ endAt }: { endAt: Date }) {
  const target = endAt.getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (target - now <= 0) return null;
  const p = parts(target - now);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-black/40 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums" aria-label="Sale ends in">
      {p.h}:{p.m}:{p.s}
    </span>
  );
}

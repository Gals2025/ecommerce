"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | null>) =>
    start(() => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page"); // reset pagination on filter change
      router.push(`${pathname}?${next.toString()}`);
    });
  return { set, pending, params };
}

export function SearchInput({ placeholder = "Search…" }: { placeholder?: string }) {
  const { set, params } = useQueryUpdater();
  return (
    <input
      type="search"
      defaultValue={params.get("q") ?? ""}
      placeholder={placeholder}
      aria-label="Search"
      onChange={(e) => set({ q: e.target.value })}
      className="w-full rounded-md border px-3 py-2 text-sm sm:max-w-xs"
    />
  );
}

export function FilterBar({
  name,
  options,
  label,
}: {
  name: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  const { set, params } = useQueryUpdater();
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={params.get(name) ?? ""}
        onChange={(e) => set({ [name]: e.target.value || null })}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function DateRangeFilter() {
  const { set, params } = useQueryUpdater();
  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        aria-label="From date"
        defaultValue={params.get("from") ?? ""}
        onChange={(e) => set({ from: e.target.value || null })}
        className="rounded-md border px-2 py-2 text-sm"
      />
      <span className="text-gray-400">→</span>
      <input
        type="date"
        aria-label="To date"
        defaultValue={params.get("to") ?? ""}
        onChange={(e) => set({ to: e.target.value || null })}
        className="rounded-md border px-2 py-2 text-sm"
      />
    </div>
  );
}

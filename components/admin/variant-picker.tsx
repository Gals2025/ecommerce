"use client";
import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { StockOption } from "./receiving-form";

const RENDER_LIMIT = 100;

function optionLabel(v: StockOption) {
  return `${v.productName} — ${v.sku}`;
}

export function VariantPicker({
  variants,
  value,
  onChange,
  placeholder = "Search product or SKU…",
  disabled = false,
}: {
  variants: StockOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = variants.find((v) => v.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter(
      (v) =>
        v.productName.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        `${v.productName} ${v.sku}`.toLowerCase().includes(q)
    );
  }, [variants, query]);

  const visible = filtered.slice(0, RENDER_LIMIT);
  const hiddenCount = filtered.length - visible.length;

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative font-normal">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <Input
          ref={inputRef}
          role="combobox"
          aria-label="Variant"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={visible.length > 0 ? `${listId}-${visible[Math.min(highlight, visible.length - 1)]?.id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={selected && !open ? optionLabel(selected) : placeholder}
          value={open ? query : selected ? optionLabel(selected) : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlight(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
            // Typing after a selection starts a new search.
            if (value) onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, Math.max(visible.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (open && visible.length > 0) {
                e.preventDefault();
                pick(visible[Math.min(highlight, visible.length - 1)].id);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          onBlur={() => setOpen(false)}
          className="pr-8 pl-9"
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="Clear selected variant"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <p className="border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-500" aria-live="polite">
            {filtered.length === 0
              ? "No variants match"
              : `${filtered.length} of ${variants.length} variant${variants.length === 1 ? "" : "s"}`}
          </p>
          {visible.length === 0 ? (
            <p className="px-3 py-3 text-sm text-stone-500">No variants match “{query.trim()}”. Try a product name or SKU.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Variants" className="max-h-60 overflow-auto py-1">
              {visible.map((v, i) => (
                <li key={v.id} id={`${listId}-${v.id}`} role="option" aria-selected={v.id === value}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(v.id)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full flex-col px-3 py-1.5 text-left text-sm",
                      i === highlight ? "bg-emerald-50" : "bg-white"
                    )}
                  >
                    <span className="font-medium text-stone-900">{v.productName}</span>
                    <span className="text-xs text-stone-500">{v.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <p className="border-t border-stone-100 px-3 py-1.5 text-[11px] text-stone-500">
              +{hiddenCount} more — keep typing to narrow down
            </p>
          )}
        </div>
      )}
    </div>
  );
}

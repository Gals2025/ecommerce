"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

export function ImageUploader({
  kind = "products",
  images,
  onChange,
  max = 10,
  label = "Images",
}: {
  kind?: "products" | "categories" | "brands" | "variants";
  images: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= max) break;
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        const res = await fetch("/api/admin/catalog/upload", { method: "POST", body: form });
        const body = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !body.url) throw new Error(body.error ?? "Upload failed");
        next.push(body.url);
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...images];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label} ({images.length}/{max})</div>
      {images.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {images.map((url, i) => (
            <div key={url} className="relative rounded border p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Image ${i + 1}`} className="h-24 w-full rounded object-cover" />
              <div className="mt-1 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <Button type="button" variant="utility" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">←</Button>
                  <Button type="button" variant="utility" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move right">→</Button>
                </div>
                <Button
                  type="button"
                  variant="utilityDanger"
                  onClick={() => onChange(images.filter((_, k) => k !== i))}
                >
                  Remove
                </Button>
              </div>
              {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-emerald-700/90 px-1.5 text-[10px] font-medium text-white">Cover</span>}
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={max > 1}
        disabled={uploading || images.length >= max}
        onChange={(e) => handleFiles(e.target.files)}
        className="text-sm"
      />
      {uploading && <p className="mt-1 text-xs text-gray-500">Uploading to Vercel Blob…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">JPG/PNG/WebP/GIF, max 4MB each. First image is the cover.</p>
    </div>
  );
}

export function SingleImageField({
  kind,
  value,
  onChange,
  label,
}: {
  kind: "categories" | "brands" | "variants";
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch("/api/admin/catalog/upload", { method: "POST", body: form });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Upload failed");
      onChange(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}</div>
      {value && (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-16 w-16 rounded border object-cover" />
          <Button type="button" variant="utilityDanger" onClick={() => onChange(null)}>Remove</Button>
        </div>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={uploading}
        onChange={(e) => handle(e.target.files?.[0])}
        className="text-sm"
      />
      {uploading && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function FormButtons({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
    </div>
  );
}

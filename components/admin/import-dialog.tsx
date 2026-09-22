"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type PreviewGroup = {
  product: string;
  rows: number[];
  ok: boolean;
  errors: string[];
  newBrands: string[];
  newCategories: string[];
  stock: number;
};

type PreviewData = {
  mode: "new" | "update";
  totalRows: number;
  groups: PreviewGroup[];
  summary: { products: number; valid: number; invalid: number; newBrands: string[]; newCategories: string[] };
};

type ConfirmResult = {
  product: string;
  rows: number[];
  ok: boolean;
  errors: string[];
};

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "update">("new");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number; results: ConfirmResult[] } | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
  }

  async function runPreview(f: File, m: "new" | "update") {
    setBusy("preview");
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("mode", m);
      fd.set("file", f);
      const res = await fetch("/api/admin/imports/products/preview", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Preview failed");
      setPreview(json as PreviewData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function runConfirm() {
    if (!file || !preview) return;
    setBusy("confirm");
    setError("");
    try {
      const fd = new FormData();
      fd.set("mode", preview.mode);
      fd.set("file", file);
      const res = await fetch("/api/admin/imports/products/confirm", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult({ imported: json.summary.imported, failed: json.summary.failed, results: json.results });
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { reset(); setOpen(true); }}>
        Import
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setOpen(false)} />
          <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Import products</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded border px-2 py-1 text-sm">✕</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <a href="/api/admin/imports/template?format=csv" className="underline">Download CSV template</a>
              <a href="/api/admin/imports/template?format=xlsx" className="underline">Download Excel template</a>
            </div>

            <div className="mt-3 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="import-mode" checked={mode === "new"} onChange={() => { setMode("new"); setPreview(null); setResult(null); }} />
                New entries
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="import-mode" checked={mode === "update"} onChange={() => { setMode("update"); setPreview(null); setResult(null); }} />
                Update existing
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {mode === "new"
                ? "Creates products. Existing SKUs are rejected. Stock adds an opening receipt."
                : "Matches by SKU and updates fields. Missing variants are kept; stock is untouched."}
            </p>

            <div className="mt-3">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setPreview(null);
                  setResult(null);
                  setError("");
                  if (f) runPreview(f, mode);
                }}
              />
            </div>

            {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}

            {busy === "preview" && <p className="mt-2 text-sm text-gray-500">Validating…</p>}

            {preview && (
              <div className="mt-3">
                <p className="text-sm">
                  {preview.summary.valid} of {preview.summary.products} products valid
                  {" • "}{preview.totalRows} rows
                  {(preview.summary.newBrands.length > 0 || preview.summary.newCategories.length > 0) && (
                    <span className="text-gray-600">
                      {" • will create: "}
                      {[...preview.summary.newBrands.map((b) => `brand ${b}`), ...preview.summary.newCategories.map((c) => `category ${c}`)].join(", ")}
                    </span>
                  )}
                </p>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {preview.groups.map((g) => (
                    <div key={g.product} className={`rounded border p-2 ${g.ok ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                      <div className="font-medium">{g.product} <span className="font-normal text-gray-500">rows {g.rows.join(", ")}</span></div>
                      {!g.ok && (
                        <ul className="mt-1 whitespace-pre-line text-xs text-red-700">
                          {g.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button disabled={busy != null || preview.summary.valid === 0} onClick={runConfirm}>
                    {busy === "confirm" ? "Importing…" : `Confirm import (${preview.summary.valid})`}
                  </Button>
                  <Button variant="secondary" onClick={() => inputRef.current?.click()}>Choose different file</Button>
                </div>
              </div>
            )}

            {result && (
              <div className="mt-3 text-sm">
                <p><span className="font-medium text-green-700">{result.imported} imported</span>{result.failed > 0 && <span className="text-red-700"> • {result.failed} failed</span>}</p>
                {result.failed > 0 && (
                  <ul className="mt-1 space-y-1">
                    {result.results.filter((r) => !r.ok).map((r) => (
                      <li key={r.product} className="rounded border border-red-200 bg-red-50/50 p-2 text-xs">
                        <span className="font-medium">{r.product}</span>: {r.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => { reset(); setOpen(false); }}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";
import { useState } from "react";
import { Button } from "@/components/ui";

export function ExportButtons({ endpoint }: { endpoint: string }) {
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState("");

  async function download(format: "csv" | "xlsx") {
    setError("");
    setBusy(format);
    try {
      const res = await fetch(`${endpoint}?format=${format}`);
      if (!res.ok) throw new Error(res.status === 403 ? "Forbidden — export permission required." : "Export failed");
      const blob = await res.blob();
      const name =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `export.${format === "xlsx" ? "xlsx" : "csv"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (res.headers.get("x-export-capped")) {
        setError(`Capped at ${res.headers.get("x-export-capped")} newest rows.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={busy != null} onClick={() => download("csv")}>
        {busy === "csv" ? "Exporting…" : "Export CSV"}
      </Button>
      <Button variant="secondary" size="sm" disabled={busy != null} onClick={() => download("xlsx")}>
        {busy === "xlsx" ? "Exporting…" : "Export Excel"}
      </Button>
      {error && (
        <span className="text-xs text-red-600" role={error.startsWith("Capped") ? "status" : "alert"}>
          {error}
        </span>
      )}
    </div>
  );
}

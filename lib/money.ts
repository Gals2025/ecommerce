// Philippine Peso helpers. Store money as INTEGER centavos in DB.
// Total function: never throws — renders "—" for null/NaN/Infinity so a
// single bad price value can't crash a Server Component render (React #441).
export function formatPHP(centavos: number | null | undefined): string {
  if (typeof centavos !== "number" || !Number.isFinite(centavos)) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

export function pesosToCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function centavosToPesos(centavos: number): number {
  return centavos / 100;
}

import { cn } from "@/lib/cn";

const tones: Record<string, string> = {
  gray: "bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200",
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  yellow: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200",
};

export function Badge({ tone = "gray", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />
  );
}

// Maps domain statuses to tones in one place.
export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    ["confirmed", "paid", "completed", "delivered", "fulfilled", "verified", "active", "ready", "approved"].includes(s)
      ? "green"
      : ["pending", "awaiting_payment", "payment_verification", "pending_verification", "submitted", "requested", "processing", "unfulfilled", "unpaid"].includes(s)
        ? "yellow"
        : ["rejected", "cancelled", "failed"].includes(s)
          ? "red"
          : ["shipped", "ready_for_pickup"].includes(s)
            ? "blue"
            : "gray";
  return <Badge tone={tone as keyof typeof tones}>{status}</Badge>;
}

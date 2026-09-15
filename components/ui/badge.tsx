import { cn } from "@/lib/cn";

const tones: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
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

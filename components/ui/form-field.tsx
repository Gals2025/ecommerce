import { cn } from "@/lib/cn";

export function FormField({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="font-medium text-stone-800">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}

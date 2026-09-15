export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center shadow-soft">
      <p className="font-display text-lg font-semibold text-stone-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shared database-failure state: replaces the ad-hoc "DB not connected" divs. */
export function DbUnreachable() {
  return (
    <EmptyState
      title="Database not connected"
      description="Check DATABASE_URL, then run db:push and db:seed to populate data."
    />
  );
}

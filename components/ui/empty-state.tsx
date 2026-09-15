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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>}
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

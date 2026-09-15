import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export function StubPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        title={`${title} module is next`}
        description="This section's full management UI lands in its build phase. Data model and services are already in place."
      />
    </div>
  );
}

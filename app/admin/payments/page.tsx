import { PageGuard } from "@/components/admin/page-guard";
import { StubPage } from "@/components/admin/stub-page";

export default function PaymentsPage() {
  return (<PageGuard permission="orders.verify_payment" page="/admin/payments"><StubPage title="Payments" description="Verify GCash manual / bank transfer receipts and track COD / pay-at-store collection." /></PageGuard>);
}

import { getPosCatalog } from "@/actions/pos";
import { PageGuard } from "@/components/admin/page-guard";
import { PageHeader } from "@/components/admin/page-header";
import { PosRegister } from "./register";

export const dynamic = "force-dynamic";

async function Register() {
  let catalog: Awaited<ReturnType<typeof getPosCatalog>>;
  try {
    catalog = await getPosCatalog();
  } catch {
    return <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">The POS catalog could not be loaded. Check your connection and reload this page.</p>;
  }
  return <PosRegister catalog={catalog} />;
}

export default function PosPage() {
  return <PageGuard permission="orders.pos" page="/admin/pos"><PageHeader title="Point of sale" description="Record paid, in-store sales. Stock is deducted from the selected location." /><Register /></PageGuard>;
}

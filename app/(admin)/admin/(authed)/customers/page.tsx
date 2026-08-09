import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminCustomers } from "@/lib/admin/customers";
import { CustomersScreen } from "./_components/customers-screen";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };

export default async function CustomersPage() {
  await requireSection("customers");
  const page = await listAdminCustomers({});
  return <CustomersScreen initialPage={page} />;
}

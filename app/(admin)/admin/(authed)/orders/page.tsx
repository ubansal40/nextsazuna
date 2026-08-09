import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminOrders } from "@/lib/admin/orders";
import { listOrderStatuses } from "@/lib/admin/order-statuses";
import { OrdersScreen } from "./_components/orders-screen";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

export default async function OrdersPage() {
  await requireSection("orders");
  const [page, statuses] = await Promise.all([listAdminOrders({}), listOrderStatuses()]);
  return <OrdersScreen initialPage={page} initialStatuses={statuses} />;
}

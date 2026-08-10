import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminOrders, type AdminOrderFilters } from "@/lib/admin/orders";
import { listOrderStatuses } from "@/lib/admin/order-statuses";
import { OrdersScreen } from "./_components/orders-screen";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

/**
 * The list's filters live in the query string, the way the audit log's do.
 *
 * A row links to the order with a plain anchor, so the screen unmounts and comes
 * back from a fresh server render — anything held only in `useState` is gone by
 * then, and an admin working a filtered queue was dumped back on an unfiltered
 * page-one every time they opened an order. The screen mirrors its filters into
 * the URL as it goes; this is the half that reads them back.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; payment?: string; sort?: string; page?: string }>;
}) {
  await requireSection("orders");
  const { status, q, payment, sort, page: pageParam } = await searchParams;
  const filters: AdminOrderFilters = {
    status,
    search: q,
    paymentStatus: payment,
    sort,
    page: Number(pageParam) || 1,
  };
  const [page, statuses] = await Promise.all([listAdminOrders(filters), listOrderStatuses()]);
  return <OrdersScreen initialPage={page} initialStatuses={statuses} initialFilters={filters} />;
}

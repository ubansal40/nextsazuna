import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminOrders } from "@/lib/admin/orders";
import { listOrderStatuses } from "@/lib/admin/order-statuses";
import { filtersOf, type OrderQuery } from "./_components/order-filters";
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
export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrderQuery> }) {
  await requireSection("orders");
  const filters = filtersOf(await searchParams);
  const [page, statuses] = await Promise.all([listAdminOrders(filters), listOrderStatuses()]);
  return <OrdersScreen initialPage={page} initialStatuses={statuses} initialFilters={filters} />;
}

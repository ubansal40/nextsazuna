import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/admin/require";
import { getOrderDetail } from "@/lib/admin/order-detail";
import { listOrderStatuses } from "@/lib/admin/order-statuses";
import { OrderDetailScreen } from "./_components/order-detail-screen";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("orders");
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const [order, statuses] = await Promise.all([getOrderDetail(orderId), listOrderStatuses()]);
  if (!order) notFound();

  return <OrderDetailScreen initial={order} statuses={statuses} />;
}

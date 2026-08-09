"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listAdminOrders,
  setOrdersStatus,
  softDeleteOrders,
  type AdminOrderFilters,
  type AdminOrderPage,
} from "@/lib/admin/orders";
import {
  listOrderStatuses,
  createOrderStatus,
  updateOrderStatus,
  setDefaultOrderStatus,
  reorderOrderStatuses,
  deleteOrderStatus,
  type OrderStatusRow,
} from "@/lib/admin/order-statuses";

/**
 * Orders actions. Every one re-gates on `orders` — a layout guard runs before a
 * page, never before an action — and resolves to a discriminated result rather
 * than rejecting, so the client renders the message instead of a crash.
 */

export type OrdersResult = { ok: true; page: AdminOrderPage } | { ok: false; error: string };
export type StatusesResult = { ok: true; statuses: OrderStatusRow[] } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function loadOrdersAction(filters: AdminOrderFilters): Promise<OrdersResult> {
  await requireSection("orders");
  try {
    return { ok: true, page: await listAdminOrders(filters) };
  } catch (error) {
    console.error("[admin] orders list failed", error);
    return fail(error);
  }
}

export async function setOrdersStatusAction(
  orderIds: number[],
  statusKey: string,
  filters: AdminOrderFilters,
): Promise<OrdersResult> {
  const admin = await requireSection("orders");
  try {
    await setOrdersStatus(admin, orderIds, statusKey);
    return { ok: true, page: await listAdminOrders(filters) };
  } catch (error) {
    return fail(error);
  }
}

export async function softDeleteOrdersAction(
  orderIds: number[],
  filters: AdminOrderFilters,
): Promise<OrdersResult> {
  const admin = await requireSection("orders");
  try {
    await softDeleteOrders(admin, orderIds);
    return { ok: true, page: await listAdminOrders(filters) };
  } catch (error) {
    return fail(error);
  }
}

/* --- statuses -------------------------------------------------------------- */

export async function loadStatusesAction(): Promise<StatusesResult> {
  await requireSection("orders");
  try {
    return { ok: true, statuses: await listOrderStatuses() };
  } catch (error) {
    return fail(error);
  }
}

export async function createStatusAction(label: string, colour: string): Promise<StatusesResult> {
  const admin = await requireSection("orders");
  try {
    return { ok: true, statuses: await createOrderStatus(admin, { label, colour }) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateStatusAction(
  id: number,
  patch: { label?: string; colour?: string; customerVisible?: boolean },
): Promise<StatusesResult> {
  const admin = await requireSection("orders");
  try {
    return { ok: true, statuses: await updateOrderStatus(admin, id, patch) };
  } catch (error) {
    return fail(error);
  }
}

export async function setDefaultStatusAction(id: number): Promise<StatusesResult> {
  const admin = await requireSection("orders");
  try {
    return { ok: true, statuses: await setDefaultOrderStatus(admin, id) };
  } catch (error) {
    return fail(error);
  }
}

export async function reorderStatusesAction(orderedIds: number[]): Promise<StatusesResult> {
  const admin = await requireSection("orders");
  try {
    return { ok: true, statuses: await reorderOrderStatuses(admin, orderedIds) };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteStatusAction(id: number, reassignToKey: string): Promise<StatusesResult> {
  const admin = await requireSection("orders");
  try {
    return { ok: true, statuses: await deleteOrderStatus(admin, id, reassignToKey) };
  } catch (error) {
    return fail(error);
  }
}

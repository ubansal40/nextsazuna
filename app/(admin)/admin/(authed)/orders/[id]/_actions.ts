"use server";

import { requireSection } from "@/lib/admin/require";
import { setOrdersStatus } from "@/lib/admin/orders";
import {
  getOrderDetail,
  updateOrderItems,
  updateOrderCustomer,
  updateOrderPayment,
  applyOrderPromo,
  removeOrderPromo,
  addOrderNote,
  cancelOrder,
  type OrderDetail,
  type OrderLineInput,
  type OrderCustomerInput,
} from "@/lib/admin/order-detail";

/**
 * Order-detail actions.
 *
 * Every one re-gates on `orders`, and every one returns the freshly re-read
 * order rather than a bare ok. Each of these edits recomputes the totals, so
 * handing back the new state is the only way the screen can be trusted to show
 * what was actually stored instead of what the client hoped for.
 */

export type DetailResult = { ok: true; order: OrderDetail } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function reload(id: number): Promise<DetailResult> {
  const order = await getOrderDetail(id);
  return order ? { ok: true, order } : { ok: false, error: "That order no longer exists." };
}

export async function reloadOrderAction(id: number): Promise<DetailResult> {
  await requireSection("orders");
  return reload(id);
}

export async function saveItemsAction(id: number, lines: OrderLineInput[]): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await updateOrderItems(admin, id, lines);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function saveCustomerAction(id: number, input: OrderCustomerInput): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await updateOrderCustomer(admin, id, input);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function savePaymentAction(
  id: number,
  input: { paymentMethod: string; paymentStatus: string; discount: string },
): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await updateOrderPayment(admin, id, input);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function applyPromoAction(id: number, code: string): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await applyOrderPromo(admin, id, code);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function removePromoAction(id: number): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await removeOrderPromo(admin, id);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function addNoteAction(id: number, message: string): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await addOrderNote(admin, id, message);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function setDetailStatusAction(id: number, statusKey: string): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await setOrdersStatus(admin, [id], statusKey);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

export async function cancelOrderAction(id: number, reason: string, note: string): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    await cancelOrder(admin, id, reason, note);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

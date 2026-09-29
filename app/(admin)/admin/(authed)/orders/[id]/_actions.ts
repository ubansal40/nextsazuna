"use server";

import { requireSection } from "@/lib/admin/require";
import { cancelOrders, setOrdersStatus } from "@/lib/admin/orders";
import {
  getOrderDetail,
  updateOrderItems,
  updateOrderCustomer,
  updateOrderPayment,
  applyOrderPromo,
  removeOrderPromo,
  addOrderNote,
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
 *
 * `notice` carries what an edit did that the admin did not directly ask for —
 * a promo that came off, a discount cut to a smaller subtotal — so the screen
 * can say it out loud rather than leave a changed total to be noticed.
 */

export type DetailResult = { ok: true; order: OrderDetail; notice?: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function reload(id: number, notice?: string | null): Promise<DetailResult> {
  const order = await getOrderDetail(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  return notice ? { ok: true, order, notice } : { ok: true, order };
}

export async function reloadOrderAction(id: number): Promise<DetailResult> {
  await requireSection("orders");
  return reload(id);
}

export async function saveItemsAction(id: number, lines: OrderLineInput[]): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    return reload(id, await updateOrderItems(admin, id, lines));
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

/** `discount: null` — the field was not touched — leaves the stored discount,
 *  and any promo behind it, as it is. */
export async function savePaymentAction(
  id: number,
  input: { paymentMethod: string; paymentStatus: string; discount: string | null },
): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    return reload(id, await updateOrderPayment(admin, id, input));
  } catch (error) {
    return fail(error);
  }
}

export async function applyPromoAction(id: number, code: string): Promise<DetailResult> {
  const admin = await requireSection("orders");
  try {
    return reload(id, await applyOrderPromo(admin, id, code));
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
    await cancelOrders(admin, [id], reason, note);
    return reload(id);
  } catch (error) {
    return fail(error);
  }
}

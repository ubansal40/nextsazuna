"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listAdminCustomers,
  getCustomerDetail,
  updateCustomerProfile,
  type AdminCustomerFilters,
  type AdminCustomerPage,
  type CustomerDetail,
  type CustomerProfileInput,
} from "@/lib/admin/customers";

/**
 * Customer actions.
 *
 * Every one re-gates on `customers`. The layout guard runs before a *page*, not
 * before an action, so an action that trusted it would be reachable by anyone
 * with a session — the gate has to be here, on each entry point, deny-by-default.
 *
 * They resolve to a discriminated result rather than rejecting, so the client
 * renders the message instead of an unhandled rejection. The detail goes to
 * `console.error` server-side; what crosses to the browser is a sentence, never
 * a driver error with a query in it.
 */

export type CustomersResult = { ok: true; page: AdminCustomerPage } | { ok: false; error: string };
export type CustomerResult = { ok: true; customer: CustomerDetail } | { ok: false; error: string };
export type CustomerSaveResult =
  | { ok: true; customer: CustomerDetail; page: AdminCustomerPage }
  | { ok: false; error: string };

/** Errors this code raises deliberately carry a message meant for a human; an
 *  unexpected throw does not, and must not be relayed. */
function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function loadCustomersAction(filters: AdminCustomerFilters): Promise<CustomersResult> {
  await requireSection("customers");
  try {
    return { ok: true, page: await listAdminCustomers(filters) };
  } catch (error) {
    console.error("[admin] customers list failed", error);
    return fail(error);
  }
}

export async function loadCustomerAction(id: number): Promise<CustomerResult> {
  await requireSection("customers");
  try {
    const customer = await getCustomerDetail(id);
    if (!customer) return { ok: false, error: "That customer no longer exists." };
    return { ok: true, customer };
  } catch (error) {
    console.error("[admin] customer detail failed", error);
    return fail(error);
  }
}

/**
 * Save part of a profile.
 *
 * The patch is partial by design — the drawer's sections save independently, so
 * an open address editor cannot overwrite the personal details beside it. What
 * a patch may contain is decided by `EDITABLE_FIELDS` in the data layer, not by
 * what the client sends; `phone` is not among them.
 *
 * The list is re-read alongside the profile because name and email are columns
 * on it, and a row that still shows the old name after a save is a bug the user
 * discovers by not trusting the screen.
 */
export async function saveCustomerProfileAction(
  id: number,
  patch: Partial<CustomerProfileInput>,
  filters: AdminCustomerFilters,
): Promise<CustomerSaveResult> {
  const admin = await requireSection("customers");
  try {
    await updateCustomerProfile(admin, id, patch);
    const [customer, page] = await Promise.all([getCustomerDetail(id), listAdminCustomers(filters)]);
    if (!customer) return { ok: false, error: "That customer no longer exists." };
    return { ok: true, customer, page };
  } catch (error) {
    console.error("[admin] customer save failed", error);
    return fail(error);
  }
}

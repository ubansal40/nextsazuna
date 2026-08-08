import "server-only";

import { redirect } from "next/navigation";
import type { CustomerRow } from "../customer-projection";
import { currentCustomer } from "./session";

/**
 * The signed-in customer, or a redirect home.
 *
 * Every `/account/*` page begins with this. There is no sign-in page to send
 * anyone to — the panel lives in the header on every route — so an unauthorised
 * visit goes to the homepage rather than a route that does not exist.
 *
 * Deliberately not middleware. Middleware runs before the route and would need
 * its own database access to tell a live session from a stale cookie; doing it
 * in the page means one lookup, already needed to render, and no second place
 * where the rule could drift.
 */
export async function requireCustomer(): Promise<CustomerRow> {
  const customer = await currentCustomer();
  if (!customer) redirect("/");
  return customer;
}

import type { AdminOrderFilters } from "@/lib/admin/orders";

/**
 * The orders list's filters ⇄ its query string.
 *
 * No directive, so the page (which renders from the URL) and the screen (which
 * writes the URL, and follows it when someone else changes it) share one
 * reading of it — two copies would drift, and a URL the page reads one way and
 * the screen another is a list that shows something other than what it says.
 */

/** What the URL carries. Values arrive as strings, or not at all. */
export interface OrderQuery {
  status?: string;
  q?: string;
  payment?: string;
  sort?: string;
  page?: string;
}

export function filtersOf(query: OrderQuery): AdminOrderFilters {
  return {
    status: query.status,
    search: query.q,
    paymentStatus: query.payment,
    sort: query.sort,
    page: Number(query.page) || 1,
  };
}

/**
 * The filters, as the URL carries them. Defaults are omitted rather than
 * written, so the common case is a bare `/admin/orders` and the query string
 * only ever names what was actually chosen.
 */
export function queryOf(filters: AdminOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("q", filters.search);
  if (filters.paymentStatus && filters.paymentStatus !== "all") params.set("payment", filters.paymentStatus);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

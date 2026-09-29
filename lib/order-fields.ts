/**
 * The widths of the `orders` columns the checkout's fields land in.
 *
 * Shared by the checkout form (as `maxLength`) and by `placeOrder`, which
 * refuses anything longer. Under the strict SQL mode MariaDB runs by default,
 * one character over a column is ER_DATA_TOO_LONG, and that used to surface as
 * "Payment didn't go through" — a lost sale for a long address.
 *
 * Pure and client-safe: no `server-only`, no database.
 */
export const ORDER_FIELD_LIMITS = {
  name: 120,
  address: 255,
  phone: 30,
  email: 190,
} as const;

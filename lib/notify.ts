import "server-only";

import { execute, queryOne } from "./db";
import { normalisePhone } from "./order-lookup";
import type { RowDataPacket } from "mysql2";

/**
 * Back-in-stock waiting list.
 *
 * Writes to `notify_requests`, the same table the Express admin reads, so a
 * request raised here shows up in the existing back-office without a migration.
 */

export type NotifyOutcome = "created" | "already";

export interface NotifyInput {
  productId: number;
  productSlug: string;
  name?: string;
  /** Either a phone number or an email address — whichever the reader gave. */
  contact: string;
  userAgent?: string;
}

interface ExistingRow extends RowDataPacket {
  id: number;
}

/**
 * Split one free-text field into the phone and email columns the table keeps.
 *
 * The form asks for "phone or email" because asking for both is friction on a
 * waiting list; the storage is two columns because that is what the admin and
 * the eventual notifier query on.
 */
function splitContact(contact: string): { phone: string | null; email: string | null } {
  const value = contact.trim();
  if (value.includes("@")) return { phone: null, email: value.toLowerCase() };
  // The same ten digits however they were typed — "+977 980-…" and "980…"
  // used to be stored as two numbers, so one reader was queued, and would have
  // been messaged, twice. The rule is the one orders and sign-in use.
  const digits = normalisePhone(value);
  return { phone: digits || null, email: null };
}

/** Loose validity check — enough to reject a typo, not to police formats. */
export function isValidContact(contact: string): boolean {
  const value = contact.trim();
  if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  return value.replace(/\D/g, "").length >= 7;
}

export async function requestStockNotification(input: NotifyInput): Promise<NotifyOutcome> {
  const { phone, email } = splitContact(input.contact);
  if (!phone && !email) throw new Error("A phone number or email address is required");

  // One waiting entry per contact per product. Without this, a reader who taps
  // the button twice is queued twice and gets notified twice.
  const existing = await queryOne<ExistingRow>(
    `SELECT id FROM notify_requests
      WHERE product_id = ? AND status = 'waiting'
        AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?))
      LIMIT 1`,
    [input.productId, phone, phone, email, email],
  );
  if (existing) return "already";

  await execute(
    `INSERT INTO notify_requests
       (product_slug, product_id, phone, email, customer_name, source, status, user_agent)
     VALUES (?, ?, ?, ?, ?, 'pdp', 'waiting', ?)`,
    [
      input.productSlug,
      input.productId,
      // `phone` is NOT NULL with no default in the shared schema, so a request
      // left by email alone — NULL here — failed with ER_BAD_NULL_ERROR and the
      // reader got the error panel: half the waiting list could not be joined.
      // Empty is what "no phone" has to be in this table.
      phone ?? "",
      email,
      input.name?.trim() || null,
      input.userAgent?.slice(0, 255) ?? null,
    ],
  );

  return "created";
}

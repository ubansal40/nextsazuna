"use server";

import { revalidatePath } from "next/cache";
import { execute } from "@/lib/db";
import { currentCustomer } from "@/lib/auth/session";

export type SaveProfileResult = "saved" | "nothing" | "unauthorised" | "failed";

/**
 * Only a real calendar date.
 *
 * The regex alone would pass 2026-02-30, which either throws under strict
 * sql_mode or stores junk. Round-tripping through Date rejects the rollover.
 */
function nullableDate(value: string): string | null {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === text ? text : null;
}

/**
 * Fields a customer may edit about themselves.
 *
 * Deliberately narrower than the admin's CRM view, and the omissions are the
 * point:
 *
 *   - `phone` is the identity. Editing it here would let someone move their
 *     account onto a number they do not control, or onto someone else's.
 *   - `name` and `email` go on invoices and order emails, so they stay
 *     staff-trusted.
 *   - `loyalty_points` is a balance. Obviously not.
 *   - `notes` is staff-internal and is not even readable here.
 *
 * Column names come from this object's own keys, never from the request, so a
 * crafted payload cannot reach a column that is not listed.
 */
const EDITABLE = {
  address_line1: (v: string) => v.slice(0, 255) || null,
  address_line2: (v: string) => v.slice(0, 255) || null,
  city: (v: string) => v.slice(0, 120) || null,
  state: (v: string) => v.slice(0, 120) || null,
  postal_code: (v: string) => v.slice(0, 30) || null,
  country: (v: string) => v.slice(0, 100) || null,
  dob: nullableDate,
  anniversary: nullableDate,
  ring_size: (v: string) => v.slice(0, 40) || null,
  bangle_size: (v: string) => v.slice(0, 40) || null,
} as const;

type ProfileField = keyof typeof EDITABLE;

export async function saveProfile(input: Record<string, string>): Promise<SaveProfileResult> {
  const customer = await currentCustomer();
  if (!customer) return "unauthorised";

  const sets: string[] = [];
  const values: (string | null)[] = [];

  for (const field of Object.keys(EDITABLE) as ProfileField[]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    sets.push(`${field} = ?`);
    values.push(EDITABLE[field](String(input[field] ?? "").trim()));
  }

  if (!sets.length) return "nothing";

  try {
    await execute(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, [
      ...values,
      customer.id,
    ]);
    revalidatePath("/account", "layout");
    return "saved";
  } catch (error) {
    console.error("[account] saving the profile failed", error);
    return "failed";
  }
}

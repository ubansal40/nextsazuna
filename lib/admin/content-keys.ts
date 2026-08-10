/**
 * Which content blocks the admin may edit — and, more importantly, which it
 * may not.
 *
 * `payment_methods` is absent on purpose. That block holds live gateway
 * credentials: a 256-character CyberSource secret key, Khalti keys, the eSewa
 * merchant code. `lib/content.ts` and `lib/payments/config.ts` both carry
 * standing warnings that the object must never reach a Client Component, which
 * would serialise the whole thing into the RSC payload.
 *
 * The reference app got this wrong and it is a confirmed HIGH finding in its
 * own audit: its content endpoints gate on "is an admin" alone, so a staffer
 * scoped to products can read the live keys and rewrite the eSewa merchant code
 * to point checkout at their own account.
 *
 * So the exclusion is a type, not a convention. Every read and write in
 * `lib/admin/content.ts` takes `EditableBlockKey`, never `string` — reaching
 * for `payment_methods` is a compile error rather than something a reviewer has
 * to notice. Gateway configuration stays in `lib/payments/config.ts`, where env
 * vars already override the block.
 *
 * Pure and free of `server-only` so `scripts/check-content.mts` can assert the
 * exclusion directly.
 */

export const EDITABLE_BLOCKS = [
  "homepage_layout",
  "announcement_bar",
  "site_identity",
  "category_intros",
] as const;

export type EditableBlockKey = (typeof EDITABLE_BLOCKS)[number];

export function isEditableBlock(key: string): key is EditableBlockKey {
  return (EDITABLE_BLOCKS as readonly string[]).includes(key);
}

/**
 * Product Picker shared constants — Sazuna Admin Product Picker.dc.html.
 *
 * A plain module (no `server-only`, no `"use server"`) so the page, the Server
 * Actions and the client screen can all agree on one set of numbers. A
 * `"use server"` file may only export async functions, which is why these do not
 * live in `_actions.ts`.
 */

/** The filter surface the picker exposes, in the shape the actions accept. */
export interface PickerFilters {
  q?: string;
  category?: string;
  tag?: number;
  material?: string;
  purity?: string;
  status?: "published" | "draft" | "";
  page?: number;
}

/**
 * Tiles per batch. The spec's `pShown` starts at 24 and steps by 24, which is
 * also a whole number of rows at every one of its grid widths (2 · 3 · 4).
 */
export const PICKER_PAGE_SIZE = 24;

/**
 * Spec `pkOver`. Above this the tray and the drawer carry an advisory — it does
 * not block anything, because the operator knows their customer better than we
 * do; it just says why a 30-photo message tends to arrive mangled.
 */
export const SELECTION_ADVICE_LIMIT = 20;

/**
 * Hard ceiling for ONE share or download batch.
 *
 * Not in the spec, which filters a demo catalogue in memory. Here "Select all"
 * can mean 2,585 pieces, and share/download fetch every image before they can
 * do anything — so without a ceiling the two buttons are a way to hang the
 * browser. Over the limit they refuse and say so rather than silently doing part
 * of the job.
 */
export const SELECTION_BATCH_MAX = 50;

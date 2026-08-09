"use server";

import { after } from "next/server";
import { requireSection } from "@/lib/admin/require";
import { drainImageJobs, getImageJobStates, retryImageJob, type ImageJobState } from "@/lib/admin/image-jobs";
import {
  listAdminProducts,
  setProductsVisibility,
  deleteProduct,
  type AdminProductFilters,
  type AdminProductPage,
} from "@/lib/admin/catalog";
import {
  setProductsAlwaysAvailable,
  deleteProducts,
  applyBulkProductEdit,
  BulkEditError,
  type BulkProductChanges,
} from "@/lib/admin/catalog";

/**
 * Products list actions.
 *
 * Every one re-gates with `requireSection("products")` — a Server Action is a
 * public endpoint, and a layout guard does not run before it. They resolve
 * rather than reject so the client can render an outcome; the detail of any
 * failure goes to the server log, never to the caller.
 */

export async function fetchProductsPage(filters: AdminProductFilters): Promise<AdminProductPage> {
  await requireSection("products");
  return listAdminProducts(filters);
}

export async function setVisibility(
  ids: number[],
  isActive: boolean,
): Promise<{ ok: boolean; changed: number }> {
  const admin = await requireSection("products");
  try {
    const changed = await setProductsVisibility(admin, ids, isActive);
    return { ok: true, changed };
  } catch (error) {
    console.error("[admin] set visibility failed", error);
    return { ok: false, changed: 0 };
  }
}

export type RemoveResult =
  | { ok: true; mode: "hard" }
  | { ok: true; mode: "soft"; reason: "has_orders" }
  | { ok: false };

export async function removeProduct(id: number): Promise<RemoveResult> {
  const admin = await requireSection("products");
  try {
    const outcome = await deleteProduct(admin, id);
    return { ok: true, ...outcome };
  } catch (error) {
    console.error("[admin] delete product failed", error);
    return { ok: false };
  }
}

/**
 * Bulk-set the stock-sync exemption over a selection.
 *
 * `always_available` decides whether the stock sync drafts a product that is
 * absent from an inventory export, so made-to-order pieces need it set — and
 * setting it one product at a time across a catalogue of 3,000 is not a real
 * option.
 */
export async function setAlwaysAvailable(ids: number[], alwaysAvailable: boolean): Promise<BulkResult> {
  const admin = await requireSection("products");
  try {
    const changed = await setProductsAlwaysAvailable(admin, ids, alwaysAvailable);
    return { ok: true, changed };
  } catch (error) {
    console.error("[admin] bulk always_available failed", error);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}

/**
 * Bulk delete. Products with order history are unpublished rather than removed —
 * deleting one would tear a line item out of somebody's receipt — so the result
 * reports both counts and the screen says which happened.
 */
export async function removeProducts(ids: number[]): Promise<BulkDeleteResult> {
  const admin = await requireSection("products");
  try {
    const outcome = await deleteProducts(admin, ids);
    return { ok: true, ...outcome };
  } catch (error) {
    console.error("[admin] bulk delete failed", error);
    return { ok: false, error: "That didn't finish. Nothing was deleted." };
  }
}

/**
 * Apply one change across a selection — the bulk-edit screen's only write.
 *
 * The changes object carries ONLY the fields the admin ticked. An absent key is
 * left alone, so an empty control can never be mistaken for "clear this on 300
 * products". Refusals that the admin can act on (an empty category set, a change
 * that would strand products in no category) come back as their own message;
 * anything else is ours and is logged, not leaked.
 */
export async function applyBulkEdit(ids: number[], changes: BulkProductChanges): Promise<BulkEditResult> {
  const admin = await requireSection("products");
  try {
    const outcome = await applyBulkProductEdit(admin, ids, changes);
    return { ok: true, ...outcome };
  } catch (error) {
    if (error instanceof BulkEditError) return { ok: false, error: error.message };
    console.error("[admin] bulk edit failed", error);
    return { ok: false, error: "That didn't save. Nothing was changed." };
  }
}

/* --- image queue ----------------------------------------------------------- */

/**
 * Ask the queue what it is doing about the products currently on screen.
 *
 * The list polls this while any loaded row is processing, and each poll is also
 * a trigger: with no daemon, an operator watching the screen is the most
 * reliable crank there is.
 *
 * It reads the state FIRST and drains in `after()`, rather than draining and
 * then reading. Draining first would be more satisfying — the poll would report
 * the work it just did — but it would also make every poll last as long as a
 * job, so a 4-second interval would stack up requests that all block on the
 * same encode. Reading first keeps the poll instant; the drain it kicks off is
 * reported by the next one.
 */
export async function pollImageJobs(productIds: number[]): Promise<ImageJobState[]> {
  await requireSection("products");
  const states = await getImageJobStates(productIds);
  after(async () => {
    await drainImageJobs();
  });
  return states;
}

export type RetryImagesResult = { ok: true } | { ok: false; error: string };

/**
 * Re-queue a product whose photos failed.
 *
 * The recovery path the inline pipeline had no answer for: before this, a
 * failed encode left the product in Draft with no images and the only way out
 * was re-uploading photos the operator may no longer have. The raw originals
 * are kept until a job succeeds precisely so this button has something to work
 * with.
 */
export async function retryProductImages(productId: number): Promise<RetryImagesResult> {
  const admin = await requireSection("products");
  try {
    const outcome = await retryImageJob(admin, productId);
    if (!outcome.ok) {
      return {
        ok: false,
        error:
          outcome.reason === "no_raw_files"
            ? "The original photos are no longer on the server — upload them again."
            : outcome.reason === "not_failed"
              ? "There's nothing to retry for this product."
              : "This product has no photo job to retry.",
      };
    }
    after(async () => {
      await drainImageJobs();
    });
    return { ok: true };
  } catch (error) {
    console.error("[admin] retry product images failed", error);
    return { ok: false, error: "Couldn't restart that. Please try again." };
  }
}

export type BulkResult = { ok: true; changed: number } | { ok: false; error: string };
export type BulkDeleteResult =
  | { ok: true; hardDeleted: number; softDeleted: number }
  | { ok: false; error: string };
export type BulkEditResult =
  | { ok: true; products: number; fields: string[] }
  | { ok: false; error: string };

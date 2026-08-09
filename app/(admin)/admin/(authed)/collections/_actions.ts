"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listCollections,
  getCollection,
  saveCollection,
  deleteCollection,
  setCollectionVisibility,
  reorderCollections,
  searchProductsForPicks,
  type CollectionInput,
  type CollectionRow,
  type CollectionDetail,
  type CollectionPick,
} from "@/lib/admin/taxonomy";

/**
 * Collection actions. Each re-gates on `collections` and returns the refreshed
 * list; `loadCollection` fetches one collection's rules for the edit drawer.
 */
export type CollectionResult = { ok: true; rows: CollectionRow[] } | { ok: false; error: string };

async function refresh(): Promise<CollectionResult> {
  return { ok: true, rows: await listCollections() };
}
function fail(error: unknown): CollectionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function loadCollection(id: number): Promise<CollectionDetail | null> {
  await requireSection("collections");
  return getCollection(id);
}

/** Name/SKU search behind the drawer's "Add products" control. Gated like every
 *  other action here — a product list is catalogue data, not public. */
export async function searchProductsForPicksAction(term: string): Promise<CollectionPick[]> {
  await requireSection("collections");
  return searchProductsForPicks(term);
}

export async function saveCollectionAction(id: number | null, input: CollectionInput): Promise<CollectionResult> {
  const admin = await requireSection("collections");
  try {
    await saveCollection(admin, id, input);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCollectionAction(id: number): Promise<CollectionResult> {
  const admin = await requireSection("collections");
  try {
    await deleteCollection(admin, id);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function setCollectionVisibilityAction(id: number, visible: boolean): Promise<CollectionResult> {
  const admin = await requireSection("collections");
  try {
    await setCollectionVisibility(admin, id, visible);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function reorderCollectionsAction(orderedIds: number[]): Promise<CollectionResult> {
  const admin = await requireSection("collections");
  try {
    await reorderCollections(admin, orderedIds);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

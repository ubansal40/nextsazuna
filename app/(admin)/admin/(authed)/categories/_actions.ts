"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryVisibility,
  reorderCategories,
  type CategoryInput,
  type CategoryRow,
} from "@/lib/admin/taxonomy";

/**
 * Category actions. Each re-gates on `categories` and returns the refreshed tree
 * so the screen re-renders from the database's truth.
 */
export type CategoryResult = { ok: true; rows: CategoryRow[] } | { ok: false; error: string };

async function refresh(): Promise<CategoryResult> {
  return { ok: true, rows: await listCategories() };
}
function fail(error: unknown): CategoryResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function saveCategoryAction(id: number | null, input: CategoryInput): Promise<CategoryResult> {
  const admin = await requireSection("categories");
  try {
    if (id) await updateCategory(admin, id, input);
    else await createCategory(admin, input);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCategoryAction(id: number): Promise<CategoryResult> {
  const admin = await requireSection("categories");
  try {
    await deleteCategory(admin, id);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function setCategoryVisibilityAction(id: number, visible: boolean): Promise<CategoryResult> {
  const admin = await requireSection("categories");
  try {
    await setCategoryVisibility(admin, id, visible);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function reorderCategoriesAction(orderedIds: number[]): Promise<CategoryResult> {
  const admin = await requireSection("categories");
  try {
    await reorderCategories(admin, orderedIds);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

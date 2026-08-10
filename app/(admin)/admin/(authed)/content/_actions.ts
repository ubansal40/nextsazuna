"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/admin/require";
import { getEditableBlock, saveEditableBlock } from "@/lib/admin/content";
import { readLayout, type StoredLayout } from "@/lib/admin/homepage-schema";
import { findVanishing, blockingWarnings, type LayoutWarning } from "@/lib/admin/homepage-validate";

/**
 * Homepage builder actions.
 *
 * Each re-gates on `content`, outside the try — `requireSection` redirects by
 * throwing, and catching that would turn a denial into `{ok:false}`.
 */

export type SaveLayoutResult =
  | { ok: true; layout: StoredLayout; warnings: LayoutWarning[] }
  | { ok: false; error: string; warnings: LayoutWarning[] };

export async function loadHomepage(): Promise<StoredLayout> {
  await requireSection("content");
  const block = await getEditableBlock<{ blocks?: unknown }>("homepage_layout");
  return readLayout(block.value);
}

/**
 * Save the layout, refusing anything the homepage would not draw.
 *
 * The gate is `blockingWarnings`, which runs the storefront's own parser over
 * the draft. It is not a second copy of the rules — it IS the parser — so it
 * cannot drift from what the page will actually render.
 *
 * Only a vanishing SECTION refuses. A single skipped row (one slide with no
 * headline among four) comes back as a warning and saves, because dropping an
 * unfinished row is usually what was meant.
 */
export async function saveHomepage(layout: StoredLayout): Promise<SaveLayoutResult> {
  const admin = await requireSection("content");

  // Never trust the shape off the wire: this is the boundary, and the client's
  // own validation is a courtesy.
  const clean = readLayout(layout);
  const warnings = findVanishing(clean);
  const blocking = blockingWarnings(clean);

  if (blocking.length > 0) {
    return {
      ok: false,
      error:
        blocking.length === 1
          ? "One section would disappear from the homepage. Fix it and save again."
          : `${blocking.length} sections would disappear from the homepage. Fix them and save again.`,
      warnings,
    };
  }

  try {
    await saveEditableBlock(admin, "homepage_layout", { blocks: clean.blocks }, {
      summary: `${clean.blocks.length} blocks`,
    });
  } catch (error) {
    console.error("[admin] homepage save failed", error);
    return { ok: false, error: "That didn't save. Nothing was changed.", warnings };
  }

  /**
   * A no-op today — every storefront route is `force-dynamic`, so the next
   * request already re-reads the block. It is here because storefront caching
   * is an open work item, and the day it lands this is the line whose absence
   * would make the homepage stop responding to edits, silently. `account/
   * _actions.ts` sets the same precedent.
   */
  revalidatePath("/", "layout");

  return { ok: true, layout: clean, warnings };
}

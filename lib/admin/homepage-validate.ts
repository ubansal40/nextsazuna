/**
 * "What would disappear if I saved this?"
 *
 * `lib/homepage-blocks.ts` is deliberately forgiving: a hero slide with no
 * headline is dropped, and if that was the only slide the entire hero block is
 * dropped with it. That is right for rendering — a malformed block must not
 * take down the home page — but it makes the editor dangerous, because the
 * operator can save successfully, be told it worked, and leave the shop missing
 * a section with nothing in any log.
 *
 * So this does not re-implement the rules. It runs THE REAL PARSER over the
 * draft and reports what did not come back. It cannot drift from the reader,
 * because it is the reader.
 *
 * Pure, and free of `import "server-only"` — the save action, the screen and
 * `scripts/check-content.mts` all use it.
 */

import { toBlocks } from "../homepage-blocks";
import { BLOCK_DEFS, isKnownKind, type StoredBlock, type StoredLayout } from "./homepage-schema";

export interface LayoutWarning {
  /** The block this is about, so the screen can point at the right card. */
  blockId: string;
  /** True when the whole section vanishes; false when only one item does. */
  fatal: boolean;
  message: string;
}

function itemsOf(block: StoredBlock, path: string): Record<string, unknown>[] {
  const value = block.config[path];
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    : [];
}

function blank(value: unknown): boolean {
  return typeof value !== "string" || !value.trim();
}

/**
 * Why this block did not survive, in the operator's language.
 *
 * Ordered most-specific first: a missing block-level requirement explains
 * itself, and otherwise the culprit is a repeater whose every item was
 * rejected.
 */
function explain(block: StoredBlock): string {
  if (!isKnownKind(block.type)) return `“${block.type}” is not a section this site can draw.`;
  const def = BLOCK_DEFS[block.type];

  if (def.requiredPath && blank(block.config[def.requiredPath])) {
    const field = def.fields.find((f) => "path" in f && f.path === def.requiredPath);
    return `it has no ${(field?.label ?? def.requiredPath).toLowerCase()}.`;
  }

  for (const field of def.fields) {
    if (field.kind !== "repeater") continue;
    const items = itemsOf(block, field.path);
    if (items.length === 0) return `it has no ${field.itemLabel}s.`;
    if (items.every((item) => blank(item[field.requiredPath]))) {
      const inner = field.fields.find((f) => "path" in f && f.path === field.requiredPath);
      return `every ${field.itemLabel} is missing its ${(inner?.label ?? field.requiredPath).toLowerCase()}.`;
    }
  }
  return "it is incomplete.";
}

/**
 * Everything about this draft that would not reach the shop.
 *
 * `fatal` warnings block the save — losing a whole section by accident is not
 * recoverable from the storefront, and the operator would have no way to tell
 * it happened. Non-fatal ones (a single slide that will be skipped) are shown
 * but allowed: dropping one incomplete row is often exactly what was meant.
 */
export function findVanishing(layout: StoredLayout): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const surviving = new Set(toBlocks(layout).map((b) => b.id));

  for (const block of layout.blocks) {
    // Hidden on purpose, and unknown types are kept as-is for the same reason
    // `readLayout` keeps them — the operator may be running ahead of the code.
    if (!block.visible) continue;
    if (!isKnownKind(block.type)) continue;

    const def = BLOCK_DEFS[block.type];

    if (!surviving.has(block.id)) {
      warnings.push({
        blockId: block.id,
        fatal: true,
        message: `“${def.label}” will not appear on the homepage — ${explain(block)}`,
      });
      continue;
    }

    // The block survives, but individual rows inside it may not.
    for (const field of def.fields) {
      if (field.kind !== "repeater") continue;
      itemsOf(block, field.path).forEach((item, i) => {
        if (blank(item[field.requiredPath])) {
          const inner = field.fields.find((f) => "path" in f && f.path === field.requiredPath);
          warnings.push({
            blockId: block.id,
            fatal: false,
            message: `“${def.label}” — ${field.itemLabel} ${i + 1} will be skipped, it has no ${(
              inner?.label ?? field.requiredPath
            ).toLowerCase()}.`,
          });
        }
      });
    }
  }

  return warnings;
}

/** The save gate. Only a vanishing section stops a save. */
export function blockingWarnings(layout: StoredLayout): LayoutWarning[] {
  return findVanishing(layout).filter((w) => w.fatal);
}

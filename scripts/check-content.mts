#!/usr/bin/env node
/**
 * Homepage content checks.
 *
 * The homepage is one admin-authored JSON block, and `lib/homepage-blocks.ts`
 * is deliberately forgiving with it: a hero slide with no headline is dropped,
 * and if that was the only slide the whole hero section is dropped too. Nothing
 * throws and nothing is logged — the section is simply not there.
 *
 * That makes one class of bug invisible: an editor that emits a shape the
 * parser does not keep. The operator saves, is told it worked, and the shop
 * quietly loses a section. So the central assertion here is a round trip —
 * every block the builder can create must survive the real parser.
 *
 * Run: npx tsx scripts/check-content.mts
 */
import { BLOCK_DEFS, BLOCK_KINDS, FEATURE_ICONS, USP_ICONS, makeBlock, readLayout, type StoredBlock } from "../lib/admin/homepage-schema";
import { blockingWarnings, findVanishing } from "../lib/admin/homepage-validate";
import { toBlocks } from "../lib/homepage-blocks";
import { EDITABLE_BLOCKS } from "../lib/admin/content-keys";

const checks: [string, boolean][] = [];
const layout = (blocks: StoredBlock[]) => ({ blocks });
const one = (b: StoredBlock) => toBlocks(layout([b]));

/* --- the round trip -------------------------------------------------------
 * If this fails, the builder can create a section that never reaches the shop.
 */
for (const kind of BLOCK_KINDS) {
  const block = makeBlock(kind, []);
  const parsed = one(block);
  checks.push([`a new ${kind} block survives the parser`, parsed.length === 1 && parsed[0].type === kind]);
  checks.push([`a new ${kind} block raises no warning`, findVanishing(layout([block])).length === 0]);
}

checks.push([
  "every drawable block type has a definition",
  BLOCK_KINDS.every((k) => BLOCK_DEFS[k]?.kind === k),
]);

// The parser skips these, so offering them would add invisible sections.
checks.push([
  "newsletter and rich_text are not offered",
  !(BLOCK_KINDS as readonly string[]).includes("newsletter") &&
    !(BLOCK_KINDS as readonly string[]).includes("rich_text"),
]);

/* --- the silent drops, one by one ---------------------------------------- */

const heroNoHeadline: StoredBlock = {
  id: "h1", type: "hero", visible: true,
  config: { autoplay_ms: 5200, slides: [{ headline: "", image: "" }] },
};
checks.push(
  ["a headline-less hero really is dropped by the parser", one(heroNoHeadline).length === 0],
  ["...and the editor refuses to save it", blockingWarnings(layout([heroNoHeadline])).length === 1],
  [
    "...naming the section and the reason",
    /Hero carousel.*will not appear.*headline/i.test(findVanishing(layout([heroNoHeadline]))[0]?.message ?? ""),
  ],
);

const heroPartial: StoredBlock = {
  id: "h2", type: "hero", visible: true,
  config: { slides: [{ headline: "Kept" }, { headline: "" }] },
};
checks.push(
  ["a hero with one good slide still renders", one(heroPartial).length === 1],
  ["...but the empty slide is reported", findVanishing(layout([heroPartial])).length === 1],
  ["...as a warning, not a block on saving", blockingWarnings(layout([heroPartial])).length === 0],
);

const bannerNoHeading: StoredBlock = { id: "b1", type: "banner", visible: true, config: { heading: "" } };
checks.push(
  ["a heading-less banner is dropped", one(bannerNoHeading).length === 0],
  ["...and refused", blockingWarnings(layout([bannerNoHeading])).length === 1],
);

const tilesNoLabel: StoredBlock = {
  id: "c1", type: "category_grid", visible: true,
  config: { layout: "circle", tiles: [{ label: "" }] },
};
checks.push(["a category grid whose tiles have no label is dropped", one(tilesNoLabel).length === 0]);

const emptyReviews: StoredBlock = { id: "r1", type: "reviews", visible: true, config: { items: [] } };
checks.push(["a reviews block with no quotes is dropped", one(emptyReviews).length === 0]);

const hidden: StoredBlock = { ...makeBlock("hero", []), visible: false };
checks.push(
  ["a hidden block is not rendered", one(hidden).length === 0],
  ["...and hiding is not reported as a fault", findVanishing(layout([hidden])).length === 0],
);

const unknown: StoredBlock = { id: "n1", type: "newsletter", visible: true, config: {} };
checks.push(
  ["an unknown block type is skipped by the parser", one(unknown).length === 0],
  ["...and does not block a save — the admin may be ahead of the code", blockingWarnings(layout([unknown])).length === 0],
);

/* --- coercions the editor must not contradict ---------------------------- */

const coerce = (config: Record<string, unknown>) =>
  one({ id: "x", type: "product_grid", visible: true, config })[0] as { tabs: { sort: string; limit: number }[] };

checks.push(
  ["an unknown sort is coerced to popularity", coerce({ tabs: [{ label: "T", sort: "chaos" }] }).tabs[0].sort === "popularity"],
  ["every sort the editor offers is accepted", BLOCK_DEFS.product_grid.fields.some((f) => f.kind === "repeater" && f.fields.some((g) => g.kind === "select" && g.options.every((o) => coerce({ tabs: [{ label: "T", sort: o.value }] }).tabs[0].sort === o.value)))],
  ["a limit above 24 is clamped", coerce({ tabs: [{ label: "T", limit: 99 }] }).tabs[0].limit === 24],
);

const hero = (config: Record<string, unknown>) =>
  one({ id: "x", type: "hero", visible: true, config })[0] as { autoplayMs: number; slides: { image: string | null }[] };

checks.push(
  ["autoplay under a second falls back to 5200", hero({ slides: [{ headline: "H" }], autoplay_ms: 200 }).autoplayMs === 5200],
  ["the schema's default autoplay is kept as-is", hero({ slides: [{ headline: "H" }], autoplay_ms: 5200 }).autoplayMs === 5200],
  ["a protocol-relative image is rejected", hero({ slides: [{ headline: "H", image: "//evil.test/x.jpg" }] }).slides[0].image === null],
  ["an app-relative image is kept", hero({ slides: [{ headline: "H", image: "/uploads/content/x.avif" }] }).slides[0].image === "/uploads/content/x.avif"],
);

/* --- icon vocabularies really do differ ---------------------------------- */

const iconsOf = (kind: "usp_strip" | "feature_cards", repeater: string) => {
  const rep = BLOCK_DEFS[kind].fields.find((f) => f.kind === "repeater" && f.path === repeater);
  const sel = rep && rep.kind === "repeater" ? rep.fields.find((f) => f.kind === "select") : undefined;
  return sel && sel.kind === "select" ? sel.options.map((o) => o.value) : [];
};

checks.push(
  ["the trust-badge icon list matches the renderer's", JSON.stringify(iconsOf("usp_strip", "items")) === JSON.stringify([...USP_ICONS])],
  ["the why-us icon list matches the renderer's", JSON.stringify(iconsOf("feature_cards", "cards")) === JSON.stringify([...FEATURE_ICONS])],
  // sparkle renders in feature_cards and NOT in usp_strip; the live block uses
  // it in a usp_strip, where it falls back to a plain lozenge.
  ["the two icon lists are not interchangeable", !iconsOf("usp_strip", "items").includes("sparkle")],
);

/* --- reading a stored layout --------------------------------------------- */

const stored = readLayout({
  blocks: [
    { id: "a", type: "hero", visible: true, config: { slides: [] } },
    { id: "b", type: "newsletter", config: {} },
    { id: "", type: "hero", config: {} },
    null,
  ],
});
checks.push(
  ["a layout read keeps unknown types rather than deleting the operator's work", stored.blocks.length === 2],
  ["an id-less block is dropped — the parser would drop it anyway", !stored.blocks.some((b) => !b.id)],
  ["visible defaults to true when the key is absent", stored.blocks[1].visible === true],
);

const made: StoredBlock[] = [];
for (let n = 0; n < 3; n += 1) made.push(makeBlock("hero", made));
checks.push(["a new block never reuses an id", new Set(made.map((b) => b.id)).size === made.length]);

/* --- payment_methods is excluded structurally ---------------------------- */

checks.push([
  "payment_methods is not editable — it holds live gateway secrets",
  !(EDITABLE_BLOCKS as readonly string[]).includes("payment_methods"),
]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ content checks FAILED — the builder can emit a section the homepage will not draw.");
}
process.exit(failed ? 1 : 0);

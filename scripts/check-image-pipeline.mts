#!/usr/bin/env node
/**
 * Product image pipeline checks.
 *
 * The pipeline is instructed to match sazuna-unik 2's exactly, and the output is
 * a binary AVIF no unit test reads by eye — so this runs the real sharp pipeline
 * on a generated source and asserts the invariants: the output is a 1000×1000
 * AVIF (the crop happened), a portrait source is squared (cover crop, not
 * letterbox), the SKU is normalised, and the URL⇄path helpers round-trip and
 * refuse traversal. It also writes one sample AVIF to the scratchpad so the
 * composite (logo + SKU stamp) can be eyeballed when needed.
 *
 * Run: npx tsx scripts/check-image-pipeline.mts
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Point taxonomy storage at a throwaway directory BEFORE importing the module —
 * it resolves its upload dir from the environment once, at load. Hence the
 * dynamic import: a static one is hoisted above this assignment and would write
 * the test file into the repo's `public/`.
 */
const tempDir = await mkdtemp(path.join(tmpdir(), "sazuna-taxonomy-"));
process.env.TAXONOMY_IMAGE_UPLOAD_DIR = tempDir;

const {
  processProductImage,
  processSquareImage,
  storeSquareImage,
  isRawUrl,
  pathForUrl,
  rawUrl,
  finalUrl,
  PRODUCT_IMAGE_UPLOAD_DIR,
  TAXONOMY_IMAGE_URL_BASE,
} = await import("../lib/admin/images");

const checks: [string, boolean][] = [];

// A landscape source with a coloured gradient, so a centre cover-crop is visible.
const source = await sharp({
  create: { width: 1400, height: 900, channels: 3, background: { r: 210, g: 180, b: 120 } },
})
  .png()
  .toBuffer();

const output = await processProductImage(source, "SAZ-RING-001");
const meta = await sharp(output).metadata();

checks.push(
  // sharp reports an AVIF-in-HEIF container as "heif".
  ["the output is AVIF", meta.format === "heif"],
  ["the output is 1000×1000", meta.width === 1000 && meta.height === 1000],
  ["the output is not empty", output.length > 500],
);

// A tall portrait source must still come out square (cover crop, not padded).
const portrait = await sharp({
  create: { width: 600, height: 1600, channels: 3, background: { r: 120, g: 40, b: 44 } },
})
  .png()
  .toBuffer();
const portraitOut = await sharp(await processProductImage(portrait, "SAZ-NECK-002")).metadata();
checks.push(["a portrait source is squared to 1000×1000", portraitOut.width === 1000 && portraitOut.height === 1000]);

/* --- taxonomy square images ------------------------------------------------
 * Category and collection artwork runs the same crop but must carry NEITHER the
 * logo NOR the SKU stamp. On a flat-colour source that is measurable: the
 * product output gains contrast from the two overlays, so its channel deviation
 * is well above zero, while a clean square crop of a flat source stays uniform.
 * Asserting the difference (rather than just "it made an AVIF") is what stops a
 * future edit from quietly routing taxonomy images through the stamped path.
 */
const squareOut = await processSquareImage(source);
const squareMeta = await sharp(squareOut).metadata();
const squareStats = await sharp(squareOut).stats();
const stampedStats = await sharp(output).stats();
const maxDev = (s: { channels: { stdev: number }[] }) => Math.max(...s.channels.map((c) => c.stdev));

checks.push(
  ["a square image is AVIF 1000×1000", squareMeta.format === "heif" && squareMeta.width === 1000 && squareMeta.height === 1000],
  ["a flat source stays flat — no logo, no SKU stamp", maxDev(squareStats) < 1],
  ["the product pipeline, by contrast, does stamp", maxDev(stampedStats) > 5],
  [
    "a portrait source is squared for taxonomy too",
    (await sharp(await processSquareImage(portrait)).metadata()).width === 1000,
  ],
);

// Storage: the filename is sanitised, so a traversal-shaped slug cannot escape
// the upload directory (the route passes a user-supplied hint straight through).
const storedUrl = await storeSquareImage(source, "../../etc/passwd");
const storedPath = path.join(tempDir, storedUrl.slice(TAXONOMY_IMAGE_URL_BASE.length));

checks.push(
  ["a stored square image lives under the taxonomy url base", storedUrl.startsWith(TAXONOMY_IMAGE_URL_BASE)],
  ["a traversal slug is sanitised out of the filename", !storedUrl.includes("..") && !storedUrl.includes("/etc/")],
  ["the file really landed in the taxonomy dir", existsSync(storedPath)],
);
await rm(tempDir, { recursive: true, force: true });

// URL ⇄ path helpers.
checks.push(
  ["a raw url is recognised", isRawUrl(rawUrl("x.jpg"))],
  ["a final url is not a raw url", !isRawUrl(finalUrl("x.avif"))],
  ["a final url maps under the upload dir", pathForUrl(finalUrl("x.avif"))?.startsWith(PRODUCT_IMAGE_UPLOAD_DIR) === true],
  ["a traversal url is refused", pathForUrl("/uploads/products/../../etc/passwd") === null],
  ["a foreign url maps to null", pathForUrl("https://example.com/x.avif") === null],
);

// Drop a sample for eyeballing — scratchpad, not the repo.
try {
  const sample = process.env.IMAGE_SAMPLE_OUT;
  if (sample) {
    await writeFile(sample, output);
    console.log(`      (wrote sample AVIF to ${sample})`);
  }
} catch {
  /* sample write is best-effort */
}

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ image pipeline checks FAILED — the output must match sazuna-unik 2's handling.");
}
process.exit(failed ? 1 : 0);

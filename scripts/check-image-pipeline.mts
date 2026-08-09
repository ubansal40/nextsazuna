#!/usr/bin/env node
/**
 * Product image pipeline checks.
 *
 * The pipeline is instructed to match sazuna-unik 2's exactly, and the output is
 * a binary AVIF no reviewer reads by eye — so this runs the real sharp pipeline
 * on generated sources and asserts the invariants that a screenshot would miss.
 *
 * The section that earns its keep is **the SKU stamp**. Its failure mode is not
 * an exception: if fontconfig has no usable monospace face, pango returns a
 * correctly-sized, completely transparent bitmap, and the photo ships with no
 * SKU on it and nothing in any log. Two assertions catch that — the same photo
 * stamped with two different SKUs must produce different bytes (a blank stamp
 * makes them identical), and the label region must be measurably brighter than
 * the unstamped equivalent.
 *
 * Run: npx tsx scripts/check-image-pipeline.mts
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Point storage at throwaway directories BEFORE importing the module — it
 * resolves its upload dirs from the environment once, at load. Hence the
 * dynamic import: a static one is hoisted above these assignments and would
 * write test files into the repo's `public/`.
 */
const tempDir = await mkdtemp(path.join(tmpdir(), "sazuna-images-"));
process.env.TAXONOMY_IMAGE_UPLOAD_DIR = path.join(tempDir, "taxonomy");
process.env.PRODUCT_IMAGE_UPLOAD_DIR = path.join(tempDir, "products");

const {
  processProductImage,
  processSquareImage,
  storeProductImage,
  storeSquareImage,
  normaliseSku,
  pathForUrl,
  finalUrl,
  PermanentImageError,
  PRODUCT_IMAGE_UPLOAD_DIR,
  PRODUCT_IMAGE_URL_BASE,
  TAXONOMY_IMAGE_URL_BASE,
} = await import("../lib/admin/images");

const { createGate, GateTimeoutError } = await import("../lib/admin/image-limit");
const { MAX_PRODUCT_PHOTOS, MAX_PHOTO_BYTES } = await import("../lib/admin/product-limits");

const checks: [string, boolean][] = [];

/* --- the crop -------------------------------------------------------------- */

// A landscape source with a flat colour, so anything composited on top is
// measurable against a known background.
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

/* --- the SKU stamp ---------------------------------------------------------
 * The whole point of the watermark is that it says THIS product's code. A stamp
 * that renders blank, or that ignores the SKU it was handed, is invisible in
 * every other assertion here — both still produce a valid 1000×1000 AVIF.
 */
const stampedA = await processProductImage(source, "SAZ-RING-001");
const stampedB = await processProductImage(source, "SAZ-RING-999");

checks.push([
  "the same photo stamped with two SKUs differs — the text really renders",
  !stampedA.equals(stampedB),
]);

// The label sits bottom-left: 24px in, ~20px up, roughly 43px tall. A white 85%
// rounded box over a mid-tone background lifts the mean brightness of that
// patch well clear of the unstamped version of the same crop.
const LABEL = { left: 24, top: 928, width: 220, height: 52 };
const meanOf = async (buffer: Buffer, region: typeof LABEL): Promise<number> => {
  const stats = await sharp(buffer).extract(region).stats();
  return stats.channels.reduce((sum, c) => sum + c.mean, 0) / stats.channels.length;
};

const unstamped = await processSquareImage(source);
const labelMean = await meanOf(output, LABEL);
const cleanMean = await meanOf(unstamped, LABEL);

checks.push([
  "the SKU label region is visibly lighter than the unstamped image",
  labelMean > cleanMean + 8,
]);

// The logo is composited top-centre. Same argument: on a flat source, the
// region either has something in it or it does not.
const LOGO = { left: 450, top: 20, width: 100, height: 60 };
checks.push([
  "the logo region differs from the unstamped image",
  Math.abs((await meanOf(output, LOGO)) - (await meanOf(unstamped, LOGO))) > 1,
]);

checks.push(
  ["a SKU is uppercased and trimmed", normaliseSku("  saz-ring-001 ") === "SAZ-RING-001"],
  // Markup-significant characters must go — the SKU is interpolated into pango
  // markup — but nothing that is part of a real SKU may be silently dropped.
  ["pango-significant characters are stripped", normaliseSku('SAZ<>&"001') === "SAZ001"],
  ["a decimal point in a SKU survives", normaliseSku("DLR10102-22KT-YG-0.75CT") === "DLR10102-22KT-YG-0.75CT"],
  ["a slash in a SKU survives", normaliseSku("SAZ/RING/001") === "SAZ/RING/001"],
  ["an empty SKU still stamps something", normaliseSku("   ") === "SKU"],
  ["a SKU is capped at 64 characters", normaliseSku("A".repeat(200)).length === 64],
);

/* --- taxonomy square images ------------------------------------------------
 * Category and collection artwork runs the same crop but must carry NEITHER the
 * logo NOR the SKU stamp. On a flat-colour source that is measurable: the
 * product output gains contrast from the two overlays, so its channel deviation
 * is well above zero, while a clean square crop of a flat source stays uniform.
 */
const squareMeta = await sharp(unstamped).metadata();
const squareStats = await sharp(unstamped).stats();
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

/* --- refusals -------------------------------------------------------------- */

const refuses = async (input: Buffer): Promise<boolean> => {
  try {
    await processProductImage(input, "SAZ-X");
    return false;
  } catch (error) {
    // Permanent, not transient: the upload route answers 400 on this class and
    // asks the operator to fix the file. Getting the type wrong turns a bad
    // upload into "please try again", forever.
    return error instanceof PermanentImageError;
  }
};

checks.push(
  ["an empty buffer is refused permanently", await refuses(Buffer.alloc(0))],
  ["an HTML error page is refused permanently", await refuses(Buffer.from("<!doctype html><html>404</html>"))],
  ["a text file is refused permanently", await refuses(Buffer.from("this is not an image at all"))],
);

/* --- storage --------------------------------------------------------------- */

const productUrl = await storeProductImage(source, "SAZ-RING-001");
const productPath = pathForUrl(productUrl);

checks.push(
  ["a stored product image lives under the products url base", productUrl.startsWith(PRODUCT_IMAGE_URL_BASE)],
  ["a stored product image is an AVIF", productUrl.endsWith(".avif")],
  ["the stored file really exists", productPath !== null && existsSync(productPath)],
  [
    "the same photo and SKU store idempotently",
    (await storeProductImage(source, "SAZ-RING-001")) === productUrl,
  ],
  [
    "a different SKU gets a different file",
    (await storeProductImage(source, "SAZ-RING-002")) !== productUrl,
  ],
);

// The filename is sanitised, so a traversal-shaped slug cannot escape the
// upload directory (the taxonomy route passes a user-supplied hint through).
const storedUrl = await storeSquareImage(source, "../../etc/passwd");
const storedPath = path.join(tempDir, "taxonomy", storedUrl.slice(TAXONOMY_IMAGE_URL_BASE.length));

checks.push(
  ["a stored square image lives under the taxonomy url base", storedUrl.startsWith(TAXONOMY_IMAGE_URL_BASE)],
  ["a traversal slug is sanitised out of the filename", !storedUrl.includes("..") && !storedUrl.includes("/etc/")],
  ["the file really landed in the taxonomy dir", existsSync(storedPath)],
);

// URL ⇄ path helpers.
checks.push(
  ["a final url maps under the upload dir", pathForUrl(finalUrl("x.avif"))?.startsWith(PRODUCT_IMAGE_UPLOAD_DIR) === true],
  ["a traversal url is refused", pathForUrl("/uploads/products/../../etc/passwd") === null],
  ["a foreign url maps to null", pathForUrl("https://example.com/x.avif") === null],
  ["a bare base url maps to null", pathForUrl(PRODUCT_IMAGE_URL_BASE) === null],
);

/* --- the concurrency gate --------------------------------------------------
 * This replaced the job queue's memory ceiling. If it lets more than `limit`
 * encodes run at once, the failure is not a slow page — it is an OOM kill that
 * takes the storefront down with the admin, because they are one process.
 */
{
  const gate = createGate(2, 5000);
  let concurrent = 0;
  let peak = 0;
  const order: number[] = [];

  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      gate.run(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((r) => setTimeout(r, 5));
        order.push(i);
        concurrent -= 1;
      }),
    ),
  );

  checks.push(
    ["the gate never exceeds its limit", peak === 2],
    ["every queued task still runs", order.length === 8],
    ["the gate drains completely", gate.active() === 0 && gate.waiting() === 0],
  );

  // A task that throws must still hand its slot back, or the gate wedges shut
  // after `limit` bad photos and every later upload times out.
  const failing = createGate(1, 2000);
  await failing.run(async () => {
    throw new Error("boom");
  }).catch(() => {});
  let ranAfterThrow = false;
  await failing.run(async () => {
    ranAfterThrow = true;
  });
  checks.push(["a throwing task releases its slot", ranAfterThrow && failing.active() === 0]);

  // And a waiter that gives up must leave the queue, or the slot it is later
  // handed goes to a promise nobody is listening to — a silent, cumulative leak.
  const tight = createGate(1, 1000);
  let timedOut = false;
  const hold = tight.run(() => new Promise((r) => setTimeout(r, 1400)));
  await tight.run(async () => undefined).catch((error) => {
    timedOut = error instanceof GateTimeoutError;
  });
  await hold;
  let recovered = false;
  await tight.run(async () => {
    recovered = true;
  });
  checks.push(
    ["a waiter that times out rejects with GateTimeoutError", timedOut],
    ["...and the abandoned slot is not leaked", recovered && tight.active() === 0 && tight.waiting() === 0],
  );
}

/* --- limits ---------------------------------------------------------------- */

checks.push(
  ["the photo limit is the owner's chosen 5", MAX_PRODUCT_PHOTOS === 5],
  ["the size limit clears a 48MP phone photo", MAX_PHOTO_BYTES >= 20 * 1024 * 1024],
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

await rm(tempDir, { recursive: true, force: true });

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

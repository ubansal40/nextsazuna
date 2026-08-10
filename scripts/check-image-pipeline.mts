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
import sharp, { type Sharp } from "sharp";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  roundedRectRgba,
  sniffImageFormat,
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

/** A tiny image in whatever format the caller asks for. */
const make = async (fn: (s: Sharp) => Sharp): Promise<Buffer> =>
  fn(sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 150, b: 90 } } })).toBuffer();

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

/**
 * The stamp has to be big enough to READ.
 *
 * It shipped at 19px — about 2% of a 1000px image, which on a category tile is
 * roughly four pixels tall. A theft-deterrent watermark nobody can read is
 * decoration. This measures the actual height of the label band in the output,
 * so shrinking the font back down fails the build rather than quietly making
 * the mark useless again.
 */
{
  const strip = await sharp(output)
    .extract({ left: 30, top: 880, width: 1, height: 120 })
    .greyscale()
    .raw()
    .toBuffer();
  const bright = Array.from(strip).filter((v) => v > 225).length;
  checks.push(["the SKU label is tall enough to read (>=40px band)", bright >= 40]);
}

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

/* --- the stamp font ships with the repo ------------------------------------
 * The production box has twelve font families installed and pango renders tofu
 * boxes for every one of them, including the generic `monospace` alias. Photos
 * went out with a row of empty rectangles where the SKU should be, and every
 * "did it render?" check passed, because tofu is opaque pixels of the right
 * size. The font is therefore SHIPPED and loaded by path, and `assertFontUsable`
 * proves glyphs render before the first photo of each process.
 */
{
  const fontPath = new URL("../public/fonts/geist-mono-stamp.ttf", import.meta.url);
  checks.push([
    "the SKU stamp font is bundled, not borrowed from the server",
    existsSync(fontPath),
  ]);
}

/* --- no SVG in the pipeline -------------------------------------------------
 * This one is a scar, not a nicety.
 *
 * The SKU label's rounded background was an inline SVG string handed to sharp.
 * libvips renders SVG through librsvg, which is OPTIONAL: `sharp.format.svg`
 * reported available and standalone scripts on the production box worked, but
 * the deployed app resolved a libvips without it and EVERY upload failed with
 * "Input buffer contains unsupported image format" — an error that blames the
 * customer's photograph. A day of production downtime for a rounded rectangle.
 *
 * The background is now raw pixels. This assertion exists so nobody reaches for
 * an SVG again because it is the obvious way to draw a shape.
 */
const imagesSource = await readFile(new URL("../lib/admin/images.ts", import.meta.url), "utf8");
// Deliberately looks for SVG *construction* (`xmlns`, `<rect`), not the word
// SVG: `sniffImageFormat` must go on recognising an uploaded .svg, and that is
// reading a format, not depending on a renderer for our own drawing.
checks.push([
  "the pipeline never BUILDS an SVG — librsvg is optional in libvips",
  !/xmlns|<rect|<circle|<path\s/i.test(imagesSource),
]);

// The replacement for that SVG, asserted pixel by pixel: the corner has to be
// genuinely transparent (a rounded rectangle, not a square) and the middle has
// to carry the reference's 85% white.
{
  const W = 120, H = 40, R = 10;
  const rect = roundedRectRgba(W, H, R, { r: 255, g: 255, b: 255 }, 0.85);
  const at = (x: number, y: number) => rect.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
  const centre = at(W >> 1, H >> 1);

  checks.push(
    ["the rounded rect is exactly w×h×4 bytes", rect.length === W * H * 4],
    ["its middle is 85% white", centre[0] === 255 && centre[1] === 255 && centre[2] === 255 && centre[3] === 217],
    ["its very corner is transparent — it is rounded, not square", at(0, 0)[3] === 0],
    ["all four corners are rounded", [at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].every((p) => p[3] === 0)],
    ["an edge midpoint stays opaque", at(W >> 1, 0)[3] === 217 && at(0, H >> 1)[3] === 217],
    // Hard-clipped corners look cheap next to what librsvg drew. The coverage
    // ramp is what keeps the replacement visually identical.
    ["the corner is antialiased, not hard-clipped", (() => {
      const alphas = Array.from({ length: R }, (_, i) => at(i, R - 1 - i)[3]);
      return alphas.some((a) => a > 0 && a < 217);
    })()],
    ["a radius larger than the box is clamped, not corrupt", roundedRectRgba(10, 10, 999, { r: 0, g: 0, b: 0 }, 1).length === 400],
    ["a 1×1 rect is still valid", roundedRectRgba(1, 1, 10, { r: 1, g: 2, b: 3 }, 1).length === 4],
  );
}

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

/** The refusal message, or null when the input was accepted. */
const refusal = async (input: Buffer): Promise<string | null> => {
  try {
    await processProductImage(input, "SAZ-X");
    return null;
  } catch (error) {
    // Permanent, not transient: the upload route answers 400 on this class and
    // asks the operator to fix the file. Getting the type wrong turns a bad
    // upload into "please try again", forever.
    if (!(error instanceof PermanentImageError)) return `WRONG TYPE: ${String(error)}`;
    return error.message;
  }
};

const emptyMsg = await refusal(Buffer.alloc(0));
const htmlMsg = await refusal(Buffer.from("<!doctype html><html>404 Not Found</html>"));
const textMsg = await refusal(Buffer.from("this is not an image at all, not even slightly"));
// A real JPEG header with the rest of the file lopped off — a format we DO
// read, so the advice must be "re-save it", not "convert it".
const truncated = Buffer.concat([(await make((s) => s.jpeg())).subarray(0, 40)]);
const truncatedMsg = await refusal(truncated);

checks.push(
  ["an empty buffer is refused permanently", emptyMsg !== null && !emptyMsg.startsWith("WRONG TYPE")],
  ["an HTML error page is named as a web page", htmlMsg?.includes("web page") === true],
  ["an unrecognised file suggests real formats", textMsg?.includes("JPEG") === true],
  [
    "a damaged JPEG is called damaged, not unsupported",
    truncatedMsg !== null && /corrupt|incomplete/i.test(truncatedMsg) && !/can't read/i.test(truncatedMsg),
  ],
);

/* --- format coverage -------------------------------------------------------
 * The gate is the decoder, not an allowlist in this repo — so what is asserted
 * here is that every format libvips advertises is actually accepted end to end,
 * and that the sniffer's names stay useful for the messages.
 */
for (const [name, buffer] of [
  ["JPEG", await make((s) => s.jpeg())],
  ["PNG", await make((s) => s.png())],
  ["WebP", await make((s) => s.webp())],
  ["TIFF", await make((s) => s.tiff())],
  ["GIF", await make((s) => s.gif())],
  ["AVIF", await make((s) => s.avif())],
  ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>')],
] as [string, Buffer][]) {
  checks.push([`${name} is accepted end to end`, (await refusal(buffer)) === null]);
}

// Every ISO-BMFF brand an Apple device writes must reach the HEIC advice, not
// a generic "unrecognised". `msf1` is an ordinary burst; it used to be refused
// as an unknown container even where libheif could read it.
const ftyp = (brand: string): Buffer =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(16)]);

checks.push(
  ["a heic brand is recognised", sniffImageFormat(ftyp("heic")) === "heic"],
  ["a mif1 brand is recognised as the HEIC family", sniffImageFormat(ftyp("mif1")) === "heic"],
  ["an msf1 burst is recognised as the HEIC family", sniffImageFormat(ftyp("msf1")) === "heic"],
  ["an hevc brand is recognised as the HEIC family", sniffImageFormat(ftyp("hevc")) === "heic"],
  ["an avif brand is still avif, not heic", sniffImageFormat(ftyp("avif")) === "avif"],
  ["an ICO is named", sniffImageFormat(Buffer.concat([Buffer.from([0, 0, 1, 0]), Buffer.alloc(16)])) === "ico"],
  ["a JPEG XL is named", sniffImageFormat(Buffer.concat([Buffer.from([0xff, 0x0a]), Buffer.alloc(16)])) === "jxl"],
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

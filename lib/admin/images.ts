import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { PermanentImageError } from "./image-queue";

/**
 * The product image pipeline — matched to sazuna-unik 2's, as instructed.
 *
 * Every raw photo becomes a 1000×1000 AVIF with the Sazuna logo composited
 * top-centre and the SKU stamped bottom-left on a translucent rounded label.
 * The constants (size, logo width/top, SKU font/left/bottom, AVIF quality) are
 * the reference's verbatim, so a product photographed for the old shop and one
 * uploaded here come out identical.
 *
 * Two deliberate differences from the reference, both invisible in the output:
 *
 *   - The SKU label uses the system monospace font by default rather than a
 *     bundled Menlo.ttf (an Apple font this repo won't redistribute). Set
 *     `PRODUCT_IMAGE_SKU_FONT_PATH` to a .ttf/.otf to pin the exact glyphs;
 *     otherwise pango falls back to the platform mono (Menlo on macOS, DejaVu
 *     Sans Mono on the Hostinger box). The label is a functional watermark, so
 *     near-equivalent mono glyphs are fine.
 *   - There is no background worker (`output: standalone` has none), so the
 *     queue in `image-jobs.ts` drains from request-shaped triggers instead of a
 *     daemon. This module is the processing half; the queue is its caller.
 */

const SIZE = 1000;
const LOGO_WIDTH = 50;
const LOGO_TOP = 25;
const SKU_FONT_SIZE = 19;
const SKU_LEFT = 24;
const SKU_BOTTOM = 20;
const AVIF_QUALITY = 75;

/** The reference's SKU watermark colour. A named constant so it can be swapped
 *  for the ceremony maroon if the brand wants the stamp on-brand rather than
 *  identical to the old shop's. */
const SKU_COLOUR = "#d51b40";

export const PRODUCT_IMAGE_URL_BASE = "/uploads/products/";
export const RAW_SUBDIR = "raw";

/** Taxonomy artwork lives beside the product images, under the same
 *  `/uploads/*` alias, so one LiteSpeed rule serves both. */
export const TAXONOMY_IMAGE_URL_BASE = "/uploads/taxonomy/";

/**
 * Where processed and raw files are written. Env-overridable and absolute in
 * production — it points at the Hostinger `sazuna-storage` directory so images
 * survive a deploy, served by a LiteSpeed `/uploads/*` alias (files never enter
 * Node). In development it defaults under `public/` so `next dev` serves them.
 */
export const PRODUCT_IMAGE_UPLOAD_DIR =
  process.env.PRODUCT_IMAGE_UPLOAD_DIR || path.join(process.cwd(), "public/uploads/products");

/**
 * Where category and collection artwork is written. Defaults to a sibling of
 * the product directory, so pointing `PRODUCT_IMAGE_UPLOAD_DIR` at Hostinger's
 * `sazuna-storage` moves taxonomy artwork with it and no second env var has to
 * be remembered at cutover. Still overridable on its own if the two ever need
 * to live apart.
 */
export const TAXONOMY_IMAGE_UPLOAD_DIR =
  process.env.TAXONOMY_IMAGE_UPLOAD_DIR || path.join(path.dirname(PRODUCT_IMAGE_UPLOAD_DIR), "taxonomy");

const LOGO_PATH = process.env.PRODUCT_IMAGE_LOGO_PATH || path.join(process.cwd(), "public/sazuna-logo.webp");
const SKU_FONT_PATH = process.env.PRODUCT_IMAGE_SKU_FONT_PATH;

/**
 * The logo overlay and its centred x-offset are invariant across every image, so
 * they are built once. Cached on globalThis because Next re-evaluates modules on
 * hot reload, and re-running the sharp pipeline per reload is wasteful.
 */
declare global {
  var __sazunaLogoOverlay: { buffer: Buffer; left: number } | undefined;
}

async function getLogoOverlay(): Promise<{ buffer: Buffer; left: number }> {
  if (globalThis.__sazunaLogoOverlay) return globalThis.__sazunaLogoOverlay;
  const buffer = await sharp(LOGO_PATH).resize({ width: LOGO_WIDTH }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  const width = Number(meta.width) || LOGO_WIDTH;
  const left = Math.round((SIZE - width) / 2);
  globalThis.__sazunaLogoOverlay = { buffer, left };
  return globalThis.__sazunaLogoOverlay;
}

/** Uppercase, strip anything that isn't a SKU character, cap length. */
function normaliseSku(sku: string): string {
  return (
    String(sku ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_/\- ]/g, "")
      .slice(0, 64) || "SKU"
  );
}

/** The bottom-left SKU label: maroon mono text on a white 85% rounded rect. */
async function buildSkuLabel(sku: string): Promise<OverlayOptions> {
  const safe = normaliseSku(sku);
  const paddingX = 14;
  const paddingY = 8;
  const maxTextWidth = Math.max(120, SIZE - SKU_LEFT - 50 - paddingX * 2);
  const textHeight = SKU_FONT_SIZE + 8;

  const textBuffer = await sharp({
    text: {
      text: `<span foreground="${SKU_COLOUR}" font="${SKU_FONT_SIZE}px">${safe}</span>`,
      font: "monospace",
      ...(SKU_FONT_PATH && existsSync(SKU_FONT_PATH) ? { fontfile: SKU_FONT_PATH } : {}),
      width: maxTextWidth,
      height: textHeight,
      align: "left",
      wrap: "none",
      rgba: true,
    },
  })
    .png()
    .toBuffer();

  const textMeta = await sharp(textBuffer).metadata();
  const renderedWidth = Math.max(1, Number(textMeta.width) || maxTextWidth);
  const renderedHeight = Math.max(1, Number(textMeta.height) || textHeight);
  const boxWidth = Math.min(SIZE - SKU_LEFT - 20, renderedWidth + paddingX * 2);
  const boxHeight = renderedHeight + paddingY * 2;

  const bgSvg = Buffer.from(
    `<svg width="${boxWidth}" height="${boxHeight}" viewBox="0 0 ${boxWidth} ${boxHeight}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="10" ry="10" fill="rgba(255,255,255,0.85)"/>` +
      `</svg>`,
  );

  const layer = await sharp({
    create: { width: boxWidth, height: boxHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: bgSvg, left: 0, top: 0 },
      { input: textBuffer, left: paddingX, top: Math.max(0, Math.floor((boxHeight - renderedHeight) / 2)) },
    ])
    .png()
    .toBuffer();

  return { input: layer, left: SKU_LEFT, top: SIZE - SKU_BOTTOM - boxHeight };
}

/**
 * Identify an image from its magic bytes.
 *
 * `sharp` reports every unreadable input as the same
 * "Input buffer contains unsupported image format", which names neither the
 * format nor the reason — so a production failure tells you nothing about
 * whether the file was a HEIC from someone's iPhone, a decoder this build
 * lacks, or a truncated upload. Sniffing first turns that into a sentence a
 * person can act on.
 *
 * Deliberately independent of the declared MIME type: browsers send
 * `application/octet-stream` for HEIC often enough that the header is the only
 * honest source.
 */
export function sniffImageFormat(buffer: Buffer): string {
  if (buffer.length < 12) return "empty or truncated file";
  const ascii = buffer.subarray(0, 12).toString("latin1");
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (ascii.startsWith("\x89PNG")) return "png";
  if (ascii.startsWith("GIF8")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  if (ascii.startsWith("II*\0") || ascii.startsWith("MM\0*")) return "tiff";
  if (ascii.startsWith("BM")) return "bmp";
  if (ascii.trimStart().startsWith("<")) {
    // SVG is a real image sharp can read; an HTML error page is not. Lumping
    // them together let a fetched 404 page pass the decodable check and fail
    // later with sharp's opaque message — the exact thing this exists to stop.
    const head = buffer.subarray(0, 512).toString("latin1").toLowerCase();
    if (head.includes("<svg")) return "svg";
    return "html (not an image)";
  }
  // ISO-BMFF: the brand at bytes 8-12 separates AVIF from HEIC.
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "avif";
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) return "heic";
    return `iso-bmff (${brand.trim()})`;
  }
  return "unrecognised";
}

/** Whether this sharp build can DECODE a format `sniffImageFormat` named. */
export function canDecode(format: string): boolean {
  if (format === "avif" || format === "heic") return Boolean(sharp.format.heif?.input?.buffer);
  const key = format === "svg or html" ? "svg" : format;
  const entry = (sharp.format as unknown as Record<string, { input?: { buffer?: boolean } }>)[key];
  return Boolean(entry?.input?.buffer);
}

/**
 * Refuse an image this build cannot read, with a message that says why.
 *
 * HEIC is the case that matters: it is what an iPhone produces by default, and
 * whether it can be read depends on whether the deployed `sharp` was built with
 * libheif — which differs between a laptop and shared hosting. Failing here
 * names the format and tells the admin what to do instead of leaving
 * "unsupported image format" in a log nobody can act on.
 */
function assertDecodable(source: Buffer): void {
  const format = sniffImageFormat(source);
  if (canDecode(format)) return;
  // PermanentImageError, not Error: no number of retries turns a HEIC into
  // something a build without libheif can read, and the queue must not spend
  // four more attempts and several minutes discovering that.
  if (format === "heic") {
    throw new PermanentImageError(
      "That looks like an iPhone HEIC photo, which this server's image library can't read. " +
        "Set the iPhone camera to \"Most Compatible\" (Settings > Camera > Formats), or export as JPEG first.",
    );
  }
  throw new PermanentImageError(`That file isn't a readable image (detected: ${format}).`);
}

/**
 * The per-job overlays: the shared logo, and the SKU label for one SKU.
 *
 * Built once per job and reused across that job's photos, as the reference
 * does. The logo is invariant and memoized globally; the SKU label is a pango
 * text render plus an SVG composite, and rebuilding it for every photo of the
 * same product was pure waste.
 */
export interface ImageOverlays {
  logo: { buffer: Buffer; left: number };
  skuLabel: OverlayOptions;
}

export async function buildImageOverlays(sku: string): Promise<ImageOverlays> {
  const [logo, skuLabel] = await Promise.all([getLogoOverlay(), buildSkuLabel(sku)]);
  return { logo, skuLabel };
}

/**
 * Process one raw photo into the final AVIF. `rotate()` honours the EXIF
 * orientation before the square crop, so a portrait phone photo is not stored
 * sideways. Cover-crop from the centre matches the reference; nothing is
 * letterboxed.
 *
 * `overlays` is optional so a single call site (the check script, a one-off)
 * need not build them — but a job passes its own, so a 12-photo product renders
 * the SKU label once rather than twelve times.
 */
export async function processProductImage(
  source: Buffer,
  sku: string,
  overlays?: ImageOverlays,
): Promise<Buffer> {
  if (!source?.length) throw new PermanentImageError("Image file is required.");
  assertDecodable(source);

  const { logo, skuLabel } = overlays ?? (await buildImageOverlays(sku));

  return sharp(source)
    .rotate()
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .composite([{ input: logo.buffer, left: logo.left, top: LOGO_TOP }, skuLabel])
    .avif({ quality: AVIF_QUALITY })
    .toBuffer();
}

/**
 * Process a category or collection photo into a plain 1:1 AVIF.
 *
 * Deliberately NOT `processProductImage`: taxonomy artwork is a storefront
 * banner, not a catalogue photo, so it carries neither the logo nor the SKU
 * stamp — both would be wrong on a category card, and there is no SKU to stamp.
 * Everything else (EXIF rotate, centre cover-crop, size, quality) matches, so
 * the two sit together without a visible difference in treatment.
 */
export async function processSquareImage(source: Buffer): Promise<Buffer> {
  if (!source?.length) throw new PermanentImageError("Image file is required.");
  assertDecodable(source);
  return sharp(source)
    .rotate()
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .avif({ quality: AVIF_QUALITY })
    .toBuffer();
}

/* --- storage --------------------------------------------------------------- */

function sanitiseForFilename(value: string): string {
  return (String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "product");
}

/** A raw-upload URL, e.g. /uploads/products/raw/saz-ring-001-ab12cd.jpg. */
export function rawUrl(filename: string): string {
  return `${PRODUCT_IMAGE_URL_BASE}${RAW_SUBDIR}/${filename}`;
}

/** A processed-image URL, e.g. /uploads/products/saz-ring-001-0.avif. */
export function finalUrl(filename: string): string {
  return `${PRODUCT_IMAGE_URL_BASE}${filename}`;
}

export function isRawUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith(`${PRODUCT_IMAGE_URL_BASE}${RAW_SUBDIR}/`);
}

/** Map a raw/final URL back to its absolute path on disk. */
export function pathForUrl(url: string): string | null {
  if (typeof url !== "string" || !url.startsWith(PRODUCT_IMAGE_URL_BASE)) return null;
  const relative = url.slice(PRODUCT_IMAGE_URL_BASE.length);
  // Defence in depth against traversal — the URL is app-generated, but this is
  // the boundary where a string becomes a filesystem path.
  if (relative.includes("..")) return null;
  return path.join(PRODUCT_IMAGE_UPLOAD_DIR, relative);
}

/** Persist a raw upload and return its URL. Filenames are content-addressed so
 *  the same bytes never collide and a re-upload is idempotent. */
export async function storeRawUpload(buffer: Buffer, sku: string, extension: string): Promise<string> {
  const dir = path.join(PRODUCT_IMAGE_UPLOAD_DIR, RAW_SUBDIR);
  await mkdir(dir, { recursive: true });
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 10);
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const filename = `${sanitiseForFilename(sku)}-${digest}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return rawUrl(filename);
}

/** Write a processed AVIF for a product's Nth image and return its URL. */
export async function storeProcessedImage(buffer: Buffer, sku: string, index: number): Promise<string> {
  await mkdir(PRODUCT_IMAGE_UPLOAD_DIR, { recursive: true });
  const filename = processedFilename(buffer, sku, index);
  await writeFile(path.join(PRODUCT_IMAGE_UPLOAD_DIR, filename), buffer);
  return finalUrl(filename);
}

function processedFilename(buffer: Buffer, sku: string, index: number): string {
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 8);
  return `${sanitiseForFilename(sku)}-${index}-${digest}.avif`;
}

/* --- staged publish -------------------------------------------------------- */

/**
 * Encoded output lands in a per-job staging directory and only moves into place
 * as part of the database transaction that references it, following the
 * reference app.
 *
 * The reason is the same there and here: the moment a file appears under
 * `/uploads/products/` it is servable, so publishing before the commit means a
 * job that is then cancelled — superseded by a newer upload, or whose claim was
 * stolen — has already scattered files nothing points at. Staging keeps "the
 * bytes exist" and "the product uses them" a single decision.
 *
 * `rename` rather than the reference's `copyFile`: staging sits inside the
 * upload root, so it is the same filesystem, and a rename is atomic and does
 * not read a 60 KB file back through the process for every photo.
 */
export interface StagedImage {
  /** Where the file is now. */
  stagedPath: string;
  /** Where it goes on publish. */
  finalPath: string;
  /** The URL it will be served at. */
  url: string;
}

export async function createStagingDir(jobId: number): Promise<string> {
  const suffix = createHash("sha256")
    .update(`${jobId}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  const dir = path.join(PRODUCT_IMAGE_UPLOAD_DIR, ".staging", `job-${jobId}-${suffix}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function stageProcessedImage(
  stagingDir: string,
  buffer: Buffer,
  sku: string,
  index: number,
): Promise<StagedImage> {
  const filename = processedFilename(buffer, sku, index);
  const stagedPath = path.join(stagingDir, filename);
  await writeFile(stagedPath, buffer);
  return {
    stagedPath,
    finalPath: path.join(PRODUCT_IMAGE_UPLOAD_DIR, filename),
    url: finalUrl(filename),
  };
}

/** Move staged files into the served directory. Call inside the transaction. */
export async function publishStagedImages(staged: readonly StagedImage[]): Promise<void> {
  await mkdir(PRODUCT_IMAGE_UPLOAD_DIR, { recursive: true });
  for (const item of staged) {
    await rename(item.stagedPath, item.finalPath);
  }
}

/** Discard a staging directory and everything in it. Never throws. */
export async function discardStagingDir(stagingDir: string): Promise<void> {
  if (!stagingDir) return;
  await rm(stagingDir, { recursive: true, force: true }).catch(() => {
    // Cleanup is best effort — a leftover staging directory is inert.
  });
}

/**
 * Delete files, tolerating the ones already gone.
 *
 * Used for two things: the raw originals once a job has succeeded (the
 * reference does the same — a raw 4 MB JPEG has no purpose once its 60 KB AVIF
 * exists, and on the Hostinger storage volume they would otherwise accumulate
 * forever), and rolling back a publish whose transaction then failed.
 */
export async function removeFiles(paths: readonly string[]): Promise<number> {
  let removed = 0;
  await Promise.all(
    paths.map(async (filePath) => {
      if (!filePath) return;
      try {
        await unlink(filePath);
        removed += 1;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // ENOENT means somebody got there first, which is the desired state.
        if (code !== "ENOENT") {
          console.warn(`[admin] could not remove ${filePath}: ${code ?? "unknown error"}`);
        }
      }
    }),
  );
  return removed;
}

/** Resolve a list of image URLs to absolute paths, dropping ones outside the root. */
export function pathsForUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const filePath = pathForUrl(url);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    out.push(filePath);
  }
  return out;
}

/**
 * Process and store a taxonomy image in one step, returning its URL. There is
 * no raw/processed split here: a category has exactly one image, replacing it
 * is the only edit, and nothing reprocesses later, so keeping the original
 * would only accumulate orphans. `slugBase` names the file readably; the
 * content digest keeps a re-upload idempotent and two categories' images apart.
 */
export async function storeSquareImage(source: Buffer, slugBase: string): Promise<string> {
  const processed = await processSquareImage(source);
  await mkdir(TAXONOMY_IMAGE_UPLOAD_DIR, { recursive: true });
  const digest = createHash("sha256").update(processed).digest("hex").slice(0, 8);
  const filename = `${sanitiseForFilename(slugBase)}-${digest}.avif`;
  await writeFile(path.join(TAXONOMY_IMAGE_UPLOAD_DIR, filename), processed);
  return `${TAXONOMY_IMAGE_URL_BASE}${filename}`;
}

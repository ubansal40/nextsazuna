import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

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
 *   - There is no background worker (`output: standalone` has none) — the upload
 *     route processes the job inline. This module is the processing half; the
 *     job queue and route are its callers.
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
 * Process one raw photo into the final AVIF. `rotate()` honours the EXIF
 * orientation before the square crop, so a portrait phone photo is not stored
 * sideways. Cover-crop from the centre matches the reference; nothing is
 * letterboxed.
 */
export async function processProductImage(source: Buffer, sku: string): Promise<Buffer> {
  if (!source?.length) throw new Error("Image file is required.");

  const [logo, skuLabel] = await Promise.all([getLogoOverlay(), buildSkuLabel(sku)]);

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
  if (!source?.length) throw new Error("Image file is required.");
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
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 8);
  const filename = `${sanitiseForFilename(sku)}-${index}-${digest}.avif`;
  await writeFile(path.join(PRODUCT_IMAGE_UPLOAD_DIR, filename), buffer);
  return finalUrl(filename);
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

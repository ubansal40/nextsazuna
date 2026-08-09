import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

/**
 * The product image pipeline.
 *
 * Every raw photo becomes a 1000×1000 AVIF with the Sazuna logo composited
 * top-centre and the SKU stamped bottom-left on a translucent rounded label.
 * The constants (size, logo width/top, SKU font/left/bottom, AVIF quality) are
 * sazuna-unik 2's verbatim, so a product photographed for the old shop and one
 * uploaded here come out identical.
 *
 * Processing happens **inside the upload request**, one photo at a time. It used
 * to happen in a database-backed job queue with claim tokens, retry backoff and
 * a cron to turn the crank — all of which existed to solve one problem: a save
 * carrying twelve photos took longer than a request may live. Uploading one
 * photo per request makes that problem disappear, and with it the queue, the
 * `product_image_jobs` table, the stranded-job recovery, and the class of bug
 * where a product sits "Processing" forever because nothing triggered a drain.
 * What replaces the queue's memory ceiling is `image-limit.ts`.
 *
 * One deliberate difference from the reference, invisible in the output: the SKU
 * label uses the system monospace font by default rather than a bundled Menlo.ttf
 * (an Apple font this repo won't redistribute). Set `PRODUCT_IMAGE_SKU_FONT_PATH`
 * to a .ttf/.otf to pin the exact glyphs; otherwise pango falls back to the
 * platform mono. The stamp is verified to have actually rendered — see
 * `assertRendered` — because a silently blank label ships an unstamped photo.
 */

const SIZE = 1000;
const LOGO_WIDTH = 50;
const LOGO_TOP = 25;
const SKU_FONT_SIZE = 19;
const SKU_LEFT = 24;
const SKU_BOTTOM = 20;
const AVIF_QUALITY = 75;

/** The reference's SKU watermark colour. */
const SKU_COLOUR = "#d51b40";

export const PRODUCT_IMAGE_URL_BASE = "/uploads/products/";

/** Taxonomy artwork lives beside the product images, under the same
 *  `/uploads/*` alias, so one serving rule covers both. */
export const TAXONOMY_IMAGE_URL_BASE = "/uploads/taxonomy/";

/**
 * Where processed files are written. Env-overridable and absolute in
 * production — it points at the Hostinger `sazuna-storage` directory so images
 * survive a deploy (anything inside the app directory is destroyed when
 * `hbuilds/current` is repointed). In development it defaults under `public/` so
 * `next dev` serves them.
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
 * A failure that retrying cannot fix — an unreadable file, a HEIC on a build
 * without libheif, an empty upload.
 *
 * The queue used this to decide between four more attempts and giving up. With
 * the queue gone it still earns its place: the upload route answers 400 for a
 * permanent failure (the operator must do something about the file) and 500 for
 * anything else (ours to fix), and that distinction is the difference between a
 * useful error message and "upload failed".
 */
export class PermanentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentImageError";
  }
}

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

/**
 * Uppercase, strip anything that isn't a SKU character, cap length.
 *
 * The allowlist has to stay narrow because this string is interpolated into
 * pango markup, where `<`, `>`, `&` and `"` would be parsed rather than drawn.
 * But it must not be so narrow that it silently rewrites the code it is meant to
 * record: `.` is here because a SKU like `DLR10102-22KT-YG-0.75CT` was being
 * stamped as `…YG-075CT`, which is a different, wrong, entirely plausible-looking
 * SKU burned into a photograph nobody would think to re-read.
 */
export function normaliseSku(sku: string): string {
  return (
    String(sku ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_./\- ]/g, "")
      .slice(0, 64) || "SKU"
  );
}

/**
 * Assert that a rendered layer actually contains something.
 *
 * The failure this exists for: if fontconfig has no usable monospace face,
 * pango does not error — it returns a correctly-sized, completely transparent
 * bitmap. Composite that and you get a photo with no SKU on it, published, with
 * nothing in any log. It looks like the stamp was never asked for.
 *
 * Checking the alpha channel's maximum is the cheapest honest test: a blank
 * render is uniformly transparent, and any glyph at all puts an opaque pixel
 * somewhere.
 */
async function assertRendered(layer: Buffer, what: string): Promise<void> {
  const stats = await sharp(layer).stats();
  const alpha = stats.channels[3];
  const visible = alpha ? alpha.max > 0 : stats.channels.some((c) => c.max > 0);
  if (!visible) {
    throw new Error(
      `The ${what} rendered blank — this server has no usable monospace font for the SKU stamp. ` +
        "Install one, or set PRODUCT_IMAGE_SKU_FONT_PATH to a .ttf/.otf.",
    );
  }
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

  // Before it is composited, not after: an unstamped photo must never reach
  // disk, and the operator must be told why rather than discovering it later.
  await assertRendered(textBuffer, "SKU stamp");

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
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return "ico";
  if (buffer[0] === 0xff && buffer[1] === 0x0a) return "jxl";
  if (ascii.slice(4, 8) === "JXL ") return "jxl";
  if (ascii.slice(4, 8) === "jP  " || ascii.startsWith("\0\0\0\x0cjP")) return "jp2";
  if (ascii.trimStart().startsWith("<")) {
    // SVG is a real image sharp can read; an HTML error page is not. Lumping
    // them together let a fetched 404 page pass and fail later with sharp's
    // opaque message — the exact thing this exists to stop.
    const head = buffer.subarray(0, 512).toString("latin1").toLowerCase();
    if (head.includes("<svg")) return "svg";
    return "html (not an image)";
  }
  // ISO-BMFF: the brand at bytes 8-12 says which flavour.
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "avif";
    // The HEIC family is wider than the two brands an iPhone usually writes:
    // bursts and Live Photos use `msf1`, some cameras `heim`/`heis`/`hevc`, and
    // a plain MIAF file is `mif1`/`miaf`. Naming them all keeps the "switch to
    // Most Compatible" advice attached to the files it actually applies to.
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|miaf|mia)/i.test(brand)) return "heic";
    return `iso-bmff (${brand.trim()})`;
  }
  return "unrecognised";
}

/** Whether this sharp build advertises a decoder for a format `sniffImageFormat`
 *  named. Advisory only — the authority is whether the decode actually works. */
export function canDecode(format: string): boolean {
  if (format === "avif" || format === "heic") return Boolean(sharp.format.heif?.input?.buffer);
  const entry = (sharp.format as unknown as Record<string, { input?: { buffer?: boolean } }>)[format];
  return Boolean(entry?.input?.buffer);
}

/**
 * Refuse only what is certainly not a photograph.
 *
 * This used to be an allowlist: sniff the format, look it up in
 * `sharp.format`, refuse anything not on the list. That is the wrong shape for
 * a gate, because the list can only ever be NARROWER than what libvips can
 * really read — every format the sniffer had not been taught about was refused
 * even when the decoder was sitting right there, and every future libvips gains
 * nothing until someone edits this file. It also silently depended on the
 * sniffer's names matching sharp's keys, which is how an ISO-BMFF brand of
 * `msf1` (an ordinary iPhone burst) got refused as unreadable.
 *
 * So the decoder is the authority now. Anything that could plausibly be an
 * image is handed to sharp; the sniff is kept for the error message, which is
 * the job it was always best at. Only two inputs are rejected without trying:
 * an empty file, and HTML — the latter because a fetched error page really is
 * the common case and "that's a web page, not a photo" beats anything sharp
 * would say about it.
 */
function assertPlausibleImage(source: Buffer): void {
  if (!source?.length) throw new PermanentImageError("Image file is required.");
  const format = sniffImageFormat(source);
  if (format === "empty or truncated file") {
    throw new PermanentImageError("That file is empty or was cut off mid-upload. Try again.");
  }
  if (format === "html (not an image)") {
    throw new PermanentImageError("That's a web page, not a photo — check you saved the image itself.");
  }
}

/**
 * Turn a decode failure into a sentence the operator can act on.
 *
 * `sharp` reports every input it cannot read as the same "Input buffer contains
 * unsupported image format", which names neither the format nor the reason. The
 * sniff is what turns that into advice — and the branch that matters is HEIC,
 * because whether it can be read depends on the deployed libheif, which differs
 * between a laptop and shared hosting.
 */
function decodeFailure(source: Buffer, cause: unknown): PermanentImageError {
  const format = sniffImageFormat(source);
  const message = cause instanceof Error ? cause.message : "";

  // Not a format problem: the file is a format we DO read, so it is damaged,
  // truncated, or absurdly large. Saying "unsupported" here would send the
  // operator off to convert a file that needs re-exporting instead.
  if (/exceeds pixel limit/i.test(message)) {
    return new PermanentImageError("That image is too large to process. Resize it and try again.");
  }
  if (canDecode(format)) {
    return new PermanentImageError(
      `That ${format.toUpperCase()} file couldn't be read — it may be corrupted or incomplete. Try re-saving it.`,
    );
  }

  if (format === "heic") {
    return new PermanentImageError(
      "That looks like an iPhone HEIC photo, which this server's image library can't read. " +
        'Set the iPhone camera to "Most Compatible" (Settings > Camera > Formats), or export as JPEG first.',
    );
  }
  if (format === "unrecognised") {
    return new PermanentImageError("That file doesn't look like an image. Upload a JPEG, PNG, HEIC or WebP.");
  }
  return new PermanentImageError(
    `This server can't read ${format} images. Save the photo as JPEG or PNG and upload it again.`,
  );
}

/**
 * Process one raw photo into the final AVIF. `rotate()` honours the EXIF
 * orientation before the square crop, so a portrait phone photo is not stored
 * sideways. Cover-crop from the centre matches the reference; nothing is
 * letterboxed.
 */
export async function processProductImage(source: Buffer, sku: string): Promise<Buffer> {
  assertPlausibleImage(source);

  const [logo, skuLabel] = await Promise.all([getLogoOverlay(), buildSkuLabel(sku)]);

  try {
    return await sharp(source)
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .composite([{ input: logo.buffer, left: logo.left, top: LOGO_TOP }, skuLabel])
      .avif({ quality: AVIF_QUALITY })
      .toBuffer();
  } catch (error) {
    // The overlays are ours; only the source can fail to decode. Anything the
    // logo or the stamp threw is a server fault and must NOT be reported to the
    // operator as a bad photograph.
    if (error instanceof Error && /stamp|monospace font/i.test(error.message)) throw error;
    throw decodeFailure(source, error);
  }
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
  assertPlausibleImage(source);
  try {
    return await sharp(source)
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .avif({ quality: AVIF_QUALITY })
      .toBuffer();
  } catch (error) {
    throw decodeFailure(source, error);
  }
}

/* --- storage --------------------------------------------------------------- */

function sanitiseForFilename(value: string): string {
  return (String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "product");
}

/** A processed-image URL, e.g. /uploads/products/saz-ring-001-ab12cd34.avif. */
export function finalUrl(filename: string): string {
  return `${PRODUCT_IMAGE_URL_BASE}${filename}`;
}

/** Map a processed URL back to its absolute path on disk. */
export function pathForUrl(url: string): string | null {
  if (typeof url !== "string" || !url.startsWith(PRODUCT_IMAGE_URL_BASE)) return null;
  const relative = url.slice(PRODUCT_IMAGE_URL_BASE.length);
  // Defence in depth against traversal — the URL is app-generated, but this is
  // the boundary where a string becomes a filesystem path.
  if (!relative || relative.includes("..")) return null;
  return path.join(PRODUCT_IMAGE_UPLOAD_DIR, relative);
}

/**
 * Process a photo and store it, returning the URL the product will point at.
 *
 * The whole of the upload path in one call: nothing intermediate is written, so
 * there is no raw directory to serve, no staging directory to publish from, and
 * no originals accumulating on the storage volume. A 4 MB phone photo becomes a
 * ~60 KB AVIF and the 4 MB never touches the disk.
 *
 * Filenames are content-addressed over the *processed* bytes, so re-uploading
 * the same photo for the same SKU overwrites one file instead of accumulating
 * near-duplicates — which is what makes a discarded upload cheap.
 */
export async function storeProductImage(source: Buffer, sku: string): Promise<string> {
  const processed = await processProductImage(source, sku);
  await mkdir(PRODUCT_IMAGE_UPLOAD_DIR, { recursive: true });
  const digest = createHash("sha256").update(processed).digest("hex").slice(0, 8);
  const filename = `${sanitiseForFilename(sku)}-${digest}.avif`;
  await writeFile(path.join(PRODUCT_IMAGE_UPLOAD_DIR, filename), processed);
  return finalUrl(filename);
}

/**
 * Process and store a taxonomy image in one step, returning its URL. A category
 * has exactly one image, replacing it is the only edit, and nothing reprocesses
 * later. `slugBase` names the file readably; the content digest keeps a
 * re-upload idempotent and two categories' images apart.
 */
export async function storeSquareImage(source: Buffer, slugBase: string): Promise<string> {
  const processed = await processSquareImage(source);
  await mkdir(TAXONOMY_IMAGE_UPLOAD_DIR, { recursive: true });
  const digest = createHash("sha256").update(processed).digest("hex").slice(0, 8);
  const filename = `${sanitiseForFilename(slugBase)}-${digest}.avif`;
  await writeFile(path.join(TAXONOMY_IMAGE_UPLOAD_DIR, filename), processed);
  return `${TAXONOMY_IMAGE_URL_BASE}${filename}`;
}

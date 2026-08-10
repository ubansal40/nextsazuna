"use client";

/**
 * Shrink a photo to the final 1000×1000 crop **before** it is uploaded.
 *
 * A phone photo is 3–8 MB; the AVIF it becomes is ~60 KB. Sending the full
 * original means the operator waits on a Nepali mobile connection for pixels
 * the server is about to throw away — and it means the server holds a decoded
 * 4032×3024 bitmap (~48 MB) per photo, which on shared hosting is the thing
 * that gets the process OOM-killed.
 *
 * Doing the crop here makes the upload ~150 KB and the server's own resize a
 * no-op, because the image already arrives at exactly the size and aspect it
 * would have been cropped to. Identical geometry: short side scaled to 1000,
 * centred, square — the same rule as `processProductImage`.
 *
 * **This is an optimisation and nothing more.** Every uncertain path falls back
 * to uploading the original, because the server is the thing that actually has
 * to work: a browser that cannot decode HEIC (every desktop browser), a missing
 * API, an encoder that returns something unexpected, an image already small
 * enough — all of them just send the file as it came. The server crops, stamps
 * and encodes regardless and never trusts what arrives.
 */

/** The server's output size. Matching it exactly is what makes its resize free. */
const TARGET = 1000;

/**
 * Quality for the intermediate encode.
 *
 * Cropping here means the photo is encoded twice — WebP now, AVIF on the server
 * — so this number is the entire cost of doing the work in the browser at all.
 * Measured on a real 4032×3024 upload (827 KB), against the same photo taken
 * straight to AVIF with no client step, as PSNR against the uncompressed
 * 1000×1000 crop (measured while the server encoded at quality 75; the server
 * now uses 88, which shifts every row up but not the gaps between them):
 *
 *     no client step      45.08 dB    827 KB uploaded
 *     WebP 0.92           43.44 dB     82 KB uploaded   -1.64 dB
 *     WebP 0.95           44.02 dB    120 KB uploaded   -1.06 dB
 *     WebP 0.98           44.30 dB    159 KB uploaded   -0.78 dB
 *     WebP lossless       45.13 dB    633 KB uploaded    none
 *
 * 0.95 is the knee: it recovers a third of the loss for 38 KB, where 0.98 buys
 * a third as much again for twice that, and lossless gives up the entire reason
 * for cropping here. Everything in that table is above 43 dB, which is
 * visually lossless for a photograph — the choice is about headroom, not about
 * anything an operator could see.
 *
 * Note this only costs UPLOAD bytes. The stored file is re-encoded to AVIF
 * either way, so a higher number here never makes the storefront heavier.
 */
const QUALITY = 0.95;

export interface PreparedPhoto {
  /** What to upload — the resized blob, or the original file untouched. */
  body: Blob;
  /** Filename to send. Kept close to the original so server logs stay readable. */
  filename: string;
  /** False when we fell back to the original, for whatever reason. */
  resized: boolean;
}

function fallback(file: File): PreparedPhoto {
  return { body: file, filename: file.name, resized: false };
}

/**
 * Encode a canvas, preferring WebP and checking we actually got it.
 *
 * `toBlob` with an unsupported type does not fail — it silently produces PNG,
 * which for a photograph is several megabytes and would make this whole
 * function counterproductive. So the result's type is verified rather than
 * assumed.
 */
async function encode(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  const toBlob = async (type: string): Promise<Blob | null> => {
    if (canvas instanceof OffscreenCanvas) {
      try {
        return await canvas.convertToBlob({ type, quality: QUALITY });
      } catch {
        return null;
      }
    }
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  };

  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  return jpeg && jpeg.type === "image/jpeg" ? jpeg : null;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (typeof createImageBitmap !== "function") return fallback(file);

  let source: ImageBitmap | null = null;
  let cropped: ImageBitmap | null = null;

  try {
    /**
     * `imageOrientation: "from-image"` is not optional.
     *
     * The EXIF rotation flag is what makes a portrait phone photo portrait. The
     * canvas keeps raw pixels and drops metadata, so decoding without applying
     * orientation here would upload a sideways image with nothing left to say
     * it should be turned — and `sharp.rotate()` on the server would find no
     * EXIF to act on. Every photo taken in portrait would be wrong.
     */
    source = await createImageBitmap(file, { imageOrientation: "from-image" });

    const short = Math.min(source.width, source.height);
    // Already at or below the target: upscaling would invent detail and
    // re-encoding would only lose some. Send it as it is.
    if (short <= TARGET) return fallback(file);

    // The same centre cover-crop the server would apply: take the largest
    // centred square, then scale it to exactly 1000×1000.
    const sx = Math.round((source.width - short) / 2);
    const sy = Math.round((source.height - short) / 2);

    /**
     * Crop and resample in one step via `createImageBitmap`, not
     * `drawImage`. A single drawImage from 4032px to 1000px is a 4× reduction
     * that most browsers do with bilinear filtering, which aliases visibly on
     * exactly the things jewellery photographs are full of — chain links,
     * engraving, prong edges. `resizeQuality: "high"` asks for a proper
     * downsampling filter instead.
     */
    cropped = await createImageBitmap(source, sx, sy, short, short, {
      resizeWidth: TARGET,
      resizeHeight: TARGET,
      resizeQuality: "high",
    });

    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(TARGET, TARGET)
        : Object.assign(document.createElement("canvas"), { width: TARGET, height: TARGET });

    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return fallback(file);
    ctx.drawImage(cropped, 0, 0);

    const blob = await encode(canvas);
    if (!blob) return fallback(file);

    // A "smaller" version that is bigger helps nobody. Rare, but possible on a
    // photo that was already heavily compressed.
    if (blob.size >= file.size) return fallback(file);

    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return { body: blob, filename: `${stem}.${extension}`, resized: true };
  } catch {
    // The common case here is HEIC on a desktop browser, which cannot decode it
    // — and the server can. Silence is correct: the upload still works.
    return fallback(file);
  } finally {
    source?.close();
    cropped?.close();
  }
}

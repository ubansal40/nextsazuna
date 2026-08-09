/**
 * Limits shared by the editor and the routes that enforce them.
 *
 * In its own module, with no `server-only` and no imports, because the browser
 * needs the same numbers the server refuses on. A client that lets you attach a
 * sixth photo and a server that rejects it is a worse experience than either
 * rule alone.
 */

/** Photos per product. Generous for a jewellery piece; keeps product pages fast. */
export const MAX_PRODUCT_PHOTOS = 5;

/**
 * Per-photo upload ceiling.
 *
 * 25 MB rather than the old 15: a current iPhone shooting 48 MP, or anything in
 * ProRAW, routinely exceeds 15 MB, and that limit rejected real photographs
 * taken by the people who actually use this screen.
 */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export function photoSizeLimitMessage(): string {
  return `Each photo must be under ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB.`;
}

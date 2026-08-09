import { formatPrice } from "@/lib/format";
import type { AdminProductListItem } from "@/lib/admin/product-projection";

/**
 * The picker's clipboard, share and download plumbing.
 *
 * Split out of the screen because this is the part with real failure modes, and
 * the screen should read as layout. Everything here runs in the browser; nothing
 * imports a `server-only` module.
 *
 * THE CONSTRAINT THAT SHAPES ALL OF IT: 2,579 of the 2,585 photographed products
 * still have their image on silveejewels.com. `fetch` cannot read a cross-origin
 * response without CORS headers that host does not send, so those photos cannot
 * be turned into a File — not by this code, not by any code in the page. Share
 * and download therefore say which pieces were skipped and why, instead of
 * failing with a shrug or, worse, appearing to work.
 */

/** Where the legacy imagery still lives — named in the copy so the fix is obvious. */
export const LEGACY_IMAGE_HOST = "silveejewels.com";

/**
 * Can the browser actually read the bytes behind this URL?
 *
 * A processed image is stored as a root-relative path (`/uploads/products/…`)
 * and is therefore same-origin. Anything absolute is only reachable if it
 * happens to point back at us.
 */
export function isFetchableImage(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  if (typeof window === "undefined") return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** How many of a selection are stranded on the legacy host. */
export function countUnreachable(items: AdminProductListItem[]): number {
  return items.reduce((total, item) => (isFetchableImage(item.imageUrl) ? total : total + 1), 0);
}

/**
 * Spec `_detailText()` — one line per piece, `SKU – price`, ready to paste into
 * a chat. The separator is an en dash, as in the spec; the price is the one the
 * customer would pay.
 */
export function detailText(items: AdminProductListItem[]): string {
  return items
    .map((item) => {
      // formatPrice returns null for an absent price rather than "रु NaN", and a
      // line ending in a dangling dash would be pasted straight into a chat.
      const price = formatPrice(item.effectivePrice);
      return price ? `${item.sku} – ${price}` : item.sku;
    })
    .join("\n");
}

/**
 * Exact sum of money strings, for the selection drawer's subtotal.
 *
 * Money is a DECIMAL string end to end (ADR 0003) and must never round-trip
 * through a float. `"1250.75" + "99.25"` parsed as floats and added is where the
 * classic 0.1 + 0.2 error gets into a total, so the digits are read into integer
 * hundredths and only whole numbers are ever added. That is exact: the dearest
 * piece in the catalogue is ~2.3 million rupees, i.e. 2.3e8 hundredths, and even
 * a full 50-piece batch stays five orders of magnitude below
 * `Number.MAX_SAFE_INTEGER`, where integer addition is exact by definition.
 *
 * Returned as a string so `formatPrice` still does the only conversion, at the
 * edge, as everywhere else.
 */
export function sumMoney(values: string[]): string {
  let hundredths = 0;
  for (const value of values) {
    const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
    if (!match) continue;
    const [, sign, whole, fraction = ""] = match;
    const amount = Number(whole || "0") * 100 + Number(`${fraction}00`.slice(0, 2));
    if (!Number.isSafeInteger(amount)) continue;
    hundredths += sign === "-" ? -amount : amount;
  }
  const negative = hundredths < 0;
  const magnitude = Math.abs(hundredths);
  const rupees = Math.floor(magnitude / 100);
  const paisa = magnitude - rupees * 100;
  return `${negative ? "-" : ""}${rupees}.${String(paisa).padStart(2, "0")}`;
}

export interface MediaBatch {
  files: File[];
  /** Pieces whose photo lives on another host, so the browser cannot read it. */
  unreachable: number;
  /** Pieces whose photo is same-origin but did not load. */
  failed: number;
}

function extensionFor(type: string): string {
  const subtype = type.split("/")[1] ?? "";
  if (subtype.startsWith("jpeg")) return "jpg";
  if (subtype.startsWith("svg")) return "svg";
  return subtype.replace(/[^a-z0-9]/gi, "") || "img";
}

/** A filename a phone's gallery and a desktop's Downloads folder both accept. */
function filenameFor(sku: string, type: string): string {
  const stem = sku.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "product";
  return `${stem}.${extensionFor(type)}`;
}

/** Fetch what can be fetched; count — never hide — what cannot. */
export async function collectImages(items: AdminProductListItem[]): Promise<MediaBatch> {
  const files: File[] = [];
  let unreachable = 0;
  let failed = 0;

  for (const item of items) {
    if (!isFetchableImage(item.imageUrl)) {
      unreachable += 1;
      continue;
    }
    try {
      const response = await fetch(item.imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const type = blob.type || "image/avif";
      files.push(new File([blob], filenameFor(item.sku, type), { type }));
    } catch {
      failed += 1;
    }
  }

  return { files, unreachable, failed };
}

/**
 * Why a batch produced no files. Deliberately specific: "sharing didn't go
 * through" sends someone to check their wifi when the real answer is that the
 * photos are on a host we do not control yet.
 */
export function emptyBatchMessage(batch: MediaBatch): string {
  if (batch.unreachable > 0 && batch.failed === 0) {
    return `Those photos are still hosted on ${LEGACY_IMAGE_HOST}, so the browser can't read them from here. Copy the details instead, or re-upload the piece to move its photo into Sazuna storage.`;
  }
  if (batch.failed > 0 && batch.unreachable === 0) {
    return "Couldn't load the photos. Check the connection and try again.";
  }
  return `Couldn't load the photos — ${batch.unreachable} of them are still hosted on ${LEGACY_IMAGE_HOST}.`;
}

/** The "it worked, but not for all of them" line. */
export function skippedNote(skipped: number): string {
  return ` · ${skipped} skipped (photos still on ${LEGACY_IMAGE_HOST})`;
}

/** Trigger a save for each file. */
export function saveFiles(files: File[]): void {
  files.forEach((file, index) => {
    // Staggered: browsers throttle or drop a burst of simultaneous downloads.
    window.setTimeout(() => {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoking straight after click() can cancel the save before the browser
      // has finished reading the blob — hold the URL well past the handover.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, index * 200);
  });
}

export type ShareOutcome =
  | { kind: "shared"; count: number; skipped: number }
  | { kind: "downloaded"; count: number; skipped: number }
  /** The user dismissed the OS share sheet — not a failure, and not worth a toast. */
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Share the selection's photos as files where the platform supports it (Android
 * Chrome, iOS Safari — where this lands in WhatsApp directly), and fall back to
 * saving them on desktop, where `navigator.share` either does not exist or
 * cannot carry files.
 */
export async function shareImages(items: AdminProductListItem[]): Promise<ShareOutcome> {
  const batch = await collectImages(items);
  if (batch.files.length === 0) return { kind: "failed", message: emptyBatchMessage(batch) };

  const skipped = batch.unreachable + batch.failed;
  const title = `Sazuna · ${batch.files.length} ${batch.files.length === 1 ? "piece" : "pieces"}`;
  const canShare = typeof navigator.canShare === "function" ? navigator.canShare.bind(navigator) : null;

  if (typeof navigator.share === "function" && canShare?.({ files: batch.files })) {
    // Some platforms accept files but reject a files+text payload, so the
    // richer form is offered only when canShare vouches for it.
    const withText: ShareData = { files: batch.files, title, text: detailText(items) };
    const payload: ShareData = canShare(withText) ? withText : { files: batch.files, title };
    try {
      await navigator.share(payload);
      return { kind: "shared", count: batch.files.length, skipped };
    } catch (error) {
      if (isAbort(error)) return { kind: "cancelled" };
      // A share that errors for any other reason falls through to the download
      // path — the operator still ends up with the photos.
    }
  }

  saveFiles(batch.files);
  return { kind: "downloaded", count: batch.files.length, skipped };
}

/** Download the processed photos for the selection. */
export async function downloadImages(items: AdminProductListItem[]): Promise<ShareOutcome> {
  const batch = await collectImages(items);
  if (batch.files.length === 0) return { kind: "failed", message: emptyBatchMessage(batch) };
  saveFiles(batch.files);
  return { kind: "downloaded", count: batch.files.length, skipped: batch.unreachable + batch.failed };
}

/** Copy SKU + price for the selection. Resolves false when the clipboard refused. */
export async function copyDetails(items: AdminProductListItem[]): Promise<boolean> {
  const text = detailText(items);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

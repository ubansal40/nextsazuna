import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { CONTENT_IMAGE_UPLOAD_DIR, PRODUCT_IMAGE_UPLOAD_DIR, TAXONOMY_IMAGE_UPLOAD_DIR } from "@/lib/admin/images";

/**
 * Serve uploaded images — GET /uploads/**
 *
 * In development `PRODUCT_IMAGE_UPLOAD_DIR` sits under `public/`, so Next's own
 * static handler answers first and this route never runs. In production it
 * points at Hostinger's `sazuna-storage`, which is OUTSIDE the app — nothing
 * serves it unless a LiteSpeed `/uploads/*` alias exists, and until one does,
 * `next/image` fetches the URL, gets nothing, and logs
 * "The requested resource isn't a valid image … received null". Every
 * admin-uploaded photo is invisible on the storefront.
 *
 * Making the app serve them removes that dependency on web-server
 * configuration: the same URL works in dev, in production, with or without the
 * alias. If the alias is later configured it simply wins, and this becomes dead
 * weight rather than a conflict.
 *
 * Files are content-addressed (the digest is in the filename), so a given URL's
 * bytes never change and `immutable` caching is honest rather than optimistic.
 */

/**
 * First URL segment -> upload root.
 *
 * The roots already END with their own folder name (`…/uploads/products`), and
 * the URLs are `/uploads/products/x.avif`, so that segment SELECTS the root
 * rather than forming part of the path beneath it. Joining the whole segment
 * list onto the root would look for `…/uploads/products/products/x.avif`.
 */
const ROOTS: Record<string, string> = {
  products: PRODUCT_IMAGE_UPLOAD_DIR,
  taxonomy: TAXONOMY_IMAGE_UPLOAD_DIR,
  content: CONTENT_IMAGE_UPLOAD_DIR,
};

const CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

/**
 * Resolve a URL segment list to a real file inside one of the upload roots.
 *
 * The guard is `resolve`-then-prefix-check rather than a scan for "..": the
 * segments arrive decoded, so a check on the raw string can be walked around
 * with `%2e%2e`, while a resolved absolute path cannot lie about where it
 * points. `path.sep` is appended to the root so `/uploads-evil` cannot pass a
 * naive `startsWith("/uploads")`.
 */
function resolveUpload(segments: string[]): { file: string; type: string } | null {
  if (segments.length < 2 || segments.some((s) => !s || s === "." || s === "..")) return null;

  const [kind, ...rest] = segments;
  const root = ROOTS[kind];
  if (!root) return null;

  const relative = rest.join("/");
  const type = CONTENT_TYPES[path.extname(relative).toLowerCase()];
  if (!type) return null;

  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep)) return null;

  try {
    return statSync(file).isFile() ? { file, type } : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  const found = resolveUpload(segments ?? []);
  // One response for "outside the root", "wrong extension" and "not there", so
  // this cannot be used to probe the filesystem.
  if (!found) return new Response("Not found", { status: 404 });

  const { size } = statSync(found.file);
  const body = Readable.toWeb(createReadStream(found.file)) as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": found.type,
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // These are product photos, not documents — but the filename is
      // attacker-influenced only through the SKU, which is sanitised. Belt and
      // braces against a content-sniffing surprise.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

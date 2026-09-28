/**
 * Where a storefront image may come from, and the one check that enforces it.
 *
 * `next.config.ts` hands `REMOTE_IMAGE_PATTERNS` to next/image, and
 * `servableImageUrl` screens every database-sourced URL against the same list
 * before it reaches an `<Image>`. They used to be two separate decisions: the
 * config named one host while the guards accepted any `https://` URL, so a
 * single photo on another host — the migration's seed products, or anything an
 * admin pasted — was handed to next/image anyway. In development that throws
 * and the whole listing 500s; in production the optimizer refuses the URL and
 * the card shows a broken image. Neither is a placeholder.
 *
 * No `server-only`: the config, the catalog and the homepage parser all read it.
 */

export interface RemoteImagePattern {
  protocol: "https" | "http";
  hostname: string;
  /** A glob over the URL's path: `*` stays within one segment, `**` spans any. */
  pathname: string;
}

/**
 * Product imagery is hosted on silveejewels.com (2,575 of 2,577 active
 * products). Worth naming: the storefront's images depend on a separate site
 * staying up. That coupling is inherited from the Express app, not introduced
 * here, but it should move to storage this project controls before launch.
 */
export const REMOTE_IMAGE_PATTERNS: readonly RemoteImagePattern[] = [
  { protocol: "https", hostname: "silveejewels.com", pathname: "/wp-content/uploads/**" },
];

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] !== "*") {
      source += glob[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    } else if (glob[i + 1] === "*") {
      source += ".*";
      i++;
    } else {
      source += "[^/]*";
    }
  }
  return new RegExp(`^${source}$`);
}

const PATTERNS = REMOTE_IMAGE_PATTERNS.map((pattern) => ({
  ...pattern,
  path: globToRegExp(pattern.pathname),
}));

function isAllowedRemote(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return PATTERNS.some(
    (pattern) =>
      url.protocol === `${pattern.protocol}:` &&
      url.hostname === pattern.hostname &&
      pattern.path.test(url.pathname),
  );
}

/**
 * Keep only image URLs this deployment can actually serve, or null.
 *
 *   - An absolute URL on an allowlisted host — the legacy silveejewels.com
 *     photos.
 *   - An app-relative `/uploads/…` path — everything the admin's own image
 *     pipeline writes, served by `app/uploads/[...path]/route.ts`.
 *
 * Anything else — another host, a bare filename, a `data:` or `javascript:`
 * URI, a protocol-relative `//host` — is dropped, so the caller draws its
 * placeholder rather than handing next/image something it will refuse.
 */
export function servableImageUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return isAllowedRemote(value) ? value : null;
  // A single leading slash only: `//evil.com/x.png` is protocol-relative, not a
  // local path, and would load from another origin entirely.
  if (/^\/(?!\/)/.test(value)) return value;
  return null;
}

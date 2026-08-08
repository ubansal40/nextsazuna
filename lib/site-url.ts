import "server-only";

import { headers } from "next/headers";

/**
 * The absolute origin to build outward-facing URLs from.
 *
 * `SAZUNA_SITE_URL` wins, because behind Cloudflare and LiteSpeed the host we
 * observe is not always the one the customer typed. Falling back to the
 * request matters more than it looks: with neither, gateway return URLs point
 * at localhost, and a customer who has paid is redirected nowhere while the
 * order sits unsettled.
 *
 * `known` lets a route handler pass the URL it already parsed, so the common
 * case costs nothing.
 */
/**
 * Where the storefront lives, when there is no request to ask.
 *
 * Single brand per deploy, so this is a real default rather than a guess. It
 * was already hardcoded once, in the PDP's structured data; naming it here
 * gives the sitemap, robots.txt, `metadataBase` and that JSON-LD one source.
 */
const DEFAULT_ORIGIN = "https://next.sazunajewellers.com";

/**
 * The origin, without touching request headers.
 *
 * For the surfaces that have no request to read: `metadataBase`, sitemap.xml
 * and robots.txt are all produced at build time, where `headers()` throws.
 * Prefer siteOrigin() anywhere a request exists — behind Cloudflare the host a
 * customer typed is the one that matters, and only the request knows it.
 */
export function staticOrigin(): string {
  const configured = process.env.SAZUNA_SITE_URL?.trim();
  return (configured || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

export async function siteOrigin(known?: URL): Promise<string> {
  const configured = process.env.SAZUNA_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (host) {
    const protocol = incoming.get("x-forwarded-proto") ?? "https";
    return `${protocol}://${host}`;
  }

  return known ? known.origin : "http://localhost:3200";
}

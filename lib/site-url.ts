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

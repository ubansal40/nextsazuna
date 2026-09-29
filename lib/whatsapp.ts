/**
 * WhatsApp deep links.
 *
 * Deliberately free of directives so both the server (which renders the PDP's
 * enquiry button) and the client can build the same URL.
 */

/**
 * The store's WhatsApp number, for surfaces that cannot read the database.
 *
 * `site_identity.whatsapp_number` is the source of truth, and everything that
 * renders per request — the floating button, the footer, the PDP enquiry — reads
 * it from there through getWhatsAppHref(). The content pages cannot: they are
 * prerendered at build time, and the production build runs without database
 * credentials on purpose, so a DB-derived href would bake in as an empty link
 * that never recovers.
 *
 * The Express storefront hardcodes the same number into each static page for the
 * same reason. Kept here rather than in eleven content modules so there is one
 * place to change it, and so a mismatch with site_identity is one grep away.
 */
export const STORE_WHATSAPP = "9779801082897";

/** A wa.me link carrying a prefilled message. */
export function whatsappHref(message: string, number: string = STORE_WHATSAPP): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * A wa.me link prefilled with the piece the reader is looking at.
 *
 * `base` is getWhatsAppHref()'s link, which already carries `?text=` whenever
 * the admin has set a default greeting (`site_identity.whatsapp_message`). This
 * used to append a second `text`, and a query string with two reads as its
 * first — the generic greeting — so the enquiry lost the product it was about.
 * The piece's message replaces the greeting; any other parameter is kept.
 */
export function enquiryHref(
  base: string,
  productName: string,
  sku: string | null,
  url: string,
): string {
  const subject = sku ? `${productName} (SKU ${sku})` : productName;
  const message = `Hi Sazuna — I'm interested in the ${subject}. ${url}`;
  const at = base.indexOf("?");
  const path = at === -1 ? base : base.slice(0, at);
  const kept = at === -1 ? [] : base.slice(at + 1).split("&").filter((pair) => pair && !pair.startsWith("text="));
  return `${path}?${[...kept, `text=${encodeURIComponent(message)}`].join("&")}`;
}

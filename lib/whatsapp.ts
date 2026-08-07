/**
 * WhatsApp deep links.
 *
 * Deliberately free of directives so both the server (which renders the PDP's
 * enquiry button) and the client can build the same URL.
 */

/** A wa.me link prefilled with the piece the reader is looking at. */
export function enquiryHref(
  base: string,
  productName: string,
  sku: string | null,
  url: string,
): string {
  const subject = sku ? `${productName} (SKU ${sku})` : productName;
  const message = `Hi Sazuna — I'm interested in the ${subject}. ${url}`;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}text=${encodeURIComponent(message)}`;
}

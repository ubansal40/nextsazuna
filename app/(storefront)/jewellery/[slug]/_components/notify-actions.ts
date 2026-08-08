"use server";

import { headers } from "next/headers";
import { getProductBySlug } from "@/lib/catalog";
import { isValidContact, requestStockNotification } from "@/lib/notify";

export type NotifyResult = "created" | "already" | "invalid" | "error";

/**
 * Join the back-in-stock waiting list for a product.
 *
 * A Server Action is a public endpoint, so nothing the client sends is trusted:
 * the product is re-resolved from its slug (which also proves it exists and is
 * visible), and the contact is validated here rather than relying on the form.
 */
export async function joinWaitlist(input: {
  slug: string;
  name: string;
  contact: string;
}): Promise<NotifyResult> {
  const contact = input.contact?.trim() ?? "";
  if (!isValidContact(contact)) return "invalid";

  try {
    const product = await getProductBySlug(input.slug);
    if (!product) return "error";
    // Someone can still post this for an in-stock product; there is simply
    // nothing to wait for, so treat it as a bad request rather than queueing.
    if (product.inStock) return "error";

    return await requestStockNotification({
      productId: product.id,
      productSlug: product.slug,
      name: input.name,
      contact,
      userAgent: (await headers()).get("user-agent") ?? undefined,
    });
  } catch {
    // The reader gets the spec's error panel and a retry; the detail belongs in
    // the server log, not in a response that a stranger can probe.
    return "error";
  }
}

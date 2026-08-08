import { getSiteContact } from "@/lib/content";
import { STORE_WHATSAPP } from "@/lib/whatsapp";

/**
 * Site-wide Organization + JewelryStore graph.
 *
 * Rendered from the layout, not from a page, and that placement is the point.
 * The Express storefront's about and stores pages each carried a small block
 * referencing `#org` and `#localbusiness` by `@id` — and those two nodes were
 * injected site-wide by the chrome script. Porting the page-level blocks alone
 * would leave both references dangling, which is a regression the old app's own
 * comments record having already had once.
 *
 * The shop details come from `site_identity`, the same block the footer reads,
 * so the address published to search engines cannot drift from the one on the
 * page. getSiteContact degrades to nulls rather than throwing, so a database
 * outage costs the graph its detail rather than taking down every page.
 */
export async function SiteSchema({ origin }: { origin: string }) {
  const contact = await getSiteContact();

  const socials = Object.values(contact.social).filter((url): url is string => Boolean(url));

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${origin}/#org`,
      name: "Sazuna Jewellers",
      url: origin,
      logo: `${origin}/sazuna-logo.webp`,
      ...(socials.length ? { sameAs: socials } : {}),
      ...(contact.phone
        ? {
            contactPoint: {
              "@type": "ContactPoint",
              telephone: contact.phone,
              contactType: "customer service",
              areaServed: "NP",
            },
          }
        : {}),
    },
    {
      "@type": "JewelryStore",
      "@id": `${origin}/#localbusiness`,
      name: "Sazuna Jewellers",
      url: origin,
      image: `${origin}/sazuna-logo.webp`,
      ...(contact.phone ? { telephone: contact.phone } : {}),
      priceRange: "रु रु रु",
      currenciesAccepted: "NPR",
      paymentAccepted: "Cash on Delivery, eSewa, Visa, Mastercard",
      ...(contact.address
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: contact.address,
              addressLocality: "Kathmandu",
              addressCountry: "NP",
            },
          }
        : {}),
      potentialAction: {
        "@type": "CommunicateAction",
        target: `https://wa.me/${STORE_WHATSAPP}`,
      },
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Built from a literal above and admin-authored strings that JSON.stringify
      // escapes; no markup can reach the page through it.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

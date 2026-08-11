import Link from "next/link";
import { Accordion, Icon, ProductCard } from "@/components/ui";
import { cn } from "@/lib/cn";
import { staticOrigin } from "@/lib/site-url";
import { getRelatedProducts, type ProductDetail } from "@/lib/catalog";
import { getWhatsAppHref } from "@/lib/content";
import { formatCarats, formatWeight } from "@/lib/format";
import { NotifyMe } from "./notify-me";
import { enquiryHref } from "@/lib/whatsapp";
import { PdpActions, ShareButton } from "./pdp-actions";
import { PdpStickyBar } from "./pdp-sticky-bar";
import { ProductGallery } from "./product-gallery";
import { TrustPanels } from "./trust-panels";

/**
 * Product detail page — Sazuna Product Detail PDP.dc.html.
 *
 * A Server Component. The gallery, the buy actions, the trust modal, the
 * waiting-list form and the mobile bar are the only client islands; everything
 * that matters to a crawler — title, price, availability, specifications and
 * the structured data — is rendered on the server.
 */

/**
 * The origin the product's structured data and WhatsApp link are built from.
 *
 * Was a second hardcoded copy of the site URL; now the same source as
 * `metadataBase`, the sitemap and robots.txt, so a domain change is one edit.
 * Deliberately the request-free variant — this renders inside a Server
 * Component tree that must not become dynamic for a canonical.
 */
const CANONICAL_ORIGIN = staticOrigin();

/**
 * Policy copy, identical on every product. It belongs to the brand rather than
 * the catalog, so it lives here; the product's own description supplies the
 * first panel.
 */
const POLICY_PANELS = [
  {
    id: "care",
    title: "Care Instructions",
    paragraphs: [
      "Store separately in the pouch provided to avoid scratches.",
      "Avoid perfume, chlorine and abrasives; clean gently with a soft brush and mild soapy water.",
    ],
  },
  {
    id: "shipping",
    title: "Shipping & Returns",
    paragraphs: [
      "Free insured shipping across Nepal, dispatched in 3–5 working days.",
      "7-day returns on unworn pieces with the certificate and packaging intact.",
    ],
  },
  {
    id: "cert",
    title: "Certification",
    paragraphs: [
      "Ships with an independent SGL certificate detailing the 4Cs — carat, colour, clarity and cut.",
      "The certificate number is laser-inscribed and matched to your invoice.",
    ],
  },
  {
    id: "buyback",
    title: "Buyback & Warranty",
    paragraphs: [
      "Lifetime buyback and exchange at prevailing value.",
      "Covered against manufacturing defects, with free service for life.",
    ],
  },
];

function Paragraphs({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text) => (
        <p key={text} className="m-0 mb-2.5 max-w-[70ch] [text-wrap:pretty]">
          {text}
        </p>
      ))}
    </>
  );
}

export async function ProductDetailView({ product }: { product: ProductDetail }) {
  const [related, whatsappBase] = await Promise.all([
    getRelatedProducts(product.id),
    getWhatsAppHref(),
  ]);

  const url = `${CANONICAL_ORIGIN}${product.href}`;
  const whatsappHref = whatsappBase
    ? enquiryHref(whatsappBase, product.name, product.sku, url)
    : null;

  // Spec's row order. Empty values are dropped rather than shown blank, which
  // matters here: most of these columns are populated on a minority of rows.
  const specs: [string, string][] = (
    [
      ["SKU", product.sku],
      ["Diamond Weight", formatCarats(product.diamondWeight)],
      ["Accent Gemstone", product.stoneType],
      ["Gold Colour", product.material],
      ["Purity", product.purity],
      ["Gross Weight", formatWeight(product.grossWeight)],
      ["Net Weight", formatWeight(product.netWeight)],
    ] satisfies [string, string | null][]
  ).filter((row): row is [string, string] => Boolean(row[1]?.trim()));

  const panels = [
    ...(product.description
      ? [
          {
            id: "details",
            title: "Product Details",
            paragraphs: product.description
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean),
          },
        ]
      : []),
    ...POLICY_PANELS,
  ];

  const bagItem = {
    id: String(product.id),
    name: product.name,
    price: product.price,
    priceMinor: product.priceMinor,
    href: product.href,
    imageUrl: product.imageUrl,
  };

  const category = product.categories[0];
  // Bare number for the price tags; `price` is display-formatted.
  const amount = (product.priceMinor / 100).toFixed(2);
  const description =
    product.description ?? `${product.name} — certified jewellery from Sazuna Jewellers.`;

  return (
    <>
      {/*
        Open Graph, rendered here rather than through generateMetadata: Next has
        no "product" in its OpenGraph type union, and its `other` field emits
        <meta name>, which OG scrapers ignore. React hoists these into <head>.
      */}
      <meta property="og:type" content="product" />
      <meta property="og:title" content={product.name} />
      <meta property="og:description" content={description.slice(0, 200)} />
      <meta property="og:url" content={url} />
      {product.images.map((image) => (
        <meta key={image} property="og:image" content={image} />
      ))}
      <meta property="og:price:amount" content={amount} />
      <meta property="og:price:currency" content="NPR" />
      <meta property="product:price:amount" content={amount} />
      <meta property="product:price:currency" content="NPR" />
      <meta
        property="product:availability"
        content={product.inStock ? "in stock" : "out of stock"}
      />
      {product.sku && <meta property="product:retailer_item_id" content={product.sku} />}

      {/* Structured data. Rendered from the same values the page shows, so the
          two cannot disagree — a mismatched price is a Merchant Center error. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org/",
            "@type": "Product",
            name: product.name,
            sku: product.sku ?? undefined,
            description: product.description ?? undefined,
            image: product.images.length ? product.images : undefined,
            brand: { "@type": "Brand", name: "Sazuna" },
            category: category?.name,
            offers: {
              "@type": "Offer",
              url,
              priceCurrency: "NPR",
              price: amount,
              availability: product.inStock
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          }),
        }}
      />

      <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 pdp-narrow:px-5">
        <div className="mt-6 grid items-start gap-12 pdp-stacked:gap-6 pdp-split:grid-cols-[minmax(0,1fr)_var(--sz-pdp-aside)] pdp-narrow:mt-4">
          <ProductGallery images={product.images} productName={product.name} />

          <section>
            <h1 className="m-0 mt-2 font-[family-name:var(--sz-font-display)] text-pdp-title font-normal leading-[1.08] tracking-tight text-heading [text-wrap:balance] pdp-narrow:text-pdp-title-sm">
              {product.name}
            </h1>

            {/* Sale pricing is a hard design rule — see CLAUDE.md. Never restyle.
                The oxblood-and-semibold treatment is what *marks* a markdown, so
                it is conditional on there being one: a full-price piece stays ink
                and lighter, exactly as the product card and the bag render it.
                Unconditional, it made every product look discounted. */}
            <div className="mt-3.5 flex flex-wrap items-baseline gap-2.5">
              <span
                className={cn(
                  "font-mono text-pdp-price tabular-nums tracking-tight",
                  product.compareAtPrice
                    ? "font-semibold text-primary-700"
                    : "font-medium text-heading",
                )}
              >
                {product.price}
              </span>
              {product.compareAtPrice && (
                <>
                  <s className="font-mono text-sm tabular-nums tracking-tight text-price-struck">
                    {product.compareAtPrice}
                  </s>
                  <span className="rounded-pill border border-primary-200 bg-primary-50 px-2.5 py-1 text-offer font-semibold text-primary-700">
                    Offer
                  </span>
                </>
              )}
            </div>

            {!product.inStock && (
              <p className="m-0 mt-[18px] inline-flex items-center gap-2 rounded-pill bg-surface px-3.5 py-1.5 text-control-sm font-semibold text-muted">
                <span aria-hidden="true" className="size-[7px] rounded-pill bg-muted" />
                Currently out of stock
              </p>
            )}

            <div data-pdp-actions className="mt-[22px]">
              {product.inStock ? (
                <PdpActions product={bagItem} whatsappHref={whatsappHref} />
              ) : (
                <>
                  <NotifyMe slug={product.slug} whatsappHref={whatsappHref} />
                  <ShareButton title={product.name} />
                </>
              )}
            </div>

            <TrustPanels />

            {specs.length > 0 && (
              <div className="mt-7 border-t border-line-soft pt-5">
                <h2 className="m-0 mb-1.5 font-[family-name:var(--sz-font-display)] text-md font-medium text-heading">
                  Specifications
                </h2>
                <dl className="m-0">
                  {specs.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-4 border-b border-surface py-[11px]"
                    >
                      <dt className="text-spec-key text-muted">{label}</dt>
                      <dd className="m-0 text-right font-mono text-control-sm tabular-nums text-body">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        </div>

        {panels.length > 0 && (
          <section className="mt-14 max-w-[860px]">
            <Accordion
              variant="section"
              defaultOpen={[panels[0].id]}
              items={panels.map((panel) => ({
                id: panel.id,
                question: panel.title,
                answer: <Paragraphs items={panel.paragraphs} />,
              }))}
            />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-20 pdp-stacked:mt-13">
            <div className="mb-7 flex items-end justify-between gap-5">
              <div>
                <p className="m-0 mb-3 flex items-center gap-2 font-mono text-2xs uppercase tracking-caps text-accent-strong">
                  <span aria-hidden="true" className="size-[5px] rotate-45 bg-accent" />
                  Pairs beautifully
                </p>
                <h2 className="m-0 font-[family-name:var(--sz-font-display)] text-section-title font-normal leading-[1.06] tracking-tight text-heading">
                  You may also like
                </h2>
              </div>
              {category && (
                <Link
                  href={category.href}
                  className="inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap text-sm font-semibold text-primary-700 no-underline hover:text-primary-800 hover:no-underline"
                >
                  View all
                  <Icon name="arrow-right" size={14} strokeWidth={1.8} />
                </Link>
              )}
            </div>

            {/*
             * The listing's card, not a second one.
             *
             * This row used to be bespoke markup that rendered `item.price` in
             * its own style and dropped the rest of the summary on the floor —
             * so a discounted piece showed neither its struck original nor the
             * Offer flag here, while the very same product on the listing page
             * showed both. `getRelatedProducts` returns `ProductSummary`, the
             * exact type the PLP grid consumes, so the data was always there.
             *
             * The design project makes this a hard rule: sale price is oxblood,
             * weight 600, Geist Mono, original struck alongside — and never
             * restyled per surface. Two implementations of one card is how that
             * rule quietly stops being true on one of them.
             */}
            <div className="grid grid-cols-4 gap-x-[22px] gap-y-[26px] pdp-carousel:flex pdp-carousel:snap-x pdp-carousel:snap-mandatory pdp-carousel:gap-3.5 pdp-carousel:overflow-x-auto pdp-carousel:pb-2">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  title={item.name}
                  href={item.href}
                  price={item.price}
                  compareAtPrice={item.compareAtPrice ?? undefined}
                  image={item.imageUrl ? { src: item.imageUrl, alt: item.name } : undefined}
                  outOfStock={!item.inStock}
                  certified
                  // Four across here, against the listing's three.
                  sizes="(max-width: 640px) 60vw, 20vw"
                  className="pdp-carousel:w-[var(--sz-pdp-related-card)] pdp-carousel:shrink-0 pdp-carousel:snap-start"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <PdpStickyBar product={bagItem} inStock={product.inStock} whatsappHref={whatsappHref} />
    </>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Accordion, Badge, Icon, ProductCard, Tabs } from "@/components/ui";
import { getRelatedProducts, type ProductDetail } from "@/lib/catalog";
import { formatWeight } from "@/lib/format";
import { AddToBag } from "./add-to-bag";

/**
 * Product detail page.
 *
 * A Server Component: the only interactive island is the quantity + add-to-bag
 * control, so everything else — including the price, which must be correct and
 * crawlable — is rendered on the server.
 */
export async function ProductDetailView({ product }: { product: ProductDetail }) {
  const related = await getRelatedProducts(product.id);

  const specs = [
    ["Material", product.material],
    ["Purity", product.purity],
    ["Stone", product.stoneType],
    ["Gross weight", formatWeight(product.grossWeight)],
    ["Net weight", formatWeight(product.netWeight)],
    ["Diamond weight", formatWeight(product.diamondWeight)],
    ["Stone weight", formatWeight(product.stoneWeight)],
    ["SKU", product.sku],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-6 py-10 md:px-10">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-2 list-none p-0 m-0 text-xs text-muted">
          <li>
            <Link href="/" className="no-underline hover:text-primary-700">
              Home
            </Link>
          </li>
          {product.categories[0] && (
            <>
              <li aria-hidden="true">
                <Icon name="chevron-right" size={12} />
              </li>
              <li>
                <Link
                  href={product.categories[0].href}
                  className="no-underline hover:text-primary-700"
                >
                  {product.categories[0].name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">
            <Icon name="chevron-right" size={12} />
          </li>
          <li className="truncate text-body">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Media */}
        <div
          className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--sz-radius-lg)] border border-line"
          style={{
            background:
              "radial-gradient(120% 120% at 32% 22%, var(--sz-media-from), var(--sz-media-to))",
          }}
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="size-24 rotate-45 bg-accent opacity-50 shadow-[inset_0_0_0_1px_rgb(255_255_255/.55)]"
            />
          )}

          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[rgb(var(--sz-canvas-rgb)/.92)] py-2.5 border-t border-[rgb(var(--sz-accent-rgb)/.4)]">
            <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
            <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
              SGL certified
            </span>
          </span>
        </div>

        {/* Detail */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {product.inStock ? (
              <Badge tone="inStock" size="sm">
                In stock
              </Badge>
            ) : (
              <Badge tone="outOfStock" size="sm">
                Out of stock
              </Badge>
            )}
            {product.tags.slice(0, 2).map((tag) => (
              <Badge key={tag.slug} tone="outline" size="sm">
                {tag.name}
              </Badge>
            ))}
          </div>

          <h1 className="text-xl leading-[var(--sz-leading-snug)]">{product.name}</h1>

          {/* Sale pricing is a hard design rule — see CLAUDE.md. Never restyle. */}
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-[var(--sz-tracking-price)] text-primary-700">
              {product.price}
            </span>
            {product.compareAtPrice && (
              <s className="font-mono text-md tabular-nums tracking-[var(--sz-tracking-price)] text-price-struck">
                {product.compareAtPrice}
              </s>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">Inclusive of all taxes.</p>

          <div className="mt-7">
            <AddToBag productId={product.id} inStock={product.inStock} />
          </div>

          <ul className="mt-7 grid grid-cols-2 gap-3 list-none p-0">
            {[
              { icon: "shield", label: "SGL certified" },
              { icon: "truck", label: "Free insured shipping" },
              { icon: "refresh", label: "Buyback & exchange" },
              { icon: "star", label: "Lifetime repair" },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm text-body">
                <Icon name={item.icon as "shield"} size={18} className="text-accent" />
                {item.label}
              </li>
            ))}
          </ul>

          {specs.length > 0 && (
            <div className="mt-9">
              <Tabs
                items={[
                  {
                    id: "specs",
                    label: "Specifications",
                    content: (
                      <dl className="grid grid-cols-2 gap-y-2.5 font-mono text-[length:var(--sz-text-control-sm)]">
                        {specs.map(([label, value]) => (
                          <div key={label} className="contents">
                            <dt className="text-muted">{label}</dt>
                            <dd className="m-0 text-right text-body">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ),
                  },
                  {
                    id: "care",
                    label: "Care",
                    content: (
                      <p className="m-0 max-w-[60ch]">
                        Store separately in the pouch provided. Avoid perfume and chlorine. We clean
                        and re-polish free of charge at any Sazuna store.
                      </p>
                    ),
                  },
                  ...(product.description
                    ? [
                        {
                          id: "story",
                          label: "The Story",
                          content: (
                            <p className="m-0 max-w-[60ch] whitespace-pre-line">
                              {product.description}
                            </p>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}

          <div className="mt-9">
            <Accordion
              exclusive
              items={[
                {
                  id: "shipping",
                  question: "Shipping & delivery",
                  answer:
                    "Insured delivery within Kathmandu takes 1–2 working days, and 3–5 working days elsewhere in Nepal. Cash on delivery is available nationwide.",
                },
                {
                  id: "returns",
                  question: "Returns & exchange",
                  answer:
                    "Unworn pieces can be returned within 7 days in their original packaging. Personalised and engraved pieces are made to order and cannot be returned unless they arrive damaged.",
                },
                {
                  id: "certificate",
                  question: "Certification",
                  answer:
                    "Every diamond is graded by SGL. The physical certificate ships inside the box and a digital copy is attached to your order record.",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20 border-t border-line pt-12">
          <div className="mb-6 flex items-center gap-2.5">
            <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
            <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
              You may also like
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

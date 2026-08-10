import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import type { FeatureCard, Tile, UspItem } from "@/lib/homepage-blocks";
import { SectionHeading } from "./section-heading";

/**
 * The homepage's server-rendered sections — Sazuna Homepage.dc.html.
 *
 * Everything that does not need client state lives here, so the page is a
 * Server Component apart from the two carousels and the product tabs.
 */

/**
 * The block's icon vocabulary is not the design's.
 *
 * `homepage_layout` names five icons — diamond, exchange, sparkle, truck,
 * gift — but the spec draws a different glyph for several of them (the
 * "diamond" row is a certification shield; "gift" is a shop pin). The map is
 * the spec's rendering, keyed by the data's names, per section because the
 * same key draws differently in the two sections that use it.
 */
const USP_ICON: Record<string, IconName> = {
  diamond: "shield-check",
  exchange: "exchange",
  truck: "truck",
  gift: "pin",
};

const FEATURE_ICON: Record<string, IconName> = {
  diamond: "shield-check",
  sparkle: "gem",
  exchange: "exchange",
  gift: "storefront",
};

/** Shop-by-category rail — spec lines 105-118. */
export function CategoryTiles({
  eyebrow,
  heading,
  link,
  tiles,
}: {
  eyebrow: string;
  heading: string;
  link: { text: string; href: string } | null;
  tiles: Tile[];
}) {
  return (
    <section className="mx-auto mt-[var(--sz-section-gap)] max-w-[var(--sz-container)] px-10 home-narrow:mt-[var(--sz-section-gap-sm)] home-narrow:px-5">
      <SectionHeading eyebrow={eyebrow} heading={heading} link={link} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5 home-rail:flex home-rail:snap-x home-rail:snap-mandatory home-rail:gap-3.5 home-rail:overflow-x-auto home-rail:pb-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href + tile.label}
            href={tile.href}
            className="group block text-body no-underline hover:no-underline home-rail:w-[40%] home-rail:shrink-0 home-rail:snap-start home-carousel:w-[47%]"
          >
            <div className="relative aspect-square overflow-hidden rounded-[var(--sz-radius-lg)]">
              <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,var(--sz-line-soft)_0_12px,var(--sz-surface)_12px_24px)] transition-transform duration-[550ms] ease-[var(--sz-ease-out)] group-hover:scale-[1.06]">
                {tile.image ? (
                  <Image src={tile.image} alt="" fill sizes="200px" className="object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="aspect-square w-[30%] rotate-45 bg-accent opacity-40"
                  />
                )}
              </div>
            </div>
            <p className="m-0 mt-3 text-center text-sm font-medium text-body">{tile.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Trust strip — spec lines 121-129. */
export function UspStrip({ items }: { items: UspItem[] }) {
  return (
    <section className="mx-auto mt-[var(--sz-section-gap)] max-w-[var(--sz-container)] px-10 home-narrow:mt-[var(--sz-section-gap-sm)] home-narrow:px-5">
      <ul className="m-0 grid list-none grid-cols-5 gap-x-4 gap-y-5 p-0 home-rail:grid-cols-3 home-carousel:grid-cols-2">
        {items.map((item) => {
          const icon = USP_ICON[item.icon];
          const body = (
            <>
              <span className="shrink-0 text-primary-700">
                {icon ? (
                  <Icon name={icon} size={24} strokeWidth={1.5} />
                ) : (
                  // The spec draws this one as the brand's own gold lozenge
                  // rather than a line icon.
                  <span className="inline-flex size-6 items-center justify-center">
                    <span className="size-5 rotate-45 bg-current shadow-[inset_0_0_0_1.6px_var(--sz-canvas)]" />
                  </span>
                )}
              </span>
              <span className="text-control-sm leading-[1.32] text-body">
                <strong className="block font-semibold">{item.label}</strong>
                <span className="text-muted">{item.caption}</span>
              </span>
            </>
          );

          return (
            <li key={item.label} className="flex items-center gap-3 px-0.5 py-2.5">
              {item.href ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-3 text-body no-underline hover:no-underline"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Full-bleed featured collection banner — spec lines 186-197. */
export function FeaturedBanner({
  eyebrow,
  heading,
  body,
  image,
  cta,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  image: string | null;
  cta: { text: string; href: string } | null;
}) {
  return (
    <section className="mt-[var(--sz-section-gap)] home-narrow:mt-[var(--sz-section-gap-sm)]">
      <div className="relative flex min-h-[clamp(380px,54vh,580px)] items-center overflow-hidden bg-[repeating-linear-gradient(135deg,var(--sz-banner-from)_0_20px,var(--sz-banner-to)_20px_40px)]">
        {image && <Image src={image} alt="" fill sizes="100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--sz-hero-scrim-rgb)/.76),rgb(var(--sz-hero-scrim-rgb)/.34)_48%,rgb(var(--sz-hero-scrim-rgb)/.04)_76%)]" />
        <div className="relative mx-auto w-full max-w-[var(--sz-container)] px-10 home-narrow:px-5">
          <div className="max-w-[520px]">
            {eyebrow && (
              <p className="m-0 mb-4 flex items-center gap-[9px] font-mono text-2xs uppercase tracking-hero text-ann-text">
                <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
                {eyebrow}
              </p>
            )}
            <h2 className="m-0 font-[family-name:var(--sz-font-display)] text-banner font-normal leading-[1.04] tracking-tight text-white [text-wrap:balance] home-narrow:text-banner-sm">
              {heading}
            </h2>
            {body && (
              <p className="mb-7 mt-[18px] max-w-[44ch] text-banner-body leading-[1.55] text-hero-body">
                {body}
              </p>
            )}
            {cta && (
              <Link
                href={cta.href}
                className="inline-flex h-[var(--sz-control-h-md)] items-center gap-[9px] rounded-[var(--sz-radius-thumb)] bg-canvas px-[26px] text-control font-semibold text-primary-800 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-ann-text hover:text-primary-800 hover:no-underline"
              >
                {cta.text}
                <Icon name="arrow-right" size={15} strokeWidth={1.9} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Collection cards — spec lines 200-232. */
export function CollectionCards({
  eyebrow,
  heading,
  link,
  tiles,
}: {
  eyebrow: string;
  heading: string;
  link: { text: string; href: string } | null;
  tiles: Tile[];
}) {
  return (
    <section className="mx-auto mt-[var(--sz-section-gap)] max-w-[var(--sz-container)] px-10 home-narrow:mt-[var(--sz-section-gap-sm)] home-narrow:px-5">
      <SectionHeading eyebrow={eyebrow} heading={heading} link={link} />
      <div className="grid grid-cols-2 gap-6 home-narrow:grid-cols-1">
        {tiles.map((tile) => (
          <Link
            key={tile.href + tile.label}
            href={tile.href}
            className="group relative block aspect-[16/10] overflow-hidden rounded-[var(--sz-radius-hero)] text-body no-underline hover:no-underline"
          >
            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--sz-collection-from)_0_14px,var(--sz-collection-to)_14px_28px)] transition-transform duration-[550ms] ease-[var(--sz-ease-out)] group-hover:scale-[1.04]">
              {tile.image && (
                <Image
                  src={tile.image}
                  alt=""
                  fill
                  sizes="(max-width: 760px) 100vw, 50vw"
                  className="object-cover"
                />
              )}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(var(--sz-hero-scrim-rgb)/.78),rgb(var(--sz-hero-scrim-rgb)/.10)_60%,transparent)]" />
            <div className="absolute inset-x-0 bottom-0 px-8 pb-[30px]">
              {tile.caption && (
                <p className="m-0 mb-2 font-mono text-eyebrow uppercase tracking-caps text-ann-text">
                  {tile.caption}
                </p>
              )}
              <p className="m-0 font-[family-name:var(--sz-font-display)] text-collection-title leading-[1.1] text-white">
                {tile.label}
              </p>
              {tile.subtext && (
                <p className="m-0 mt-1.5 text-sm text-hero-body">{tile.subtext}</p>
              )}
              {tile.ctaText && (
                <span className="mt-4 inline-flex items-center gap-[7px] text-sm font-semibold text-white">
                  {tile.ctaText}
                  <Icon name="arrow-right" size={14} strokeWidth={1.9} />
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Why Sazuna — spec lines 235-262. */
export function FeatureCards({
  eyebrow,
  heading,
  cards,
}: {
  eyebrow: string;
  heading: string;
  cards: FeatureCard[];
}) {
  return (
    <section className="mx-auto mt-[var(--sz-section-gap)] max-w-[var(--sz-container)] px-10 home-narrow:mt-[var(--sz-section-gap-sm)] home-narrow:px-5">
      <SectionHeading eyebrow={eyebrow} heading={heading} />
      <div className="grid grid-cols-4 gap-[18px] home-wide:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-[var(--sz-radius-feature)] border border-line-soft bg-canvas px-6 py-[26px]"
          >
            <span className="inline-flex size-[var(--sz-icon-tile)] items-center justify-center rounded-[var(--sz-radius-icon-tile)] bg-primary-50 text-primary-700">
              <Icon
                name={FEATURE_ICON[card.icon] ?? "shield-check"}
                size={22}
                strokeWidth={1.5}
              />
            </span>
            <h3 className="mb-2 mt-[18px] font-[family-name:var(--sz-font-display)] text-card-title-lg font-medium text-heading">
              {card.title}
            </h3>
            <p className="m-0 text-sm leading-[1.55] text-muted [text-wrap:pretty]">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

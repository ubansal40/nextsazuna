import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface ProductCardProps {
  title: string;
  href: string;
  /** Preformatted for display, e.g. "रु 1,25,000". Formatting is a data concern. */
  price: string;
  /** Struck original. Presence is what makes this card render as a sale. */
  compareAtPrice?: string;
  image?: { src: string; alt: string };
  certified?: boolean;
  /**
   * Corner flag. Defaults to "Offer" whenever a compare-at price is present —
   * the spec flags every discounted piece, so requiring callers to pass it
   * meant the badge silently never appeared.
   */
  offerLabel?: string;
  outOfStock?: boolean;
  className?: string;
}

/**
 * Product card — spec §Component · Product card.
 *
 * Sale pricing is a documented hard rule: oxblood, weight 600, Geist Mono,
 * negative tracking, with the original struck alongside. Regular prices stay ink
 * and lighter. Do not restyle price per surface.
 */
export function ProductCard({
  title,
  href,
  price,
  compareAtPrice,
  image,
  certified = false,
  offerLabel,
  outOfStock = false,
  className,
}: ProductCardProps) {
  const onSale = Boolean(compareAtPrice);
  const flag = offerLabel ?? (onSale ? "Offer" : undefined);

  return (
    <Link
      href={href}
      aria-label={outOfStock ? `${title} — out of stock` : title}
      className={cn(
        "group block bg-raised border border-line rounded-[var(--sz-radius-lg)] overflow-hidden",
        "no-underline hover:no-underline",
        "transition-[box-shadow,transform] duration-[var(--sz-dur-slow)] ease-[var(--sz-ease-out)]",
        !outOfStock && "hover:shadow-lg hover:-translate-y-1",
        className,
      )}
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden",
          outOfStock && "saturate-[.4]",
        )}
        style={{
          background: outOfStock
            ? "radial-gradient(120% 120% at 32% 22%, var(--sz-media-from-oos), var(--sz-media-to-oos))"
            : "radial-gradient(120% 120% at 32% 22%, var(--sz-media-from), var(--sz-media-to))",
        }}
      >
        {/* The media layer zooms on hover; the badges above must not. */}
        <div className="absolute inset-0 flex items-center justify-center transition-transform duration-[550ms] ease-[var(--sz-ease-out)] group-hover:scale-105">
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1100px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="w-[24%] aspect-square rotate-45 bg-accent opacity-50 shadow-[inset_0_0_0_1px_rgb(255_255_255/.55)]"
            />
          )}
        </div>

        {flag && !outOfStock && (
          <span className="absolute top-[11px] left-[11px] bg-primary-700 text-white font-mono text-[length:var(--sz-text-micro)] tracking-[var(--sz-tracking-caps)] uppercase rounded-[var(--sz-radius-pill)] px-[11px] py-[5px]">
            {flag}
          </span>
        )}

        {outOfStock && (
          <span className="absolute top-[11px] left-[11px] bg-surface text-muted font-mono text-[length:var(--sz-text-micro)] tracking-[var(--sz-tracking-caps)] uppercase rounded-[var(--sz-radius-pill)] px-[11px] py-[5px]">
            Out of stock
          </span>
        )}

        {certified && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-1.5 bg-[rgb(var(--sz-canvas-rgb)/.92)] border-t border-[rgb(var(--sz-accent-rgb)/.4)]">
            <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
            <span className="font-mono text-[length:var(--sz-text-micro)] tracking-[var(--sz-tracking-caps)] text-primary-700">
              CERTIFIED
            </span>
          </span>
        )}
      </div>

      <div className="px-[15px] pt-[13px] pb-[15px] border-t border-surface">
        <p className="text-[length:var(--sz-text-card-title)] text-body leading-[1.3] truncate">
          {title}
        </p>
        <div className="flex items-baseline gap-[7px] mt-1.5 overflow-hidden">
          <span
            className={cn(
              "font-mono tabular-nums whitespace-nowrap",
              onSale
                ? "text-[length:var(--sz-text-price)] text-primary-700 font-semibold tracking-[var(--sz-tracking-price)]"
                : "text-[length:var(--sz-text-control)] text-heading font-medium tracking-[var(--sz-tracking-tight)]",
            )}
          >
            {price}
          </span>
          {compareAtPrice && (
            <s className="font-mono tabular-nums whitespace-nowrap text-[length:var(--sz-text-price-struck)] text-price-struck tracking-[var(--sz-tracking-price)]">
              {compareAtPrice}
            </s>
          )}
        </div>
      </div>
    </Link>
  );
}

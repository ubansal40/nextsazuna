import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The product thumbnail from Sazuna Admin.dc.html — a real image when there is
 * one, otherwise the spec's gem-on-gradient placeholder (a rotated gold facet on
 * a warm radial), so a row without a photo still reads as jewellery rather than
 * a broken tile. Sized in px because the tables set it per surface.
 */
export function ProductThumb({
  src,
  alt,
  size = 30,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
}) {
  const rounded = size >= 36 ? "rounded-lg" : "rounded-[7px]";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        rounded,
        "bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-surface-raised),var(--sz-accent-soft))]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={alt} width={size} height={size} loading="eager" className="size-full object-cover" unoptimized />
      ) : (
        <span
          aria-hidden="true"
          className="rotate-45 bg-accent opacity-55"
          style={{ width: Math.round(size * 0.3), height: Math.round(size * 0.3) }}
        />
      )}
    </span>
  );
}

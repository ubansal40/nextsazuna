import Link from "next/link";
import { Icon } from "@/components/ui";
import {
  jewelleryUrl,
  MEGA_NOTE,
  MEGA_PRICE_BANDS,
  MEGA_PURITIES,
  type NavCategory,
} from "@/lib/navigation";

/**
 * Mega-menu panel — spec §Mega-menu (SazunaHeader.dc.html:145-185).
 *
 * One template for every category: the copy is generated from the category's
 * name, so adding a category to the nav needs no panel of its own. Purely
 * presentational — open/close state lives in SiteHeader.
 */

/**
 * Names the panel for the `aria-controls` on whichever category link opened it.
 * Shared as a constant because both halves of that relationship have to agree,
 * and SiteHeader also uses it to tell whether focus is inside the panel before
 * it closes one.
 *
 * A single id is enough: only ever one panel is mounted.
 */
export const MEGA_PANEL_ID = "sz-mega-panel";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mb-3.5 font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong">
      {children}
    </p>
  );
}

const linkClass =
  "text-sm text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700 hover:no-underline";
const emphasisClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-800 hover:no-underline";

export function MegaMenu({ category }: { category: NavCategory }) {
  const { megaName, slug, gendered } = category;
  const base = jewelleryUrl(slug);

  return (
    <div
      id={MEGA_PANEL_ID}
      className="absolute inset-x-0 top-full z-[55] border-b border-line bg-canvas shadow-mega animate-fade-down"
    >
      <div className="mx-auto grid max-w-[var(--sz-container)] grid-cols-[1fr_1fr_1fr_1.3fr] gap-9 px-10 py-8">
        <div>
          <Eyebrow>Shop {megaName}</Eyebrow>
          <div className="flex flex-col gap-[11px]">
            {/* Only rings and earrings are split by wearer; the rest have no
                such subcategory and the link would 404. */}
            {gendered && (
              <>
                <Link href={jewelleryUrl(`${slug}-for-women`)} className={linkClass}>
                  {megaName} for Women
                </Link>
                <Link href={jewelleryUrl(`${slug}-for-men`)} className={linkClass}>
                  {megaName} for Men
                </Link>
              </>
            )}
            <Link href={base} className={linkClass}>
              All {megaName}
            </Link>
            <Link href={jewelleryUrl(slug, { sort: "newest" })} className={emphasisClass}>
              New in {megaName}
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </div>

        <div>
          <Eyebrow>Shop by price</Eyebrow>
          <div className="flex flex-col gap-[11px]">
            {MEGA_PRICE_BANDS.map((band, index) => (
              <Link
                key={band.bracket}
                href={jewelleryUrl(slug, { price: band.bracket })}
                className={index === MEGA_PRICE_BANDS.length - 1 ? emphasisClass : linkClass}
              >
                {band.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <Eyebrow>Purity</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {MEGA_PURITIES.map((purity) => (
              <Link
                key={purity}
                href={jewelleryUrl(slug, { purity })}
                className="rounded-[var(--sz-radius-sm)] border border-line bg-surface px-[9px] py-1 font-mono text-2xs text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-accent hover:no-underline"
              >
                {purity}
              </Link>
            ))}
          </div>
          <p className="m-0 mt-4 max-w-[22ch] text-mega-note leading-[1.5] text-muted">
            {MEGA_NOTE}
          </p>
        </div>

        <Link
          href={base}
          className="group relative block min-h-[var(--sz-mega-feature-h)] overflow-hidden rounded-[var(--sz-radius-card)] no-underline transition-opacity duration-[var(--sz-dur)] hover:opacity-95 hover:no-underline"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, var(--sz-line-soft) 0 12px, var(--sz-surface) 12px 24px)",
          }}
        >
          <span className="absolute inset-0 flex flex-col justify-end bg-[linear-gradient(to_top,rgb(var(--sz-primary-900-rgb)/.6),transparent_60%)] p-5">
            <span className="font-mono text-badge uppercase tracking-eyebrow text-ann-text">
              Featured collection
            </span>
            <span className="mt-1 font-[family-name:var(--sz-font-display)] text-lg leading-[1.15] text-white">
              The {megaName} edit
            </span>
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ann-text">
              Explore
              <Icon
                name="arrow-right"
                size={13}
                strokeWidth={1.8}
                className="transition-transform duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] group-hover:translate-x-1"
              />
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

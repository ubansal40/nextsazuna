import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's own theme scales — every name `@theme inline` in
 * app/globals.css declares, grouped by the Tailwind namespace it lives in.
 *
 * tailwind-merge only knows Tailwind's default scales, and it reads an unknown
 * `text-*` as a COLOUR, because any name is a valid colour. So `text-control-sm`
 * looked like a colour, the next real colour "overrode" it, and
 * `cn("text-control-sm font-semibold text-primary-700")` came back without its
 * size — the footer links, accordion rows, table of contents, checkout fields and
 * PDP price all rendered at whatever they inherited. Unknown shadows fell into
 * the same hole as shadow colours. Unknown radii, leading, tracking, containers
 * and animations were never dropped, but never merged either, so a caller's
 * `rounded-pill` could not replace a default `rounded-md`.
 *
 * Colours and font families are not listed: tailwind-merge accepts any name for
 * those two already.
 *
 * `hero-body` is missing from `text` on purpose. `--color-hero-body` claims the
 * same utility, and Tailwind resolves `text-hero-body` to the colour, so merging
 * it as a size would disagree with the stylesheet.
 *
 * `npm run check:tokens` fails if a name in `@theme inline` is missing here, or a
 * name here has gone from it — so a new token cannot quietly reopen this.
 */
const THEME_SCALES = {
  text: [
    "2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl",
    "micro", "control-sm", "control", "badge", "eyebrow", "mega-note", "avatar",
    "search-input", "otp", "dropdown-title", "cart-empty-title",
    "pdp-title", "pdp-title-sm", "pdp-price", "section-title", "error-title",
    "modal-title", "accordion", "prose", "spec-key", "trust", "offer", "footer-link",
    "page-title", "page-title-sm",
    "content-h1", "content-h1-sm", "content-h2", "content-lead", "toc",
    "story-h1", "story-h1-sm", "story-h2", "story-h2-sm", "story-quote", "story-stat",
    "story-card-title",
    "cart-h1", "line-name", "summary-total", "hero", "hero-sm", "h2", "h2-sm",
    "banner", "banner-sm", "collection-title", "card-title-lg", "banner-body",
  ],
  tracking: ["tight", "normal", "wide", "caps", "eyebrow", "esc", "hero"],
  leading: ["tight", "snug", "normal", "relaxed", "prose"],
  radius: ["xs", "sm", "md", "lg", "pill"],
  shadow: ["xs", "sm", "md", "lg", "dropdown", "mega", "search", "drawer", "whatsapp", "modal"],
  ease: ["out", "in-out"],
  container: ["narrow", "default", "wide"],
  animate: [
    "spin", "fade", "scale-in", "slide-right", "slide-left", "sheet-up", "toast-in",
    "shimmer", "float", "lift", "fade-down", "search-in", "nav-in", "cart-in",
  ],
};

const twMerge = extendTailwindMerge({ extend: { theme: THEME_SCALES } });

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 * Every component takes a `className` prop and funnels it through here, so a
 * caller can always override a default without `!important` or specificity wars.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

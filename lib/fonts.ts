import localFont from "next/font/local";

/**
 * The three Ceremony typefaces, self-hosted. The spec permits these and no
 * others — "do not introduce new fonts (no Inter)".
 *
 * `display: "swap"` plus next/font's metrics-matched fallback is what protects
 * CLS, which the spec calls out explicitly under §Typography.
 */

/** Display · editorial — h1–h3, hero, section titles. */
export const fraunces = localFont({
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "serif"],
  src: [
    { path: "../public/fonts/fraunces-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/fraunces-400-normal-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/fraunces-400-italic-latin.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/fraunces-400-italic-latin-ext.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/fraunces-500-normal-latin.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/fraunces-500-normal-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/fraunces-600-normal-latin.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/fraunces-600-normal-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/fraunces-700-normal-latin.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/fraunces-700-normal-latin-ext.woff2", weight: "700", style: "normal" },
  ],
});

/** UI · body — "a characterful grotesque, intentional, not default Inter". */
export const generalSans = localFont({
  variable: "--font-general-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  src: [
    { path: "../public/fonts/general-sans-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/general-sans-500-normal-latin.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/general-sans-600-normal-latin.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/general-sans-700-normal-latin.woff2", weight: "700", style: "normal" },
  ],
});

/** Data · price · SKU — tabular figures for prices, product codes, admin tables. */
export const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
  src: [
    { path: "../public/fonts/geist-mono-400-normal-latin.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-mono-400-normal-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-mono-500-normal-latin.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/geist-mono-500-normal-latin-ext.woff2", weight: "500", style: "normal" },
  ],
});

export const fontVariables = `${fraunces.variable} ${generalSans.variable} ${geistMono.variable}`;

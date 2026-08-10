/**
 * The id of the FAQ topic list, shared by the server page that renders it and
 * the client search box that queries it.
 *
 * It lives in its own module with no directive because both sides read it. It
 * used to be exported from `faq-search.tsx`, which is `"use client"` — and that
 * happens to work, because a string primitive survives the crossing. A `Set`
 * exported the same way did not: `SORT_VALUES.has(...)` type-checked, built,
 * and then threw "is not a function" on every sorted listing in production.
 *
 * Working by luck is not the same as being correct, and the distinction is
 * invisible at the call site. `check:client-boundary` enforces it.
 */
export const FAQ_LIST_ID = "faq-topics";

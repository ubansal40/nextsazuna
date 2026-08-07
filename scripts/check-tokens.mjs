#!/usr/bin/env node
/**
 * Token parity check.
 *
 * Asserts that every token the Ceremony spec declares exists in app/globals.css
 * with an identical value. This is the guard that stops the app drifting into a
 * second design system — which is exactly how the previous Express storefront
 * ended up with a palette that missed the spec on every single colour.
 *
 * Run: node scripts/check-tokens.mjs   (also wired into `npm run lint` and CI)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(root, "design-spec/ceremony-tokens.css");
const APP = join(root, "app/globals.css");

/**
 * The spec names font families directly; the app routes them through
 * next/font/local variables. Parity is checked on the family name instead.
 */
const FONT_TOKENS = {
  "--sz-font-display": "Fraunces",
  "--sz-font-ui": "General Sans",
  "--sz-font-mono": "Geist Mono",
};

/** Collapse whitespace so formatting differences never fail the check. */
const normalise = (value) => value.trim().replace(/\s+/g, " ").replace(/;$/, "");

function parseTokens(source) {
  const tokens = new Map();
  // Strip comments first so a commented-out token never registers.
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const pattern = /(--sz-[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
  let match;
  while ((match = pattern.exec(withoutComments)) !== null) {
    tokens.set(match[1], normalise(match[2]));
  }
  return tokens;
}

const spec = parseTokens(readFileSync(SPEC, "utf8"));
const app = parseTokens(readFileSync(APP, "utf8"));

const missing = [];
const mismatched = [];

for (const [token, specValue] of spec) {
  if (!app.has(token)) {
    missing.push(token);
    continue;
  }
  const appValue = app.get(token);

  if (token in FONT_TOKENS) {
    // next/font variables are slugs: "General Sans" arrives as --font-general-sans.
    const slug = FONT_TOKENS[token].toLowerCase().replace(/\s+/g, "-");
    if (!appValue.toLowerCase().replace(/\s+/g, "-").includes(slug)) {
      mismatched.push({
        token,
        expected: `must reference "${FONT_TOKENS[token]}" (as --font-${slug})`,
        actual: appValue,
      });
    }
    continue;
  }

  if (appValue !== specValue) {
    mismatched.push({ token, expected: specValue, actual: appValue });
  }
}

const extra = [...app.keys()].filter((token) => !spec.has(token));

if (missing.length === 0 && mismatched.length === 0) {
  console.log(`✓ token parity — ${spec.size} spec tokens match app/globals.css`);
  if (extra.length > 0) {
    console.log(`  ${extra.length} component tokens extend the spec (allowed)`);
  }
  process.exit(0);
}

console.error("✗ token parity FAILED — app/globals.css has drifted from the Ceremony spec\n");

if (missing.length > 0) {
  console.error(`Missing ${missing.length} token(s):`);
  for (const token of missing) console.error(`  ${token}`);
  console.error("");
}

if (mismatched.length > 0) {
  console.error(`Mismatched ${mismatched.length} token(s):`);
  for (const { token, expected, actual } of mismatched) {
    console.error(`  ${token}`);
    console.error(`    spec: ${expected}`);
    console.error(`    app:  ${actual}`);
  }
  console.error("");
}

console.error("Fix app/globals.css to match design-spec/ceremony-tokens.css.");
console.error("If the SPEC changed, re-export the fixture from the design project first.");
process.exit(1);

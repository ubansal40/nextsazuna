#!/usr/bin/env node
/**
 * Token parity check.
 *
 * Asserts that every token the Ceremony spec declares exists in app/globals.css
 * with an identical value. This is the guard that stops the app drifting into a
 * second design system — which is exactly how the previous Express storefront
 * ended up with a palette that missed the spec on every single colour.
 *
 * It also asserts that lib/cn.ts knows every name the `@theme inline` bridge
 * declares, since a utility tailwind-merge does not recognise is one cn() can
 * silently drop. See `reportCnParity` below.
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

// Nothing parsed is not parity. An emptied fixture, or a declaration format
// the pattern above no longer reads, would otherwise compare zero tokens with
// zero tokens and pass — the check reporting success while checking nothing.
for (const [file, tokens] of [[SPEC, spec], [APP, app]]) {
  if (tokens.size === 0) {
    console.error(`✗ token parity FAILED — no --sz-* tokens could be read from ${file}`);
    process.exit(1);
  }
}

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

/* ----------------------------------------------------------------------------
 * cn() ↔ @theme parity.
 *
 * lib/cn.ts tells tailwind-merge which names each theme scale holds. A name it
 * has not been told about is one it mis-merges: an unknown `text-*` reads as a
 * colour and is dropped the moment a real colour follows it, which is how every
 * custom font size in the system went missing from every cn() call at once.
 * So every name `@theme inline` declares must be listed in THEME_SCALES there,
 * and nothing may be listed that `@theme` no longer declares.
 * ------------------------------------------------------------------------- */
const CN = join(root, "lib/cn.ts");

/** Namespaces tailwind-merge already accepts any name in; cn.ts lists neither. */
const OPEN_NAMESPACES = new Set(["color", "font"]);

/**
 * Tailwind's theme namespaces, longest first, so `--text-shadow-*` is never
 * read as a `--text-*` size or `--font-weight-*` as a family.
 */
const NAMESPACES = [
  "inset-shadow", "drop-shadow", "text-shadow", "font-weight", "breakpoint", "perspective",
  "container", "tracking", "leading", "animate", "spacing", "radius", "shadow", "aspect",
  "color", "blur", "ease", "font", "text",
].sort((a, b) => b.length - a.length);

/** `@theme inline` names by namespace: `--text-control-sm` → text: control-sm. */
function themeScales(css) {
  const block = /@theme\s+inline\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const scales = new Map();
  for (const [, variable] of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([a-z0-9-]+)\s*:/gi)) {
    const namespace = NAMESPACES.find((ns) => variable.startsWith(`${ns}-`));
    const name = namespace && variable.slice(namespace.length + 1);
    // `--text-xs--line-height` is a sub-property of a size, not a size.
    if (!name || name.includes("--")) continue;
    if (!scales.has(namespace)) scales.set(namespace, new Set());
    scales.get(namespace).add(name);
  }
  return scales;
}

/** THEME_SCALES out of lib/cn.ts, or null if it cannot be found. */
function cnScales(source) {
  const block = /const THEME_SCALES\b[^=]*=\s*\{([\s\S]*?)\n\}/.exec(source)?.[1];
  if (!block) return null;
  const scales = new Map();
  const code = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const [, key, list] of code.matchAll(/["']?([a-z-]+)["']?\s*:\s*\[([^\]]*)\]/g)) {
    scales.set(key, new Set([...list.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])));
  }
  return scales;
}

/** Prints its own result; true when cn.ts and `@theme` agree. */
function reportCnParity() {
  const theme = themeScales(readFileSync(APP, "utf8"));
  const known = cnScales(readFileSync(CN, "utf8"));
  if (!known) {
    console.error("✗ cn() parity FAILED — THEME_SCALES not found in lib/cn.ts");
    return false;
  }

  // Tailwind resolves `text-x` to the colour when `--color-x` exists too, so a
  // size of the same name is unreachable and cn must not merge it as one.
  const colours = theme.get("color") ?? new Set();
  const problems = [];
  let names = 0;

  for (const [namespace, declared] of theme) {
    if (OPEN_NAMESPACES.has(namespace)) continue;
    const listed = known.get(namespace) ?? new Set();
    for (const name of declared) {
      if (namespace === "text" && colours.has(name)) continue;
      names += 1;
      if (!listed.has(name)) problems.push(`  missing  ${namespace}: ${name}   (--${namespace}-${name})`);
    }
  }
  for (const [namespace, listed] of known) {
    const declared = theme.get(namespace) ?? new Set();
    for (const name of listed) {
      if (!declared.has(name)) problems.push(`  stale    ${namespace}: ${name}   (no --${namespace}-${name} in @theme)`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ cn() parity — tailwind-merge knows all ${names} theme names in lib/cn.ts`);
    return true;
  }
  console.error("✗ cn() parity FAILED — lib/cn.ts THEME_SCALES has drifted from @theme inline\n");
  for (const line of problems) console.error(line);
  console.error("\nUpdate THEME_SCALES in lib/cn.ts. A utility from a scale tailwind-merge");
  console.error("does not know is either dropped by cn() or never merged by it.");
  return false;
}

if (missing.length === 0 && mismatched.length === 0) {
  console.log(`✓ token parity — ${spec.size} spec tokens match app/globals.css`);
  if (extra.length > 0) {
    console.log(`  ${extra.length} component tokens extend the spec (allowed)`);
  }
  process.exit(reportCnParity() ? 0 : 1);
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
console.error("");
reportCnParity();
process.exit(1);

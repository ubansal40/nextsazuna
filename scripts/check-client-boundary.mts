#!/usr/bin/env node
/**
 * The server/client module boundary — the failure that type-checks, builds, and
 * then 500s in production.
 *
 * When a Server Component imports a plain VALUE from a `"use client"` module,
 * Next replaces that module's exports with client-reference proxies. TypeScript
 * still sees the real type, `npm run build` still succeeds, and the value is
 * simply not what it claims to be at runtime.
 *
 * This repo has now hit it in both directions:
 *
 *   - `STATUS_COLOURS` imported as a value INTO a client component, which drags
 *     `next/headers` into the browser bundle and fails the build (loud).
 *   - `SORT_VALUES`, a `Set` exported FROM a `"use client"` toolbar and read by
 *     three server pages, which shipped and crashed every listing that carried
 *     a `?sort=` parameter (silent until a customer sorted).
 *
 * The second is the dangerous one, so this checks for it: a non-client module
 * importing a non-component, non-type value from a client module.
 *
 * The component heuristic is deliberate. Importing a COMPONENT from a client
 * module into a server component is the normal, correct thing to do all day
 * long — that is how client islands work. What is never safe is importing a
 * constant, a function, a Set or a Map. Components are PascalCase by
 * convention, everything else is not, so PascalCase names are allowed through
 * and the rest are flagged.
 *
 * Run: npx tsx scripts/check-client-boundary.mts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXT = new Set([".ts", ".tsx"]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = (await Promise.all(ROOTS.map(walk))).flat();
const source = new Map<string, string>();
for (const f of files) source.set(f, await readFile(f, "utf8"));

const isClient = (file: string): boolean => {
  const head = (source.get(file) ?? "").slice(0, 200);
  return /^\s*["']use client["']/m.test(head);
};

/** Resolve an import specifier to a file in this repo, or null if external. */
function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (source.has(candidate)) return candidate;
  }
  return null;
}

const IMPORT = /import\s+(type\s+)?(\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+["']([^"']+)["']/g;
const NAMESPACE_IMPORT = /import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
const RE_EXPORT = /export\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
const STAR_EXPORT = /export\s+\*\s+from\s+["']([^"']+)["']/g;

/**
 * The module a name really comes from, following `export { … } from` and
 * `export * from` re-exports.
 *
 * Imports are meant to go through barrels — CLAUDE.md sends every primitive
 * through `@/components/ui` — and the barrel itself is not a client module, so
 * a check that stopped at the first file it resolved never saw a value that a
 * client module re-exported through one. A `"use client"` constant reached as
 * `import { X } from "@/components/ui"` is exactly as much of a proxy as one
 * imported from its own file.
 */
function origin(file: string, name: string, seen = new Set<string>()): string {
  if (seen.has(file)) return file;
  seen.add(file);
  const text = source.get(file) ?? "";
  for (const [, typeOnly, list, spec] of text.matchAll(RE_EXPORT)) {
    if (typeOnly) continue;
    for (const entry of list.split(",").map((e) => e.trim()).filter(Boolean)) {
      if (entry.startsWith("type ")) continue;
      const [original, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
      if ((alias ?? original) !== name) continue;
      const target = resolve(file, spec);
      return target ? origin(target, original, seen) : file;
    }
  }
  for (const [, spec] of text.matchAll(STAR_EXPORT)) {
    const target = resolve(file, spec);
    if (!target) continue;
    const found = origin(target, name, seen);
    if (found !== target || new RegExp(`export\\s+(?:const|let|var|function|class|async\\s+function)\\s+${name}\\b`).test(source.get(target) ?? "")) {
      return found;
    }
  }
  return file;
}

/** Every module a namespace import can reach, through re-exports. */
function reachable(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = source.get(file) ?? "";
  const next = [...text.matchAll(RE_EXPORT)].filter((m) => !m[1]).map((m) => m[3]);
  next.push(...[...text.matchAll(STAR_EXPORT)].map((m) => m[1]));
  return [
    file,
    ...next.flatMap((spec) => {
      const target = resolve(file, spec);
      return target ? reachable(target, seen) : [];
    }),
  ];
}

interface Violation {
  file: string;
  target: string;
  names: string[];
}
const violations: Violation[] = [];

for (const [file, text] of source) {
  if (isClient(file)) continue; // server importing client is the risky direction
  for (const match of text.matchAll(IMPORT)) {
    const [, typeOnly, clause, spec] = match;
    if (typeOnly) continue;
    const target = resolve(file, spec);
    if (!target) continue;

    const braces = clause.match(/\{([^}]*)\}/);
    const names = (braces ? braces[1] : clause)
      .split(",")
      .map((n) => n.split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
      // `import { type Foo }` is erased at compile time and cannot be a proxy.
      .filter((n) => !n.startsWith("type "))
      // PascalCase is a component; anything else is a value the server will
      // read and find is not what it says it is.
      .filter((n) => !/^[A-Z][a-z]/.test(n));

    // Grouped by the client module each value really lives in.
    const byOrigin = new Map<string, string[]>();
    for (const name of names) {
      const home = origin(target, name);
      if (isClient(home)) byOrigin.set(home, [...(byOrigin.get(home) ?? []), name]);
    }
    for (const [home, found] of byOrigin) violations.push({ file, target: home, names: found });
  }

  // `import * as ns` from a client module is a proxy object, whatever it holds.
  for (const [, spec] of text.matchAll(NAMESPACE_IMPORT)) {
    const target = resolve(file, spec);
    const client = target ? reachable(target).find(isClient) : undefined;
    if (client) violations.push({ file, target: client, names: ["* (namespace import)"] });
  }
}

if (violations.length > 0) {
  console.error("✗ server modules importing non-component values from client modules:\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    imports ${v.names.join(", ")} from ${v.target} ("use client")`);
    console.error(`    -> at runtime these are client-reference proxies, not the values they appear to be.`);
    console.error(`    -> move them to a module with neither "use client" nor "server-only".\n`);
  }
  console.error(`${violations.length} violation(s)`);
  process.exit(1);
}

console.log(`PASS  no server module reads a value out of a "use client" module`);
console.log(`      (scanned ${files.length} files, ${files.filter(isClient).length} of them client modules)`);

#!/usr/bin/env node
/**
 * Is this machine's `sharp` actually able to process images?
 *
 * Written because a production install reported "Input buffer contains
 * unsupported image format" for a genuine 1 MB PNG and a genuine 1.5 MB JPEG.
 * `sharp.format.jpeg.input.buffer` was `true` on that box — the capability
 * flags describe what libvips was CONFIGURED with, not what its runtime
 * libraries can actually do, so a mismatched or partial install advertises
 * support it cannot deliver.
 *
 * So this does not ask. It encodes and decodes real bytes, and reports which
 * step fails. Run it ON the server:
 *
 *     npx tsx scripts/check-sharp.mts
 *
 * A failure here is an install problem, not a code problem. `sharp` ships
 * platform-specific binaries; deploying a `node_modules` built on macOS to a
 * Linux host, or installing with `--omit=optional`, leaves exactly this state.
 * The fix is to reinstall it for the target platform on the target machine:
 *
 *     npm install --cpu=x64 --os=linux --libc=glibc sharp
 *
 * or simply `rm -rf node_modules && npm ci` executed on the server itself.
 */
import sharp from "sharp";

const checks: [string, boolean, string][] = [];
let fatal = "";

console.log(`sharp runtime: libvips ${sharp.versions.vips}`);
console.log(`platform: ${process.platform}-${process.arch}\n`);

/** A tiny real image, built from raw pixels so nothing is read from disk. */
const raw = {
  create: { width: 64, height: 64, channels: 3 as const, background: { r: 200, g: 160, b: 90 } },
};

async function step(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    checks.push([name, true, ""]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push([name, false, message]);
    if (!fatal) fatal = message;
    return false;
  }
}

// Encode first: each output format exercises a different libvips writer.
let png = Buffer.alloc(0);
let jpeg = Buffer.alloc(0);
let avif = Buffer.alloc(0);

await step("encode PNG", async () => (png = await sharp(raw).png().toBuffer()));
await step("encode JPEG", async () => (jpeg = await sharp(raw).jpeg().toBuffer()));
await step("encode AVIF (needs libheif — the pipeline's output format)", async () => {
  avif = await sharp(raw).avif({ quality: 75 }).toBuffer();
});

// Then decode what we just wrote. This is the step that failed in production.
if (png.length) await step("decode PNG", () => sharp(png).metadata());
if (jpeg.length) await step("decode JPEG", () => sharp(jpeg).metadata());
if (avif.length) await step("decode AVIF", () => sharp(avif).metadata());

// The real pipeline's shape: rotate, cover-crop, composite, encode.
if (png.length) {
  await step("resize + composite + encode (the product pipeline)", () =>
    sharp(png)
      .rotate()
      .resize(200, 200, { fit: "cover", position: "centre" })
      .composite([{ input: png, left: 10, top: 10 }])
      .avif({ quality: 75 })
      .toBuffer(),
  );
}

// The SKU stamp needs a text renderer (pango), which is a separate dependency
// and fails independently of the image codecs.
await step("render text (pango — the SKU stamp)", () =>
  sharp({ text: { text: "SAZ-TEST-001", font: "monospace", width: 200, height: 30, rgba: true } })
    .png()
    .toBuffer(),
);

console.log("");
let failed = 0;
for (const [name, ok, message] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (message) console.log(`      ${message}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);

if (failed) {
  console.error(
    "\n✗ sharp cannot process images on this machine. This is an INSTALL problem,\n" +
      "  not a code problem — the same code passes elsewhere.\n\n" +
      "  Fix, run on this machine:\n" +
      "    rm -rf node_modules/sharp node_modules/@img\n" +
      "    npm install --cpu=x64 --os=linux --libc=glibc sharp\n\n" +
      "  or reinstall everything here rather than uploading node_modules:\n" +
      "    rm -rf node_modules && npm ci\n",
  );
}
process.exit(failed ? 1 : 0);

import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { PermanentImageError, sniffImageFormat, storeProductImage } from "@/lib/admin/images";
import { createGate, GateTimeoutError } from "@/lib/admin/image-limit";
import { MAX_PHOTO_BYTES, photoSizeLimitMessage } from "@/lib/admin/product-limits";

/**
 * Product photo upload and processing — POST /admin/products/upload.
 *
 * **One photo per request.** That is the design, not a limitation: the editor
 * fires one of these per file, so each request is a bounded ~2 seconds of sharp
 * work, each photo's tile updates the moment its own request returns, and a
 * single bad file fails on its own without taking the batch with it. It is also
 * what let the job queue be deleted — the reason that queue existed was a save
 * carrying twelve photos outliving its request.
 *
 * The response URL is the FINAL image. There is no raw stage any more: the
 * product record only ever points at processed files, so a product can never be
 * saved in a state where its photos have not been made yet.
 *
 * A Route Handler (not a Server Action) because it takes multipart file data,
 * and it answers JSON with real status codes because a `fetch` wants a status,
 * not the HTML of a login page.
 */

/**
 * How many encodes run at once, process-wide, and how long a request may wait
 * for a slot.
 *
 * Each pipeline holds a decoded full-resolution bitmap — roughly 48 MB for a
 * 4032×3024 phone photo — so this is a memory dial, not a speed dial. Two is
 * what the shared-hosting box has headroom for, and it is the same number the
 * old queue used. On `globalThis` so hot reload does not hand out a second set
 * of slots against the same finite memory.
 */
declare global {
  var __sazunaImageGate: ReturnType<typeof createGate> | undefined;
}

const CONCURRENCY = Math.max(1, Number(process.env.PRODUCT_IMAGE_PROCESS_CONCURRENCY) || 2);
const GATE_WAIT_MS = Math.max(5_000, Number(process.env.PRODUCT_IMAGE_GATE_WAIT_MS) || 30_000);

function gate() {
  globalThis.__sazunaImageGate ??= createGate(CONCURRENCY, GATE_WAIT_MS);
  return globalThis.__sazunaImageGate;
}

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!authorizeSection(admin, "products")) {
    return NextResponse.json({ error: "You don't have access to products." }, { status: 403 });
  }

  const form = await request.formData();

  /**
   * The SKU is required, not defaulted.
   *
   * It is burned into the image, so a fallback would silently stamp a
   * photograph with the word "product" and there would be no way back short of
   * re-uploading. The editor keeps the photo picker disabled until the SKU
   * field is filled; this is the boundary that makes that a rule rather than a
   * courtesy.
   */
  const sku = String(form.get("sku") ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "Enter the SKU before adding photos." }, { status: 400 });
  }

  const files = form.getAll("image").filter((f): f is File => f instanceof File);
  if (files.length !== 1) {
    return NextResponse.json({ error: "Send exactly one photo per request." }, { status: 400 });
  }

  const file = files[0];
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: photoSizeLimitMessage() }, { status: 400 });
  }

  /**
   * There is deliberately no check on `file.type`.
   *
   * The declared MIME type is whatever the browser felt like sending, and for
   * the format that matters most it is routinely wrong: iPhones hand over HEIC
   * as `application/octet-stream`, so an `image/*` gate rejects a photograph
   * this pipeline can decode perfectly well — with "only image files are
   * allowed", about an image file.
   *
   * The magic bytes are the honest boundary. `storeProductImage` sniffs the
   * real format and refuses what this build cannot read, naming the format in
   * the message. A file that lies about being an image gets refused there, one
   * sentence later, having cost nothing but a buffer.
   */
  const source = Buffer.from(await file.arrayBuffer());

  try {
    const url = await gate().run(() => storeProductImage(source, sku));
    return NextResponse.json({ url });
  } catch (error) {
    // The file is the problem and the operator is the only one who can fix it,
    // so the message goes through verbatim and the status says "your input".
    if (error instanceof PermanentImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GateTimeoutError) {
      return NextResponse.json(
        { error: "The server is busy processing photos. Try that one again in a moment." },
        { status: 503 },
      );
    }
    // Ours. Log the detail that makes it diagnosable — which file, how big,
    // what it actually was — and tell the operator nothing they can't use.
    console.error(
      `[admin] image processing failed [${file.name}, ${source.length} bytes, detected ${sniffImageFormat(source)}]`,
      error,
    );
    return NextResponse.json({ error: "That photo couldn't be processed. Please try again." }, { status: 500 });
  }
}

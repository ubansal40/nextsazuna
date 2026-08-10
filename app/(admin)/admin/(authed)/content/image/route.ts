import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { PermanentImageError, sniffImageFormat, storeContentImage } from "@/lib/admin/images";

/**
 * Homepage image upload — POST /admin/content/image.
 *
 * Its own route rather than an extra `kind` on the taxonomy one. There, `kind`
 * doubles as the RBAC section key, which is what stops a staffer granted
 * `categories` using it as a side door into collections. Adding a third value
 * to that set would make the same string mean two things — a section name and
 * an output shape — and the guarantee would rest on nobody noticing.
 *
 * A Route Handler because this is multipart, and it answers JSON with real
 * status codes: a `fetch` wants a status, not the HTML of a login page.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const SHAPES = new Set(["square", "wide"]);

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!authorizeSection(admin, "content")) {
    return NextResponse.json({ error: "You don't have access to site content." }, { status: 403 });
  }

  const form = await request.formData();

  /**
   * The shape comes from the field's own schema, not from the operator — a hero
   * slide is always wide, a category tile always square. Validated anyway,
   * because it arrives over the wire.
   */
  const shape = String(form.get("shape") ?? "");
  if (!SHAPES.has(shape)) {
    return NextResponse.json({ error: "Unknown image shape." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is over 8 MB." }, { status: 400 });
  }

  // No check on the declared MIME type — browsers lie about it, most notably
  // sending HEIC as application/octet-stream. The magic bytes are the honest
  // boundary and `storeContentImage` refuses what it cannot decode, naming the
  // format it actually found.
  const source = Buffer.from(await file.arrayBuffer());
  const slug = String(form.get("slug") ?? "homepage");

  try {
    const url = await storeContentImage(source, slug, shape as "square" | "wide");
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof PermanentImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      `[admin] content image upload failed [${file.name}, ${source.length} bytes, detected ${sniffImageFormat(source)}]`,
      error,
    );
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { storeRawUpload } from "@/lib/admin/images";

/**
 * Raw product-photo upload — POST /admin/products/upload.
 *
 * Stores the raw files and returns their URLs; the editor previews them and
 * hands them back on save, where the sharp pipeline processes them. A Route
 * Handler (not a Server Action) because it takes multipart file data, and it
 * gates itself with 401/403 JSON rather than redirecting — a `fetch` wants a
 * status, not an HTML login page.
 */

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;
/**
 * Any `image/*`, as sazuna-unik 2 does. A narrower allowlist rejected files
 * this pipeline can actually process, and browsers report HEIC inconsistently
 * (often `application/octet-stream`), so the declared type is a poor gate.
 * `processProductImage` sniffs the real format and refuses what it cannot read,
 * with a message naming the format — that is the honest boundary.
 */
const ALLOWED = /^image\//;

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!authorizeSection(admin, "products")) {
    return NextResponse.json({ error: "You don't have access to products." }, { status: 403 });
  }

  const form = await request.formData();
  const sku = String(form.get("sku") ?? "product");
  const files = form.getAll("images").filter((f): f is File => f instanceof File);

  if (files.length === 0) return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} photos.` }, { status: 400 });

  try {
    const urls: string[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "A photo is over 15 MB." }, { status: 400 });
      if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const extension = file.name.split(".").pop() ?? "jpg";
      urls.push(await storeRawUpload(buffer, sku, extension));
    }
    return NextResponse.json({ urls });
  } catch (error) {
    console.error("[admin] product image upload failed", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

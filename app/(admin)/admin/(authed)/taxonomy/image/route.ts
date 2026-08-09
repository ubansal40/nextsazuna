import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { storeSquareImage } from "@/lib/admin/images";

/**
 * Taxonomy artwork upload — POST /admin/taxonomy/image.
 *
 * One route for both the categories and the collections drawer, because the
 * image is the same 1:1 asset on either. The caller says which screen it is
 * uploading from (`kind`) and the route authorizes THAT section, so a staffer
 * granted `categories` alone cannot use it as a side door into collections.
 *
 * Like the product upload it is a Route Handler rather than a Server Action —
 * it takes multipart file data — and it answers with JSON 401/403 rather than
 * redirecting, because a `fetch` wants a status, not an HTML login page.
 *
 * Unlike the product pipeline there is no raw/processed split: the file is
 * processed and stored in one step and only the final URL is returned. The
 * drawer holds that URL until the admin saves, so an abandoned drawer leaves an
 * unreferenced file, not a half-written category.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp|avif|gif)$/;
const KINDS = new Set(["categories", "collections"]);

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Unknown image kind." }, { status: 400 });
  if (!authorizeSection(admin, kind)) {
    return NextResponse.json({ error: `You don't have access to ${kind}.` }, { status: 403 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The image is over 8 MB." }, { status: 400 });
  if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });

  // A hint for the filename only — never a path. `storeSquareImage` sanitises it
  // down to `[a-z0-9_-]`, so nothing here can escape the upload directory.
  const slug = String(form.get("slug") ?? kind);

  try {
    const url = await storeSquareImage(Buffer.from(await file.arrayBuffer()), slug);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[admin] taxonomy image upload failed", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

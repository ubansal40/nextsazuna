import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { parseSkuSheetUpload, replaceSkuWeights, getSkuSheetStatus } from "@/lib/admin/sku-weights";

/**
 * The inventory sheet behind SKU autofill — POST /admin/products/sku-sheet.
 *
 * A Route Handler because it takes a file, answering 401/403 as JSON rather than
 * redirecting: a `fetch` wants a status, not an HTML login page.
 *
 * One upload replaces the sheet in force. That is the old admin's behaviour and
 * the one staff expect — merging would leave stale weights alive with no way to
 * tell which upload they came from.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_NAME = /\.(xlsx|csv)$/i;

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!authorizeSection(admin, "products")) {
    return NextResponse.json({ ok: false, error: "You don't have access to products." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "That file is over 12 MB." }, { status: 400 });
  }
  if (!ALLOWED_NAME.test(file.name)) {
    return NextResponse.json({ ok: false, error: "Upload an .xlsx or .csv file." }, { status: 400 });
  }

  // Parsing rejections name the fix (wrong columns, empty sheet), so they are
  // shown as-is. Anything else is ours: logged, not leaked.
  let sheet;
  try {
    sheet = await parseSkuSheetUpload(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "That file could not be read." },
      { status: 400 },
    );
  }

  try {
    await replaceSkuWeights(admin, sheet.rows, file.name);
    return NextResponse.json({
      ok: true,
      status: await getSkuSheetStatus(),
      parsed: sheet.rows.length,
      skipped: sheet.skippedRows,
    });
  } catch (error) {
    console.error("[admin] sku sheet upload failed", error);
    return NextResponse.json(
      { ok: false, error: "The upload didn't finish. The previous sheet is unchanged." },
      { status: 500 },
    );
  }
}

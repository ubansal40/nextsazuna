import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { readSkuSheet, dryRunStockSync, applyStockSync, type StockPlan } from "@/lib/admin/stock";

/**
 * Stock sync — POST /admin/stock/sync.
 *
 * `mode=dry` reports what the sheet would do and changes nothing; `mode=apply`
 * performs the atomic update. The client posts the file for each, so no
 * server-side draft state exists between the preview and the apply — there is
 * nothing to go stale, and nothing to leak between admins. The apply recomputes
 * its own counts inside its transaction, so a preview that has aged does not
 * make the reported result wrong.
 *
 * A Route Handler rather than a Server Action because it takes a file, and it
 * answers 401/403 as JSON rather than redirecting, because a `fetch` wants a
 * status and not an HTML login page.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_NAME = /\.(xlsx|csv)$/i;

export type StockSyncResponse = { ok: true; mode: "dry" | "apply"; plan: StockPlan } | { ok: false; error: string };

export async function POST(request: Request): Promise<Response> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!authorizeSection(admin, "products_stock")) {
    return NextResponse.json({ ok: false, error: "You don't have access to stock management." }, { status: 403 });
  }

  const form = await request.formData();
  const mode = String(form.get("mode") ?? "dry");
  if (mode !== "dry" && mode !== "apply") {
    return NextResponse.json({ ok: false, error: "Unknown sync mode." }, { status: 400 });
  }

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

  // Parsing rejections are the admin's problem to fix (wrong column, empty
  // sheet, too many rows), so their messages are surfaced as-is. Anything else
  // is ours, and is logged rather than shown.
  let sheet;
  try {
    sheet = await readSkuSheet(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "That file could not be read." },
      { status: 400 },
    );
  }

  try {
    const plan =
      mode === "apply" ? await applyStockSync(admin, sheet, file.name) : await dryRunStockSync(sheet);
    return NextResponse.json({ ok: true, mode, plan });
  } catch (error) {
    console.error("[admin] stock sync failed", { mode, error });
    return NextResponse.json(
      { ok: false, error: "The sync didn't finish. No changes were applied." },
      { status: 500 },
    );
  }
}

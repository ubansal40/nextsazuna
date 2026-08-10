# Admin rebuild — session handoff (Stage 4)

> ## ⚠ START HERE — open thread as of `083e512`
>
> **Phases A–H are complete and pushed.** So is the image system, which was
> rebuilt from scratch on the owner's instruction in `5742e22`.
>
> ### 1. Images: the job queue is GONE. Do not look for it.
>
> Photos are processed **inside their own upload request, one file per
> request** (`app/(admin)/admin/(authed)/products/upload/route.ts` →
> `storeProductImage`). A product record only ever points at finished images.
>
> Deleted in `5742e22`, along with migration **0017 dropping
> `product_image_jobs`**: `lib/admin/image-jobs.ts`, `lib/admin/image-queue.ts`,
> the `/admin/products/image-jobs` route, `check:image-queue`, the cron
> requirement, `IMAGE_JOB_*` env vars, and the Processing/Failed product
> statuses. **If an older note in this file or in git history mentions any of
> them, that note is stale.**
>
> What replaces the queue's memory ceiling is `lib/admin/image-limit.ts` — a
> counting gate, default 2 concurrent encodes, because each sharp pipeline holds
> a decoded ~48 MB bitmap and an OOM kill on shared hosting takes the storefront
> down with the admin.
>
> **Owner's decisions, all explicit — do not relitigate:** process at upload ·
> storage at `/home/u721828376/domains/sazuna-storage/uploads/products` · keep
> logo + SKU burned in · single 1000×1000 AVIF · SKU required first and locked
> once photos exist (existing products too) · originals discarded · centre
> cover-crop · existing 2,585 products untouched · taxonomy artwork untouched ·
> 5 photos, 25 MB each · drag to reorder, first is cover.
>
> ### 2. What is proven, and what is not
>
> `npm run verify` passes. `check:images` is **40 assertions** and runs the real
> sharp pipeline — including that the stamp actually renders (the same photo
> under two SKUs must produce different bytes; a blank pango render would make
> them identical) and the gate's ordering, throw-safety and timeout cleanup.
> The upload route answers 401 unauthenticated; `/admin/products/image-jobs` is
> 404. Migration 0017 applied locally.
>
> **Not verified:** the editor UI in a browser. It is behind the admin login and
> I do not enter passwords. The owner was asked to either sign in on the local
> preview so it can be driven, or test on production — they chose production.
>
> **Not yet done on production:** apply migration 0017, set
> `PRODUCT_IMAGE_UPLOAD_DIR`, deploy, restart, upload one photo.
>
> ### 3. The SVG watermark incident (`083e512`) — READ BEFORE TOUCHING images.ts
>
> Every upload on production failed with libvips' "Input buffer contains
> unsupported image format", which names the customer's *photograph*. The
> photograph was never involved.
>
> The SKU label's rounded background was an inline SVG handed to sharp. libvips
> renders SVG via **librsvg, which is optional**. Everything offline said it was
> fine — `sharp.format.svg.input` true, standalone scripts in the app directory
> decoded SVG through both CJS and ESM, in both installed libvips builds. It
> failed **only inside the LiteSpeed-hosted process**, which could not be
> instrumented. The mechanism is unproven and now moot: the rectangle is drawn
> as raw RGBA pixels. `check:images` fails the build if anything constructs an
> SVG in that file again.
>
> **How it was traced, if something similar happens:** the stack's
> `Promise.all (index N)` identifies which overlay, and the byte offset in the
> deployed chunk (`.next/server/chunks/…`) can be read directly with
> `head -c N file | tail -c 500` to see exactly which statement threw.
>
> **Also fixed:** overlay failures now throw `ImageOverlayError` and say "server
> fault, not your file". They used to fall through to "that photo couldn't be
> processed, please try again", which is what kept this invisible while people
> retried different photographs.
>
> ### 4. Two deployments, and one has the WRONG storage path
>
> `new.sazunajewellers.com` is still running (it is the only long-lived Node
> process on the box) and its `PRODUCT_IMAGE_UPLOAD_DIR` is
> `/home/u721828376/sazuna-storage/uploads/products` — **not** the
> `~/domains/sazuna-storage/...` that `next.` uses. Both directories exist, with
> 439 and 440 files. `next.` is authoritative; retire `new.` and delete the
> stray storage dir once its contents are confirmed redundant.
>
> `Failed to find Server Action …` in the log is unrelated: a browser tab
> holding JavaScript from an older build. A hard refresh clears it.
>
> ### 5. Production facts — VERIFIED over SSH, do NOT re-investigate
>
> Key-based SSH (`~/.ssh/id_ed25519_sazuna`, port 65002,
> `u721828376@76.13.74.211`), tested on the box itself:
>
> - **sharp is fine.** libvips 8.17.3; PNG/JPEG/AVIF decode; HEIF in+out true;
>   logo loads; pango renders (36 fonts); SVG input renders. **Do not reinstall
>   sharp** — an earlier diagnosis of mine said to; it was wrong.
> - **The exact JPEG that failed decodes** (4032×3024) and the full pipeline
>   succeeds on it. The failure was never a codec fault.
> - **Cause: the live process was running a STALE BUILD.** Hostinger deploys to
>   `hbuilds/versions/<uuid>` with `current` a symlink; the process kept an old
>   version while `current` moved. Anything written inside the app dir dies on
>   the next deploy — which is why uploads must live in `sazuna-storage`.
> - **App path:** `~/domains/next.sazunajewellers.com/hbuilds/current/nodejs`.
>   Node is not on PATH — use `/opt/alt/alt-nodejs22/root/usr/bin/node`.
>   Run node from inside that dir or `require("sharp")` will not resolve.
> - **A second deploy exists at `new.sazunajewellers.com`** running the same
>   app. `next.` is authoritative (owner confirmed). Retire `new.`.
> - The owner was asked to rotate the SSH password (it was pasted in chat and
>   never used by me). Confirm it was rotated.
>
> ### 6. Then: performance (the one unstarted item from the fix list)
>
> Owner had no preference; **decided approach**: cache storefront pages with
> ~60s revalidation AND bust paths on admin writes, so the timer is a safety
> net for any path missed. Storefront pages are all `force-dynamic` today and
> the DB is ~320ms per round trip.
>
> ### 7. Unverified UI from the parallel agent work (`626e16b`)
>
> Five agents built these; all typecheck + lint + build, and I browser-checked
> only customers and pricing. **Not visually verified:** the multi-card product
> editor, bulk-edit screen, product picker, dashboard, orders mobile collapse,
> footer at 375px, tag drag, customer phone change.
>

**Purpose.** Resume the admin build in a fresh session with zero loss. Read this
top-to-bottom. Phases **A–H are complete**; what remains is the "Still open at
cutover" list below. Fact as of `8a37ba6`.

## TL;DR resume

The admin is being rebuilt in Next to the **Claude Design specs** (project
`deea797d-e4b5-409c-b32f-f5f926846bb6`, read via the DesignSync tool). Owner
chose **full design fidelity** — build the mocks completely, new backend
included. Full architecture + decisions + sequence live in the plan file:
`~/.claude/plans/twinkling-prancing-babbage.md`. **Read the plan and this file.**
Every phase A–H has landed; the open items are the cutover list at the end.

Design source of truth per screen: fetch the page's `.dc.html` via
`DesignSync get_file` (projectId above) **before building it**, strip
`<style>/<script>/<svg>` to read structure, and match it. All in-scope specs have now been read and built: `Sazuna Admin.dc.html`
(shell + shared patterns), `…Products`, `…Product Picker`, `…Taxonomy`,
`…Stock Management`, `…Orders`, `…Pricing Rules`. Unread and unbuilt, by owner
decision: `…Coupons`, `…Loyalty`, and the Orders spec's **Order Desk (POS)**.

## What is DONE (all committed, all `npm run verify` green)

- **Foundations:** admin design tokens (`app/globals.css` `--sz-admin-*`), auth
  (`lib/admin/{session,login-rules,rbac,require}.ts`; `sazuna_admin` cookie DB
  sessions, atomic lockout, deny-by-default RBAC), `scripts/create-admin.mts`,
  migrations 0008 (admin sessions) + 0009 (kills the reference default admin).
  Login + shell + dashboard: `app/(admin)/admin/(authed)/` layout guards with
  `requireAdmin`, `components/admin/admin-shell.tsx` (sidebar/topbar/mobile
  drawer), dashboard reads live orders.
- **Phase B — products (complete):** list
  (`app/(admin)/admin/(authed)/products/`), image pipeline
  (`lib/admin/images.ts` — sharp, 1000² AVIF + logo + SKU stamp, matched to
  sazuna-unik2), pricing engine (`lib/admin/pricing.ts` — sandboxed formula
  evaluator), editor (`product-write.ts`, `image-jobs.ts`, upload route),
  picker.
- **Phase C — taxonomy (complete):** migrations 0010 (materials/purities), 0011
  (tag_groups + tag cols), 0012 (category/collection enrichment +
  collection_products). Data layer `lib/admin/taxonomy.ts`. Screens: materials,
  purities (shared `VocabScreen`), categories (tree), collections (rules +
  price band), tags (groups + merge). Shared UI: `components/admin/`
  (Chip, ProductThumb, ConfirmDialog, Switch, MultiSelect, taxonomy/*).

## Resume here — remaining work, in order

1. ~~**Shared taxonomy image upload.**~~ **DONE** (`931d837`). `storeSquareImage`
   + `POST /admin/taxonomy/image` (authorizes the `kind` the caller names) +
   `components/admin/image-field.tsx`, wired into both drawers. Collections also
   gained the spec's hand-picked `collection_products` (ordered, replace-in-full,
   audited in-transaction) and a rules∪picks DISTINCT count.
   **Storefront wired at the same time:** `lib/catalog/products.ts` had resolved
   collections by category rules alone — the live collection showed 906 products
   against the admin's 953. `collectionMembership()` there is now the twin of
   `COLLECTION_MATCH`; keep the two in step.
2. ~~**Phase D — stock management.**~~ **DONE** (`2cd9a16`).
   `lib/admin/stock-parse.ts` (pure, no `server-only`, 31 checks in
   `check:stock`) + `lib/admin/stock.ts` + `POST /admin/stock/sync?mode=dry|apply`
   + the screen. Dep added: `read-excel-file` (use `readSheet`, NOT the default
   export — v9's default returns every sheet wrapped in `{sheet, data}`). CSV is
   parsed in-repo; only column A is needed.
   - **Do not** reuse the reference's SKU-weights parser here: it drops rows
     with no weight/purity, so a one-column stock list parses to nothing.
   - A minimal `.xlsx` lacking `styles.xml`/`sharedStrings.xml` makes
     `read-excel-file` throw an opaque error; the route already turns that into
     "That spreadsheet could not be read." Real Excel exports always include both.
   - **No product in this catalogue has `always_available = 1`**, so the
     exemption has no live coverage — it was proven by setting the flag on one
     product and restoring. Keep that in mind before trusting it at cutover.
3. ~~**Phase E — orders.**~~ **DONE** (`c8f7565`, `c2f1cc2`, `65eb97e`, + timeline).
   Migration 0013; `lib/admin/{order-statuses,orders,order-detail,order-money,
   order-status-colours}.ts`; the list, the manage-statuses drawer and the
   detail screen. `check:order-money` (31 checks) is in verify + CI.
   - **`customer_visible` is not the lookup gate.** `HIDDEN_ORDER_STATUSES` in
     `lib/order-lookup.ts` stays code-level: it is an enumeration boundary, and
     an admin toggling a switch must not expose gateway-incomplete orders.
   - **Storefront timeline is wired.** `buildTimeline(order, statuses)` now
     builds from `order_statuses`. The old ladder was
     `placed→confirmed→shipped→delivered`, and neither "shipped" nor "delivered"
     was ever a status this system could hold. The ladder is cut at the FIRST
     terminal status, so "Cancelled" (terminal, and after "Completed" in the
     admin's order) is not drawn as a future step on every order.
   - `lib/order-lookup.ts` stays pure — statuses are passed in, loaded by
     `loadTimelineStatuses()` in `lib/orders.ts`.
   - **Not built:** the spec's notify (SMS/WhatsApp/Email) modal, and the
     result-panel "N products couldn't be updated" branch (our apply is one
     atomic statement, so no partial state exists). Notify is the real gap —
     `AAKASH_SMS_TOKEN` and SMTP are unset, so it would "skip" anyway.

4. ~~**Phase F — customers CRM.**~~ **DONE** (`8a37ba6`). `lib/admin/customers.ts`
   + the screen. `phone` is immutable *structurally* — the UPDATE is built from
   an `EDITABLE_FIELDS` whitelist that has no phone entry, so no request body
   can reach the column. `loyalty_points` excluded for the same reason (it is a
   balance `loyalty_ledger` reconciles to).
   - **Lifetime spend is a DENYLIST** (excludes pending_payment, payment_failed,
     cancelled), not the reference's allowlist of billed+completed. With
     configurable statuses an allowlist values every newly-added status at zero.
   - `loyalty_ledger` has **0 rows** live, so only its empty state has been seen.
5. ~~**Phase G — pricing-rules UI.**~~ **DONE** (`14c713a`). Migration 0014 adds
   the four weight bands; `lib/admin/pricing-rules.ts` + the screen; `check:pricing`
   is 24 → 33 checks.
   - **`resolveBasePrice` in `product-write.ts` must read the band columns.** It
     originally selected only material/purity/category/formula, so bands would
     have been silently ignored at the one moment they decide a price. If you add
     a rule column, check that query too.
   - Bounds are inclusive both ends; a product with NO weight does not match a
     banded rule; a null/null pair means "ignore", not "must be zero".
   - **3,077 of 3,078 active products match no rule** — only one rule exists, so
     auto-pricing effectively does nothing today. Data gap, not a code gap.
6. ~~**Phase H — close-out.**~~ **DONE** (`14c713a`). Audit viewer at
   `/admin/audit`, owner-only via `requireOwner()` and deliberately NOT an
   `ADMIN_SECTIONS` key — the log records what every admin did, so it must not be
   a grant a staffer can be given. ADR 0009 (route group + session model) and
   ADR 0010 (taxonomy and statuses as tables).

## Image queue (replaces the inline pipeline)

Product photos are no longer processed inside the save request. `lib/admin/
image-jobs.ts` is a port of the reference's `image-worker.js` + `image-jobs.js`:
enqueue-and-supersede, `SELECT … FOR UPDATE` claim, bounded retries with
backoff, stale-claim reclaim, raw-file cleanup on success. Policy that deserves
testing is in `lib/admin/image-queue.ts` (no `server-only`, 51 checks in
`scripts/check-image-queue.mts` — **not yet wired into `verify`/CI**).

- **There is no daemon.** `drainImageJobs()` is triggered by `after()` on a save,
  by the products list while it shows a Processing row, and by
  `POST /admin/products/image-jobs`. **A cron on that route is a real deploy
  requirement** — without it, a job stranded by a deploy waits until somebody
  opens the admin. See `IMAGE_JOB_DRAIN_TOKEN` in `.env.example`.
- **Migration 0016** adds `claim_token` (closes a finalize race the reference
  has) and `next_attempt_at` (backoff). Next free number: **0017**.
- A failure that can never succeed (unreadable file) is terminal on attempt 1
  rather than after five — `PermanentImageError`. Only transient failures retry.
- Raw originals are deleted only on success, so the list's **Retry photos**
  action has something to work from.

## Still open at cutover

Deferred within B: product editor **multi-card batch add + Excel autofill**
(layers onto the existing product card), and picker **bulk-edit** of a
multi-selection.

**Known open defect (pre-existing, all taxonomy screens).** Every taxonomy table
clips its own actions column below ~760px: the table's intrinsic width (644px on
categories) exceeds the card, and the card is `overflow-hidden`, so Edit/Delete
are unreachable on a phone. The spec's answer is the shared DataTable's
`data-label` mobile-card collapse (plan §Shell & shared primitives), which is not
built yet — fix it there once, not per screen.

**Two admin specs are in the design project but in neither the plan nor this
file:** `Sazuna Admin Coupons.dc.html` and `Sazuna Admin Loyalty.dc.html`. Owner
decision needed on whether they are in scope for cutover.

**Open security advisory (pre-existing).** `npm audit` reports one high-severity
issue: nodemailer ≤9.0.0, where a message-level `raw` option bypasses
`disableFileAccess`/`disableUrlAccess` (GHSA-p6gq-j5cr-w38f). This app sends
order email through nodemailer. The fix is a major bump to 9.0.5+, so it wants
its own change with the order-email checks re-run — not a drive-by upgrade.

## Storefront integration — STILL PENDING (admin changes don't reach the shop yet)

The admin screens are built, but several admin changes do **not yet affect the
customer storefront**. These are real, unbuilt wiring tasks — do them as each
phase lands:

- **Taxonomy visibility + order → filter facets.** `lib/catalog/facets.ts` still
  builds the material/purity filter sidebar from `SELECT DISTINCT p.material /
  p.purity` (free strings), and the category/collection facets don't filter on
  the new `is_visible`. So hiding or reordering a material/purity/category/
  collection in the admin has NO effect on the storefront filters yet. Switch
  facets.ts to read the `materials`/`purities` tables (respecting `is_visible`
  + `sort_order`) and to honour `categories.is_visible` / `collections.is_active`
  + order. (Renames DO propagate — `renameVocab` rewrites the product strings.)
- ~~**Collections membership → collection pages.**~~ **DONE** (`931d837`) — see
  §Resume item 1. `collectionMembership()` in `lib/catalog/products.ts` now
  mirrors `COLLECTION_MATCH`: category rules OR tag rules (both narrowed by the
  price band) OR an unconditional hand-pick.
- **Configurable order statuses → customer timeline** (Phase E). `lib/order-
  lookup.ts` buildTimeline + `/order-status` + `/account/orders/[id]` currently
  map a hardcoded status ladder; they must read `order_statuses` (labels +
  `customer_visible`) once 0013 lands.
- Already fine: **multiple categories per product** is supported storefront-side
  (no change needed).

## Migration numbering (IMPORTANT — renumbered from the plan)

Taxonomy built before orders, so it took the numbers the plan reserved for
orders. Applied: **0010** materials/purities, **0011** tag_groups, **0012**
category/collection enrichment. Therefore **orders → 0013**, **pricing weight-
ranges → 0014** (the plan text still says 0010/0014 — trust THIS file). Next
free migration number: **0013**. Migrations are forward-only, one concern each,
`CREATE TABLE IF NOT EXISTS` / `INSERT IGNORE` where re-runnable; runner is
`scripts/migrate.mjs` (`npm run migrate` / `migrate:status`).

## Conventions & non-negotiables (match these exactly)

- **`npm run verify` must pass before every commit** (tokens → payments →
  emails → orders → auth → admin-auth → blog → images → pricing → typecheck →
  lint → build). Pure boundaries get a `scripts/check-*.mts` with adversarial
  tests, wired into `verify` AND `.github/workflows/ci.yml`.
- **Design tokens, not literals** — but the admin freely uses `[13px]`-style
  arbitrary values per the mocks; the ceremony `--sz-*` scale is guarded by
  `check:tokens` and untouched. Admin-specific values are the `--sz-admin-*`
  block in globals.css.
- **RBAC:** every route handler + Server Action calls `requireSection(key)`
  (deny-by-default). Section keys match the reference for staff_roles compat:
  `products, products_stock, products_picker, products_pricing, categories,
  collections, tags, materials, purities, orders, customers`.
- **Audit in the transaction:** `recordAdminAction(conn, admin, {...})` shares
  the connection of the change it records (`lib/admin/audit.ts`).
- **Money is a string end-to-end** (ADR 0003) → `formatPrice` at the edge.
- **`server-only` split:** a module a `.mts` check script imports must NOT carry
  `import "server-only"` (it throws outside RSC). Keep pure logic in a
  non-server-only module (e.g. `pricing.ts`, `product-projection.ts`).
- **Commits:** Conventional Commits, scope `admin`/`db`/`ui`/`auth`/`design-
  system`; end body with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  Commit straight to `main` (no feature branches — owner preference).
- **Server actions resolve, never reject** — return a discriminated result the
  client renders; log detail server-side, never leak it.
- Security posture on orders/customers is a REBUILD not a port: soft-delete,
  section RBAC on every route, real force-guards, escaped `%`/`_` in search.

## Verification recipe (how each screen was proven)

- Dev server runs on **:3200** (`.claude/launch.json` name `nextsazuna`). Use
  the Browser-pane tools (`mcp__Claude_Browser__*`) — navigate, screenshot,
  `javascript_tool` to drive React.
- **Dev-latency gotcha:** the FIRST Server Action call cold-compiles (several
  seconds), so a UI poll often finishes before the refresh. Confirm mutations
  by reading the **DB + `admin_audit_log`** directly (node + mysql2 snippet
  below), not just the DOM.
- **Live-data discipline (critical):** the admin mutates the REAL nextsazuna DB.
  Every test mutation this session was reversed/cleaned up. Always restore.
- **Temp admin for browser checks:** `verify-admin@sazuna.test` /
  `verify-me-please-123` (owner). Recreate if gone with
  `ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME='Prabin Rai' npm run admin:create`.
- DB access snippet (reads `.env.local`):
  ```
  node -e 'import("mysql2/promise").then(async(m)=>{const fs=await import("node:fs");const e={};for(const l of fs.readFileSync(".env.local","utf8").split("\n")){const x=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(x)e[x[1]]=x[2].trim().replace(/^["\x27]|["\x27]$/g,"")}const c=await m.default.createConnection({host:e.DB_HOST,port:+(e.DB_PORT||3306),user:e.DB_USER,password:e.DB_PASSWORD,database:e.DB_NAME});const[r]=await c.query("SELECT 1");console.log(r);await c.end()})'
  ```
- Reference app (read-only, NEVER run it — its :3000 hits LIVE production):
  `/Users/arjunbansal/sazuna-unik 2`. Read `server/routes/admin-*`,
  `server/services/*` to match behaviour. Its audit
  (`docs/audit-2026-08-04.md`) drives the deliberate security divergences.

## Locked decisions (do NOT re-litigate)

- **Product pricing:** auto base price from the matching rule on **CREATE**;
  **EDIT keeps the existing MRP** (recomputing wiped hand-set markdowns — a
  50%-off piece snapped to full price in testing). MRP only ever raised so sale
  ≤ price. Editor's one price field = `sale_price`.
- **Product `material`:** ONE field (metal type + gold colour together), vocab-
  managed. **Multiple categories** per product (≥1), via the spec's multiselect.
- **Orders:** FULL configurable statuses; edit line items + customer + discount/
  promo + notes/timeline; NO admin invoice/print (dropped); soft-delete only.
- **Taxonomy:** materials/purities as tables; category desc/image/order; tag
  groups + merge; collection rules + manual picks + price band.
- **Login:** no 2FA, no forgot-password (password via `admin:create`).
- **Deviation flagged:** category is the spec's own multiselect popover (multi-
  category requirement), not the mock's single dropdown.

## Owner open items (not blockers, flag at cutover)

Rotate the SSH + DB passwords (in an earlier transcript). Set
`PRODUCT_IMAGE_UPLOAD_DIR` → Hostinger `sazuna-storage` + a LiteSpeed
`/uploads/*` alias. `AAKASH_SMS_TOKEN` + SMTP unset → order notify SMS/email
will "skip". `/privacy` still describes Meta Pixel/CAPI the app doesn't do —
resolve at cutover. Confirm the dashboard is wanted as `/admin` landing.
2,575 product images still on silveejewels.com (external → share/download in the
picker CORS-fail until moved to controlled storage).

## File map

```
app/(admin)/admin/
  login/                     unguarded sign-in (spec login)
  _actions.ts                adminSignIn / adminSignOut / signedInLanding
  (authed)/                  layout = requireAdmin + AdminShell (+ ToastProvider)
    page.tsx                 dashboard
    products/                list · new · [id]/edit · upload/route.ts · picker sibling
    product-picker/
    categories/ collections/ tags/ materials/ purities/
lib/admin/
  session.ts require.ts rbac.ts login-rules.ts   auth
  audit.ts                   recordAdminAction (in-txn)
  catalog.ts                 admin product reads/writes (draft-visible)
  product-projection.ts product-detail.ts product-write.ts   editor
  images.ts image-jobs.ts    sharp pipeline + inline job flow
  pricing.ts                 sandboxed formula evaluator + matcher
  taxonomy.ts                vocab/categories/collections/tags data layer
  nav.ts                     sidebar model + section↔route
  dashboard.ts
components/admin/            AdminShell, Chip, ProductThumb, ConfirmDialog,
                             Switch, MultiSelect, taxonomy/{TaxonomyTabs,VocabScreen}
scripts/check-{admin-auth,image-pipeline,pricing}.mts  + create-admin.mts
db/migrations/0008..0012     admin + taxonomy
```

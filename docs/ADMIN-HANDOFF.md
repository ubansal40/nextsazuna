# Admin rebuild — session handoff (Stage 4)

**Purpose.** Resume the admin build in a fresh session with zero loss. Read this
top-to-bottom, then continue from **§Resume here**. Everything below is fact as
of the last commit (`1e4d317`, taxonomy complete).

## TL;DR resume

The admin is being rebuilt in Next to the **Claude Design specs** (project
`deea797d-e4b5-409c-b32f-f5f926846bb6`, read via the DesignSync tool). Owner
chose **full design fidelity** — build the mocks completely, new backend
included. Full architecture + decisions + sequence live in the plan file:
`~/.claude/plans/twinkling-prancing-babbage.md`. **Read the plan and this file,
then continue with Phase D → E → F → G → H.**

Design source of truth per screen: fetch the page's `.dc.html` via
`DesignSync get_file` (projectId above) **before building it**, strip
`<style>/<script>/<svg>` to read structure, and match it. Specs seen so far:
`Sazuna Admin.dc.html` (shell + all shared patterns), `…Products`, `…Product
Picker`, `…Taxonomy`. Still to read: `Sazuna Admin Orders.dc.html`,
`Sazuna Admin Stock Management.dc.html`, `Sazuna Admin Pricing Rules.dc.html`.

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
3. **Phase E — orders (the big one).** New migration **0013**: `order_statuses`
   (system + custom, colour, customer-timeline visibility, order, default),
   `orders.deleted_at` (soft delete), `order_activity` feed; migrate
   `orders.status` ENUM → VARCHAR referencing `order_statuses`. Configurable
   status system + "Manage statuses" drawer; orders list (tabs, inline + bulk
   status, escaped search); order **detail editing** (line items, customer &
   delivery, discount + promo, notes/activity, notify SMS/WhatsApp/Email). Soft
   delete only, per-section RBAC on **every** route, audit-in-transaction.
   **Wire the storefront timeline** (`lib/order-lookup.ts` buildTimeline +
   `/order-status` + `/account/orders/[id]`) to read `order_statuses` labels +
   `customer_visible`. Gate `orders`.
4. **Phase F — customers CRM** (no design spec — shared data-table + profile
   drawer; reference `admin-customers.js`). Columns Name/Phone(mono)/Email/
   Orders/Lifetime spend/Joined; profile = contact, address, dob/anniversary,
   sizes, loyalty ledger (read-only), notes, order history. `phone` immutable,
   escape LIKE, gate `customers`.
5. **Phase G — pricing-rules UI.** New migration **0014**: pricing_rules weight-
   range columns. List (priority order, drag-reorder, condition chips, active
   toggle, catch-all, unpriced-products nudge) + rule editor drawer (name,
   priority, active, material/purity/category conditions, weight ranges, formula
   with live validity via `formulaError`, Test-this-rule by SKU / manual). The
   evaluator `lib/admin/pricing.ts` already exists. Authoring-time only. Gate
   `products_pricing`.
6. **Phase H — close-out.** Basic audit-log viewer; ADRs (route-group split,
   admin session model, configurable statuses, taxonomy-as-tables); docs.

Also deferred within B: product editor **multi-card batch add + Excel autofill**
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

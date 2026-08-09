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

1. **Shared taxonomy image upload (small follow-up).** The 1:1 image for
   categories + collections, and collections' hand-picked manual products
   (`collection_products` table already exists). Add a taxonomy image route +
   `storeSquareImage` (sharp resize cover, no stamp) in `lib/admin/images.ts`;
   wire the `image_url` fields already in the data layer.
2. **Phase D — stock management.** `Sazuna Admin Stock Management.dc.html`.
   Excel/CSV upload → **dry-run** (returns publish/draft/exempt/unmatched counts
   + the unmatched-SKU list for CSV, changing nothing) → **Apply** (the
   reference's atomic `is_active` CASE update, `always_available` exempt). Needs
   an xlsx parser (add a dep) + an upload route. Gate `products_stock`.
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
- **Collections membership → collection pages.** The admin now stores collection
  rules (category/tag) + a sale-price band + (deferred) manual picks. Whatever
  the storefront uses to render a collection page must read this membership
  (`COLLECTION_MATCH` in `lib/admin/taxonomy.ts` is the canonical rule; manual
  picks live in `collection_products`).
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

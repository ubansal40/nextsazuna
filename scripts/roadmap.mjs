/**
 * The roadmap — single source of truth for GitHub milestones and issues.
 *
 * See docs/adr/0008-phases-tracked-as-github-issues.md.
 *
 * Edit this file, then run:
 *   npm run roadmap          # show what would change
 *   npm run roadmap:apply    # apply it
 *
 * Rules this file follows, deliberately:
 *
 *  - A phase is independently shippable. If a phase cannot be deployed on its
 *    own, it is two phases.
 *  - An issue is one commit's worth of work, with acceptance criteria a person
 *    other than the author could check.
 *  - Only the current and next phase carry detailed issues. Later phases carry
 *    a milestone and one epic; they are expanded when they are reached, because
 *    tickets written months early are rewritten before they are worked.
 *  - `done: true` seeds an issue as already closed, so a completed phase reads
 *    100% instead of empty. It records history; it does not claim new work.
 */

export const labels = [
  { name: "phase:0-foundation", color: "5B1A1E", description: "Design system, data layer, migrations" },
  { name: "phase:1-catalog", color: "7A2226", description: "Listing and product pages" },
  { name: "phase:2-shell", color: "86332D", description: "Header, footer, global navigation" },
  { name: "phase:3-homepage", color: "9B4A3E", description: "Homepage and all-products index" },
  { name: "phase:4-purchase", color: "B4685F", description: "Cart, checkout, payments" },
  { name: "phase:5-content", color: "C9A15A", description: "Policy, support and order-status pages" },
  { name: "phase:6-accounts", color: "B7893F", description: "Authentication and customer accounts" },
  { name: "phase:7-admin", color: "6E6559", description: "Back office" },
  { name: "phase:8-launch", color: "3F7B3F", description: "Launch readiness and cutover" },

  { name: "type:feature", color: "0E8A16", description: "New customer-facing capability" },
  { name: "type:fix", color: "D93F0B", description: "Something is wrong" },
  { name: "type:chore", color: "BFDADC", description: "Tooling, deps, housekeeping" },
  { name: "type:epic", color: "5319E7", description: "A phase placeholder, to be broken down" },

  { name: "needs:owner", color: "FBCA04", description: "Blocked on a decision or asset from the owner" },
  { name: "needs:credentials", color: "E99695", description: "Blocked on access we do not have" },
  { name: "security", color: "B60205", description: "Touches money, auth or credentials" },
  { name: "blocked", color: "000000", description: "Cannot start yet" },
];

/**
 * `spec` names the Claude Design file an issue implements, so an agent picking
 * it up cold knows where the source of truth is.
 */
export const phases = [
  {
    id: 0,
    title: "Phase 0 · Foundation",
    description:
      "Ceremony design system, token parity checker, mysql2 data layer, migration runner and the production data copy.",
    state: "closed",
    issues: [
      {
        id: "p0-design-system",
        title: "Ceremony design system and token parity checker",
        done: true,
        labels: ["phase:0-foundation", "type:feature"],
        body:
          "Transcribe the spec's token file into `app/globals.css`, bridge it into Tailwind, and add `npm run check:tokens` so the app cannot drift into a second design system.",
        acceptance: ["99 spec tokens match", "check:tokens runs in CI", "/design gallery renders every primitive"],
      },
      {
        id: "p0-data-layer",
        title: "mysql2 data layer and migration runner",
        done: true,
        labels: ["phase:0-foundation", "type:feature"],
        body: "Raw mysql2 via `lib/db.ts`, server-only. Forward-only migrations in `db/migrations`, applied by `npm run migrate`.",
        acceptance: ["Money returned as strings, never floats", "`npm run migrate:status` reports cleanly"],
      },
    ],
  },

  {
    id: 1,
    title: "Phase 1 · Catalog",
    description: "The pages that sell: listing and product detail.",
    state: "closed",
    issues: [
      {
        id: "p1-plp",
        title: "Product listing page",
        done: true,
        spec: "Sazuna Product Listing.dc.html",
        labels: ["phase:1-catalog", "type:feature"],
        body: "Filter rail, sticky toolbar, mobile bottom sheets, infinite scroll, category subheadings from `category_intros`.",
        acceptance: ["Filters are links, shareable and work without JS", "Canonical `/jewellery/{slug}.html` preserved"],
      },
      {
        id: "p1-pdp",
        title: "Product detail page",
        done: true,
        spec: "Sazuna Product Detail PDP.dc.html",
        labels: ["phase:1-catalog", "type:feature"],
        body: "Gallery, buy area, trust modal, specifications, accordions, related products, JSON-LD and OG product tags.",
        acceptance: ["Notify-Me writes to `notify_requests`", "Structured data matches the visible price"],
      },
    ],
  },

  {
    id: 2,
    title: "Phase 2 · Shared shell",
    description: "The header and footer every page mounts, built once.",
    state: "closed",
    issues: [
      {
        id: "p2-header",
        title: "Global header",
        done: true,
        spec: "SazunaHeader.dc.html",
        labels: ["phase:2-shell", "type:feature"],
        body: "Announcement bar from `announcement_bar`, mega-menu, search overlay, account panel, mini-cart, mobile drawer.",
        acceptance: ["Nav hrefs resolve to real categories", "No horizontal overflow at 375px"],
      },
      {
        id: "p2-footer",
        title: "Global footer",
        done: true,
        spec: "SazunaFooter.dc.html",
        labels: ["phase:2-shell", "type:feature"],
        body: "Dark ink footer; contact, socials and payment marks read from content blocks.",
        acceptance: ["No hardcoded social URLs", "Payment marks never expose gateway credentials"],
      },
    ],
  },

  {
    id: 3,
    title: "Phase 3 · Homepage",
    description: "The entry point, composed from an editable block layout.",
    state: "closed",
    issues: [
      {
        id: "p3-homepage",
        title: "Block-driven homepage",
        done: true,
        spec: "Sazuna Homepage.dc.html",
        labels: ["phase:3-homepage", "type:feature"],
        body: "Eight sections rendered from `homepage_layout`, so order, copy and visibility are an admin edit.",
        acceptance: ["Unknown block types are skipped, not fatal", "revalidate keeps content fresh without a redeploy"],
      },
      {
        id: "p3-all-products",
        title: "All-products index at /jewellery",
        done: true,
        labels: ["phase:3-homepage", "type:feature"],
        body: "An unscoped listing so the homepage's View all links and hero CTAs have somewhere real to land.",
        acceptance: ["Filters and sort work as on a category page"],
      },
    ],
  },

  {
    id: 4,
    title: "Phase 4 · Purchase path",
    description:
      "Bag, checkout and order placement. Shipped, but the gateways have not completed a payment yet.",
    issues: [
      {
        id: "p4-cart",
        title: "Bag with server-side pricing",
        done: true,
        spec: "Sazuna Cart.dc.html",
        labels: ["phase:4-purchase", "type:feature", "security"],
        body: "localStorage holds ids and quantities only; every amount is derived server-side. Promo codes validate against `coupons`.",
        acceptance: ["No price can be supplied by the client", "Totals summed in integer paisa"],
      },
      {
        id: "p4-checkout",
        title: "Checkout and order placement",
        done: true,
        spec: "Sazuna Checkout.dc.html",
        labels: ["phase:4-purchase", "type:feature", "security"],
        body: "Delivery form, payment selection from `payment_methods`, transactional `orders` + `order_items`, confirmation page.",
        acceptance: ["COD creates a correct order", "Gateway orders start `pending_payment`"],
      },
      {
        id: "p4-gateway-sandbox",
        title: "Complete a sandbox payment through eSewa and CyberSource",
        labels: ["phase:4-purchase", "type:chore", "needs:credentials", "security"],
        body:
          "The integrations are written and eSewa's sandbox accepts our signed request, but no payment has been completed end to end. " +
          "Needs sandbox accounts for both gateways.\n\n" +
          "Verify: a paid order settles to `paid`/`placed`; a cancelled one settles to `failed`/`payment_failed`; a replayed success URL does not double-settle.",
        acceptance: [
          "One successful sandbox payment per gateway, settled correctly",
          "One cancelled payment per gateway, settled correctly",
          "A tampered return is rejected",
        ],
      },
      {
        id: "p4-credentials-to-env",
        title: "Move gateway credentials out of the content block into env",
        labels: ["phase:4-purchase", "type:chore", "security"],
        body:
          "`payment_methods` stores live CyberSource and Khalti secret keys beside the display labels. Any admin with content access can read them, and they sit in every database backup.\n\n" +
          "`lib/payments/config.ts` already prefers env vars, so this is a data move plus removing the credentials from the block.",
        acceptance: [
          "No secret remains in `content_blocks`",
          "Gateways still sign correctly from env",
          "`.env.example` documents every key",
        ],
      },
      {
        id: "p4-khalti",
        title: "Khalti payment handler",
        labels: ["phase:4-purchase", "type:feature", "needs:owner"],
        body:
          "Khalti is configured but disabled, so checkout does not offer it. Implement the handler and callback if the owner wants it live.",
        acceptance: ["Appears at checkout only when enabled in the block", "Verified callback settles the order"],
      },
    ],
  },

  {
    id: 5,
    title: "Phase 5 · Content and support pages",
    description:
      "The pages the footer already links to. Seven of them 404 today, which is visible to every visitor.",
    issues: [
      {
        id: "p5-policy-pages",
        title: "Policy pages: shipping, exchange & resale, payment options, privacy, terms, account deletion",
        spec: "Sazuna Policy.dc.html",
        labels: ["phase:5-content", "type:feature"],
        body:
          "Six routes the footer's Help column already points at. One shared policy layout; copy from a content block so it is editable.\n\n" +
          "Currently 404: `/shipping`, `/exchange-resale`, `/payment-options`, `/privacy`, `/terms`, `/account-deletion`.",
        acceptance: ["No footer link 404s", "Copy is editable without a deploy", "Each page has its own title and canonical"],
      },
      {
        id: "p5-order-status",
        title: "Order status and tracking page",
        spec: "Sazuna Order Status.dc.html",
        labels: ["phase:5-content", "type:feature"],
        body:
          "`/order-status` — look up an order by number plus the phone it was placed with. The footer links to it and checkout's confirmation should too.",
        acceptance: [
          "An order number alone is not enough to view an order",
          "Shows payment and fulfilment state",
          "Unknown orders give the same response as wrong details",
        ],
      },
      {
        id: "p5-category-copy",
        title: "Category intro copy for the remaining 14 categories",
        labels: ["phase:5-content", "type:chore", "needs:owner"],
        body:
          "The mechanism is live via the `category_intros` block; only `diamond-rings` is written. Inventing brand voice for fourteen categories is the owner's call, not ours.",
        acceptance: ["Every category listing has a subheading, or is deliberately left without one"],
      },
    ],
  },

  {
    id: 6,
    title: "Phase 6 · Accounts",
    description: "Authentication and the customer's own view of their orders.",
    issues: [
      {
        id: "p6-otp-auth",
        title: "One-time-code authentication",
        labels: ["phase:6-accounts", "type:feature", "security", "needs:owner"],
        body:
          "The header's sign-in panel is built and takes `onRequestCode` / `onSubmitCode` props with no backend behind them. " +
          "`customer_otp` and `customers` already exist.\n\nNeeds a decision on the SMS provider.",
        acceptance: [
          "Codes expire and are single-use",
          "Attempts are rate limited per number",
          "Session is httpOnly and not readable from JS",
        ],
      },
      {
        id: "p6-account-pages",
        title: "Account pages: profile, orders, loyalty",
        spec: "Sazuna Account.dc.html",
        labels: ["phase:6-accounts", "type:feature"],
        body: "The signed-in surfaces the header menu already links to. Order history reads the customer's own `orders` only.",
        acceptance: ["A signed-in customer sees only their own orders", "Loyalty balance matches `loyalty_ledger`"],
      },
    ],
  },

  {
    id: 7,
    title: "Phase 7 · Admin",
    description: "The back office. Roughly 37 screens; broken down when the phase starts.",
    issues: [
      {
        id: "p7-epic",
        title: "Epic: rebuild the admin",
        labels: ["phase:7-admin", "type:epic"],
        body:
          "Products, orders, taxonomy, coupons, pricing rules, loyalty, stock and the product picker.\n\n" +
          "Not broken into issues yet, deliberately — see ADR 0008. Expand when Phase 6 closes.\n\n" +
          "Note: a previous admin visual pass was reverted wholesale. Confirm scope with the owner before restyling anything.",
        acceptance: ["Broken into per-screen issues before any code is written"],
      },
    ],
  },

  {
    id: 8,
    title: "Phase 8 · Launch readiness",
    description: "Everything between a working storefront and one that can take the domain.",
    issues: [
      {
        id: "p8-images",
        title: "Move product images off silveejewels.com",
        labels: ["phase:8-launch", "type:chore", "needs:owner"],
        body:
          "2,575 of 2,577 active products load their images from a separate site. The storefront's imagery currently depends on infrastructure this project does not control.\n\n" +
          "A further 502 active products have no image at all.",
        acceptance: ["Images served from storage this project controls", "No `/uploads/...` paths remain"],
      },
      {
        id: "p8-homepage-imagery",
        title: "Homepage imagery",
        labels: ["phase:8-launch", "type:chore", "needs:owner"],
        body:
          "Every `image` field in `homepage_layout` is empty — hero slides, category tiles, collection cards, the featured banner — so the page renders on placeholder gradients and light-on-light eyebrow text reads poorly.",
        acceptance: ["Every homepage slot has real photography", "Hero copy meets contrast on the real images"],
      },
      {
        id: "p8-search",
        title: "Decide and implement search ranking",
        labels: ["phase:8-launch", "type:feature", "needs:owner"],
        body:
          "`/search/{term}` is a name-or-SKU LIKE today. Relevance, synonyms and typo tolerance are unaddressed.",
        acceptance: ["Ranking approach agreed with the owner", "Results are relevant for the top queries"],
      },
      {
        id: "p8-seo",
        title: "Sitemap, robots and canonical audit",
        labels: ["phase:8-launch", "type:feature"],
        body: "The catalog's URLs are already indexed and must be preserved (ADR 0007). Ship a sitemap, a robots policy, and audit canonicals across every surface.",
        acceptance: ["Sitemap covers every indexable URL", "No indexable page is missing a canonical"],
      },
      {
        id: "p8-audit",
        title: "Performance and accessibility audit",
        labels: ["phase:8-launch", "type:chore"],
        body: "Core Web Vitals on the catalog and checkout, keyboard and screen-reader passes on the purchase path.",
        acceptance: ["Purchase path completable by keyboard alone", "No critical axe violations"],
      },
      {
        id: "p8-cutover",
        title: "Cutover from the Express storefront",
        labels: ["phase:8-launch", "type:chore", "needs:owner", "blocked"],
        body:
          "`new.sazunajewellers.com` runs the Express app and stays live until this replaces it. Needs a rollback plan and a decision on when.",
        acceptance: ["Rollback rehearsed", "Redirects preserve every indexed URL", "Owner has signed off"],
      },
    ],
  },
];

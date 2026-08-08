/**
 * Conventional Commits, with scopes that match this repo's structure.
 * Enforced in CI on every pull request.
 *
 *   feat(ui): add quantity stepper
 *   fix(shell): reopen mini-cart after a native dialog close
 *   chore(deps): bump next to 16.3.1
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "design-system", // tokens, the spec fixture, the parity checker
        "ui", // components/ui primitives
        "shell", // header, footer, nav, mini-cart
        "storefront", // customer-facing pages, where no page scope fits
        // Page scopes. Commits are named after the surface in practice, and
        // "storefront" for every page made the log unreadable.
        "home",
        "plp",
        "pdp",
        "cart",
        "account",
        "search",
        "content", // policy and support pages, content blocks
        "payments", // gateways, signing, settlement
        "orders",
        "admin", // admin pages
        "api", // route handlers and server actions
        "db", // schema, migrations, queries
        "auth",
        "checkout",
        "seo",
        "ci",
        "deps",
        "docs",
        "config",
      ],
    ],
    "body-max-line-length": [1, "always", 100],
  },
};

export default config;

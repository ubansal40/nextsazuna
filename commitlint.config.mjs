/**
 * Conventional Commits, with scopes that match this repo's structure.
 *
 * Enforced on pushes to main as well as pull requests. This repo commits
 * directly to main, so a PR-only check never actually ran — and the commit
 * message is load-bearing now that it is what closes issues (ADR 0008).
 *
 *   feat(ui): add quantity stepper
 *   fix(shell): reopen mini-cart after a native dialog close
 *   chore(deps): bump next to 16.3.1
 *
 * Finishing an issue? Put `Closes #12` in the footer. GitHub does the rest.
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
        // Page scopes. The repo names commits after the surface in practice,
        // and "storefront" for everything made the log unreadable.
        "home",
        "plp",
        "pdp",
        "cart",
        "checkout",
        "account",
        "search",
        "content", // policy and support pages, content blocks
        "admin", // admin pages
        "api", // route handlers and server actions
        "db", // schema, migrations, queries
        "auth",
        "payments", // gateways, signing, settlement
        "orders",
        "seo",
        "ci",
        "deps",
        "docs",
        "config",
      ],
    ],
    "body-max-line-length": [1, "always", 100],
    // A warning, not an error: chores and docs legitimately have no issue.
    "references-empty": [1, "never"],
  },
};

export default config;

/**
 * Admin role-based access — the parts with no database in them.
 *
 * Split from the session code the same way lib/auth/otp-rules.ts is split from
 * lib/auth/session.ts: this is an authorization boundary, and the rules that
 * decide who may touch what are kept pure so scripts/check-admin-auth.mts can
 * assert them directly, without dragging `server-only` into a check script.
 *
 * The model is the reference admin's, which is sound: an account whose
 * `role_id` is NULL is the OWNER and bypasses every check; any other account is
 * staff, and its permissions are the `allowed_sections` JSON array on its
 * `staff_roles` row. What the reference gets wrong — and this does not — is two
 * things its own audit names:
 *
 *   1. It declares sections (`content`, `coupons`, `payments`, `facebook_pixel`,
 *      `blog`, `loyalty`) that no route actually enforces, and points `loyalty`
 *      at a file that does not exist. A grant that gates nothing is worse than
 *      no grant: it reads as protection that is not there. So the catalogue
 *      below lists ONLY sections this rebuild really enforces, and the check
 *      script fails the build if a section has no route or a route no section.
 *
 *   2. Its permission gate is optional — `rbac ? [requireAdmin, gate] : [...]` —
 *      so dropping one dependency silently degrades a route to
 *      authenticated-anyone. Here `authorizeSection` is the only door and it is
 *      deny-by-default: unknown section, unknown grant, malformed data all
 *      resolve to "no".
 */

export interface AdminSection {
  /** Stored verbatim in `staff_roles.allowed_sections`. Never renamed lightly —
   *  a rename orphans every grant that used the old key. */
  readonly key: string;
  readonly label: string;
  /** The section's home route. One canonical path per section; the check script
   *  asserts these are unique so two sections can never claim one page. */
  readonly path: string;
}

/**
 * Every enforced admin section, in sidebar order. Keys match the reference's
 * where one exists (`products_stock`, `products_picker`, `products_pricing`) so
 * a staff_roles row written by the old admin keeps meaning the same thing.
 *
 * `materials` and `purities` are new leaves: the reference edited those as
 * free-text content blocks with no gate at all. They are grantable here because
 * this rebuild gives them real screens.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: "orders", label: "Orders", path: "/admin/orders" },
  { key: "customers", label: "Customers", path: "/admin/customers" },
  { key: "products", label: "All products", path: "/admin/products" },
  { key: "products_stock", label: "Stock management", path: "/admin/stock" },
  { key: "products_picker", label: "Product picker", path: "/admin/product-picker" },
  { key: "products_pricing", label: "Pricing rules", path: "/admin/pricing-rules" },
  { key: "categories", label: "Categories", path: "/admin/categories" },
  { key: "collections", label: "Collections", path: "/admin/collections" },
  { key: "tags", label: "Tags", path: "/admin/tags" },
  { key: "materials", label: "Materials", path: "/admin/materials" },
  { key: "purities", label: "Purities", path: "/admin/purities" },
] as const;

/** Fast membership set for validation and gating. */
export const SECTION_KEYS: ReadonlySet<string> = new Set(ADMIN_SECTIONS.map((s) => s.key));

/** Where an admin lands after signing in when no specific page was requested. */
export const ADMIN_HOME = "/admin";

/**
 * The sections a role may touch, read from a raw `allowed_sections` value.
 *
 * Fails closed, exactly as the reference's `parseSections` does and for the same
 * reason: an unknown key, a non-array, or malformed JSON all yield the empty set
 * rather than throwing or — far worse — being treated as "allow". A corrupted
 * grant must lock a staffer out, never let them in.
 */
export function parseSections(raw: unknown): Set<string> {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) {
      return new Set(arr.filter((k): k is string => typeof k === "string" && SECTION_KEYS.has(k)));
    }
  } catch {
    /* malformed JSON — treat as no sections */
  }
  return new Set();
}

/**
 * The permission context the app carries for a signed-in admin. Deliberately the
 * buffer-safe shape — no password hash, no lockout counters, nothing a client
 * component should never see. `publicAdmin` below is the only way to build it
 * from a database row, so a secret cannot leak by forgetting to strip a column.
 */
export interface AdminContext {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  /** role_id IS NULL — full access, every section, bypasses `authorizeSection`. */
  readonly isOwner: boolean;
  /** Granted section keys. Empty for the owner (who does not consult it). */
  readonly sections: readonly string[];
}

/** The database shape `publicAdmin` accepts. A superset is fine; extra keys are
 *  dropped, which is the point. */
export interface AdminRowLike {
  id: number;
  email: string;
  name?: string | null;
  role_id?: number | null;
  allowed_sections?: unknown;
  [extra: string]: unknown;
}

/**
 * Project a joined admin/role row into the safe context.
 *
 * This is the admin twin of `publicCustomer`: an allowlist, not a blocklist.
 * It names the four fields the app may carry and copies only those, so
 * `password_hash`, `failed_attempts`, `locked_until` — and any gateway secret
 * that ever gets joined in by accident — cannot ride along.
 */
export function publicAdmin(row: AdminRowLike): AdminContext {
  const isOwner = row.role_id == null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    isOwner,
    sections: isOwner ? [] : [...parseSections(row.allowed_sections)],
  };
}

/**
 * May this admin touch this section? The single, mandatory gate.
 *
 * Owner bypasses. Everyone else must hold the exact key — an unknown section
 * name returns false, so a typo in a `requireSection("prodcuts")` call fails the
 * staffer shut rather than open.
 */
export function authorizeSection(ctx: Pick<AdminContext, "isOwner" | "sections">, section: string): boolean {
  if (ctx.isOwner) return true;
  return ctx.sections.includes(section);
}

/**
 * Where to send an admin after sign-in: the first section they can actually
 * reach. The owner gets the admin home; a staffer gets their first granted
 * section so they do not land on a page that would immediately 403.
 */
export function landingPath(ctx: Pick<AdminContext, "isOwner" | "sections">): string {
  if (ctx.isOwner) return ADMIN_HOME;
  const first = ADMIN_SECTIONS.find((s) => ctx.sections.includes(s.key));
  return first ? first.path : ADMIN_HOME;
}

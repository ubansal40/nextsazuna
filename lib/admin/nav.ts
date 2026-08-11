import type { IconName } from "@/components/ui";
import { authorizeSection, type AdminContext } from "./rbac";

/**
 * The admin sidebar model — Sazuna Admin.dc.html §Shell.
 *
 * Pure and data-only so both the server layout (which gates it) and the client
 * shell (which draws it) share one definition. `section` is the RBAC key that
 * guards the item, or `null` for an item everyone with admin access may see
 * (Dashboard, View storefront). Only in-scope sections appear — the mock's
 * Marketing / Content / Staff / System groups are deliberately absent until
 * their pages exist, because a nav link to a 404 is worse than no link.
 */

export interface AdminNavItem {
  /** RBAC section key, or null for an always-visible entry. */
  section: string | null;
  label: string;
  href: string;
  icon: IconName;
  /** Owner-only, and deliberately not an RBAC section: the audit log records
   *  what every admin did, so it must not be a grant a staffer can be given. */
  ownerOnly?: boolean;
}

/** A collapsible sub-tree in the sidebar (the spec's Products / Taxonomy). */
export interface AdminNavAccordion {
  label: string;
  icon: IconName;
  items: AdminNavItem[];
}

/** A gold-labelled section of the sidebar. Holds either accordions or bare
 *  items (the spec's Catalog uses accordions; Orders uses bare items). */
export interface AdminNavGroup {
  label: string;
  accordions?: AdminNavAccordion[];
  items?: AdminNavItem[];
}

export const ADMIN_NAV = {
  dashboard: { section: null, label: "Dashboard", href: "/admin", icon: "layout" } satisfies AdminNavItem,
  groups: [
    {
      label: "Catalog",
      accordions: [
        {
          label: "Products",
          icon: "bag",
          items: [
            { section: "products", label: "All Products", href: "/admin/products", icon: "list" },
            { section: "products_stock", label: "Stock", href: "/admin/stock", icon: "box" },
            { section: "products_picker", label: "Product Picker", href: "/admin/product-picker", icon: "check-square" },
            { section: "products_pricing", label: "Pricing Rules", href: "/admin/pricing-rules", icon: "pricetag" },
          ],
        },
        {
          label: "Taxonomy",
          icon: "layers",
          items: [
            { section: "categories", label: "Categories", href: "/admin/categories", icon: "grid" },
            { section: "collections", label: "Collections", href: "/admin/collections", icon: "layers" },
            { section: "tags", label: "Tags", href: "/admin/tags", icon: "tag" },
            { section: "materials", label: "Materials", href: "/admin/materials", icon: "circles" },
            { section: "purities", label: "Purities", href: "/admin/purities", icon: "gem" },
          ],
        },
      ],
    },
    {
      label: "Orders",
      items: [
        { section: "orders", label: "Orders", href: "/admin/orders", icon: "order-bag" },
        { section: "customers", label: "Customers", href: "/admin/customers", icon: "users" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { section: "coupons", label: "Coupons", href: "/admin/coupons", icon: "pricetag" },
      ],
    },
    {
      label: "Content",
      items: [
        { section: "content", label: "Homepage", href: "/admin/content", icon: "layout" },
      ],
    },
    {
      label: "System",
      items: [
        { section: null, ownerOnly: true, label: "Audit log", href: "/admin/audit", icon: "shield" },
      ],
    },
  ] satisfies AdminNavGroup[],
  storefront: { section: null, label: "View storefront", href: "/", icon: "exit" } satisfies AdminNavItem,
};

/** Can this admin see this item? Null section = always. */
function canSee(admin: Pick<AdminContext, "isOwner" | "sections">, item: AdminNavItem): boolean {
  if (item.ownerOnly) return admin.isOwner;
  return item.section === null || authorizeSection(admin, item.section);
}

/**
 * The nav filtered to what this admin may reach, with empty accordions and
 * groups pruned — computed on the server and handed to the client shell, so the
 * sidebar never renders a door the viewer cannot open.
 */
export function visibleNav(admin: Pick<AdminContext, "isOwner" | "sections">) {
  const groups = ADMIN_NAV.groups
    .map((group) => ({
      label: group.label,
      accordions: (group.accordions ?? [])
        .map((acc) => ({ ...acc, items: acc.items.filter((i) => canSee(admin, i)) }))
        .filter((acc) => acc.items.length > 0),
      items: (group.items ?? []).filter((i) => canSee(admin, i)),
    }))
    .filter((group) => group.accordions.length > 0 || group.items.length > 0);

  return { dashboard: ADMIN_NAV.dashboard, groups, storefront: ADMIN_NAV.storefront };
}

export type VisibleNav = ReturnType<typeof visibleNav>;

/** Title for the topbar + document, resolved from the current pathname. Falls
 *  back to "Admin" so a not-yet-mapped route still names itself sanely. */
export function sectionTitle(pathname: string): string {
  if (pathname === "/admin") return "Dashboard";
  for (const group of ADMIN_NAV.groups) {
    for (const item of group.items ?? []) if (pathname.startsWith(item.href)) return item.label;
    for (const acc of group.accordions ?? [])
      for (const item of acc.items) if (pathname.startsWith(item.href)) return item.label;
  }
  return "Admin";
}

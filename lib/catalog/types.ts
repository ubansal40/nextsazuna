import type { RowDataPacket } from "mysql2";

/**
 * Catalog domain types.
 *
 * Money fields are `string`, deliberately — that is what the driver returns for
 * DECIMAL and what must reach the formatter unparsed (ADR 0003). If you find
 * yourself typing one of these as `number`, that is the bug.
 */

/** What a slug at /jewellery/{slug}.html resolved to. */
export type SlugKind = "category" | "tag" | "collection" | "product";

export interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  gross_weight: string | null;
  net_weight: string | null;
  diamond_weight: string | null;
  stone_weight: string | null;
  stone_type: string | null;
  material: string | null;
  purity: string | null;
  /** MRP. Shown struck through when a sale price undercuts it. */
  price: string;
  /** Selling price when present. Resolved by EFFECTIVE_PRICE in SQL. */
  sale_price: string | null;
  stock: number | null;
  is_active: 0 | 1;
  always_available: 0 | 1;
  publish_date: Date | null;
}

export interface TaxonRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
}

/**
 * Categories carry no description column — the taxonomy tables are deliberately
 * thin (id, name, slug, parent_id). Any editorial copy for a listing page lives
 * in `content_blocks`, not here.
 */
export interface CategoryRow extends TaxonRow {
  parent_id: number | null;
}

/** Scalar result shapes. mysql2 requires every row type to extend RowDataPacket. */
export interface CountRow extends RowDataPacket {
  total: number;
}

export interface SlugRow extends RowDataPacket {
  slug: string;
}

/** A product as the UI consumes it: prices resolved, stock decided. */
export interface ProductSummary {
  id: number;
  name: string;
  slug: string;
  href: string;
  sku: string | null;
  /** The price a customer pays. */
  price: string;
  /** MRP, present only when it genuinely exceeds the selling price. */
  compareAtPrice: string | null;
  imageUrl: string | null;
  inStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  material: string | null;
  purity: string | null;
  stoneType: string | null;
  grossWeight: string | null;
  netWeight: string | null;
  diamondWeight: string | null;
  stoneWeight: string | null;
  categories: { name: string; slug: string; href: string }[];
  tags: { name: string; slug: string; href: string }[];
}

export interface ProductListing {
  products: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type SortKey =
  | "popularity"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "bestselling";

export interface ListingQuery {
  /** The taxonomy the page itself represents — always applied. */
  categorySlug?: string;
  tagSlugs?: string[];
  collectionIds?: number[];
  search?: string;
  /** Sidebar selections. Multiple values within a group are OR'd. */
  categorySlugs?: string[];
  collectionSlugs?: string[];
  material?: string[];
  purity?: string[];
  priceBrackets?: { min: number; max: number | null }[];
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

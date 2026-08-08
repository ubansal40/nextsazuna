import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "../db";

/**
 * A single product, every editable field, for the editor. Sees drafts. Money and
 * weights stay strings the whole way — never a float round-trip (ADR 0003).
 */

export interface AdminProductDetail {
  id: number;
  name: string;
  slug: string;
  sku: string;
  description: string;
  material: string;
  purity: string;
  stoneType: string;
  price: string;
  salePrice: string;
  grossWeight: string;
  netWeight: string;
  diamondWeight: string;
  stoneWeight: string;
  isActive: boolean;
  alwaysAvailable: boolean;
  categoryIds: number[];
  tagIds: number[];
  imageUrls: string[];
}

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  material: string | null;
  purity: string | null;
  stone_type: string | null;
  price: string;
  sale_price: string | null;
  gross_weight: string | null;
  net_weight: string | null;
  diamond_weight: string | null;
  stone_weight: string | null;
  is_active: number;
  always_available: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}
interface UrlRow extends RowDataPacket {
  image_url: string;
}

export async function getAdminProduct(id: number): Promise<AdminProductDetail | null> {
  const row = await queryOne<ProductRow>(
    `SELECT id, name, slug, sku, description, material, purity, stone_type,
            price, sale_price, gross_weight, net_weight, diamond_weight, stone_weight,
            is_active, always_available
       FROM products WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) return null;

  const [categoryRows, tagRows, imageRows] = await Promise.all([
    query<IdRow>("SELECT category_id AS id FROM product_categories WHERE product_id = ?", [id]),
    query<IdRow>("SELECT tag_id AS id FROM product_tags WHERE product_id = ?", [id]),
    query<UrlRow>("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order", [id]),
  ]);

  // A product with no product_images rows but a legacy image_url (most of the
  // catalogue, still on external URLs) still shows its one photo in the editor.
  const images = imageRows.map((r) => r.image_url);
  if (images.length === 0 && row.description !== undefined) {
    const legacy = await queryOne<UrlRow>("SELECT image_url FROM products WHERE id = ? AND image_url IS NOT NULL AND image_url <> ''", [id]);
    if (legacy?.image_url) images.push(legacy.image_url);
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    description: row.description ?? "",
    material: row.material ?? "",
    purity: row.purity ?? "",
    stoneType: row.stone_type ?? "",
    price: row.price,
    salePrice: row.sale_price ?? "",
    grossWeight: row.gross_weight ?? "",
    netWeight: row.net_weight ?? "",
    diamondWeight: row.diamond_weight ?? "",
    stoneWeight: row.stone_weight ?? "",
    isActive: row.is_active === 1,
    alwaysAvailable: row.always_available === 1,
    categoryIds: categoryRows.map((r) => r.id),
    tagIds: tagRows.map((r) => r.id),
    imageUrls: images,
  };
}

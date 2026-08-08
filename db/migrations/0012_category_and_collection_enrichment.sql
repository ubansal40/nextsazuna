-- 0012_category_and_collection_enrichment.sql
--
-- The fields the taxonomy redesign adds to categories and collections, and the
-- manual-picks table collections need.
--
-- Categories gain a storefront description, a 1:1 image, a stored sort order
-- (the reference sorted alphabetically; the admin now drags), and a visibility
-- flag. Collections gain the same description/image/order plus a sale-price band
-- (min/max) that narrows their auto-population, and `collection_products` — a
-- hand-picked, ordered membership on top of the existing category/tag rules.
--
-- All additive. Existing rows default to visible with sort_order 0 and null
-- enrichment, so nothing on the storefront changes until an admin edits them.

ALTER TABLE categories
  ADD COLUMN description TEXT NULL AFTER slug,
  ADD COLUMN image_url VARCHAR(500) NULL AFTER description,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER parent_id,
  ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order,
  ADD INDEX idx_categories_order (sort_order, name);

ALTER TABLE collections
  ADD COLUMN description TEXT NULL AFTER slug,
  ADD COLUMN image_url VARCHAR(500) NULL AFTER description,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN price_band_min DECIMAL(12,2) NULL AFTER sort_order,
  ADD COLUMN price_band_max DECIMAL(12,2) NULL AFTER price_band_min,
  ADD INDEX idx_collections_order (sort_order, name);

CREATE TABLE IF NOT EXISTS collection_products (
  collection_id INT NOT NULL,
  product_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, product_id),
  INDEX idx_collection_products_pos (collection_id, position),
  CONSTRAINT fk_cp_collection FOREIGN KEY (collection_id) REFERENCES collections(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cp_product FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 0010_materials_and_purities.sql
--
-- Promote materials and purities from content-block word-lists to managed
-- vocabularies, per the taxonomy redesign. The reference stored them as JSON
-- string arrays in `content_blocks` (system_materials / system_purities), with
-- no counts, visibility, or order; the admin now edits them as first-class rows.
--
-- Products keep their `material` / `purity` STRING columns — no mass rewrite.
-- The vocabulary is the managed list; a product's membership is the string
-- match, and its count is computed live. `is_visible` lets the storefront filter
-- hide a value without deleting products that use it.
--
-- Seeded from the values already in the catalogue (INSERT IGNORE so a slug
-- collision from the messy legacy data is skipped rather than failing the
-- migration) so the screens open populated. Both statements are idempotent —
-- IF NOT EXISTS and INSERT IGNORE — so a re-run is safe.

CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_materials_order (sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_purities_order (sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO materials (name, slug, sort_order)
SELECT d.material, LOWER(REPLACE(REPLACE(TRIM(d.material), ' ', '-'), '/', '-')), 0
  FROM (SELECT DISTINCT material FROM products WHERE material IS NOT NULL AND material <> '') d;

INSERT IGNORE INTO purities (name, slug, sort_order)
SELECT d.purity, LOWER(REPLACE(REPLACE(TRIM(d.purity), ' ', '-'), '/', '-')), 0
  FROM (SELECT DISTINCT purity FROM products WHERE purity IS NOT NULL AND purity <> '') d;

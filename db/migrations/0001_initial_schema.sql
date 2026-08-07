-- 0001_initial_schema.sql
--
-- Initial schema for the Sazuna storefront rebuild. 26 tables.
--
-- DERIVED FROM
--   sql/ecommerce_schema_seed.sql        base tables from the Express app
--   test/fixtures/schema-sql-trace.txt   the byte-exact DDL the Express app
--                                        emitted on boot, captured by its own
--                                        test suite
--
-- The previous application created and altered its schema on every process
-- start. This migration replaces that (ADR 0006): the check-then-act probes
-- (SHOW INDEX / INFORMATION_SCHEMA lookups) are gone, because a migration
-- states the schema rather than discovering it.
--
-- THREE DELIBERATE DEPARTURES FROM THE SOURCES
--
-- 1. The seed script created and selected its own database and DROPped every
--    table first. It is a local bootstrap script, not a schema definition.
--    CREATE DATABASE / USE / DROP TABLE are all removed — a migration must
--    never be able to destroy data, and it runs against the database the
--    runner connected to.
--
-- 2. The original used "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" and
--    "CREATE INDEX IF NOT EXISTS", which are MariaDB extensions and invalid on
--    MySQL. The guards are removed: a migration runs once against a known
--    state, so they were never needed, and removing them makes this portable.
--
-- 3. Four statements the guards had been masking as permanent no-ops (two
--    duplicate columns, two duplicate indexes) are dropped.
--
-- VERIFIED: applies to an empty database on MySQL 8.4 producing exactly 26
-- tables with zero errors.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ==========================================================================
-- BASE TABLES
-- From the Express schema seed.
-- ==========================================================================

CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  parent_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_parent
    FOREIGN KEY (parent_id)
    REFERENCES categories(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  formula VARCHAR(500) NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  material VARCHAR(120) NULL,
  purity VARCHAR(80) NULL,
  category_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pricing_rules_active_priority (is_active, priority, id),
  INDEX idx_pricing_rules_category (category_id),
  CONSTRAINT fk_pricing_rules_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE sku_weight_overrides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL,
  gross_weight DECIMAL(10,3) NULL,
  net_weight DECIMAL(10,3) NULL,
  diamond_weight DECIMAL(10,3) NULL,
  stone_weight DECIMAL(10,3) NULL,
  purity VARCHAR(20) NULL,
  source_file_name VARCHAR(255) NULL,
  source_uploaded_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sku_weight_overrides_sku (sku),
  INDEX idx_sku_weight_overrides_updated (updated_at)
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  sku VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  gross_weight DECIMAL(10,3) NULL,
  net_weight DECIMAL(10,3) NULL,
  diamond_weight DECIMAL(10,3) NULL,
  stone_weight DECIMAL(10,3) NULL,
  stone_type VARCHAR(120) NULL,
  material VARCHAR(120) NULL,
  purity VARCHAR(80) NULL,
  sale_price DECIMAL(12,2) NULL,
  price DECIMAL(12,2) NOT NULL,
  publish_date DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  stock INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_publish (is_active, publish_date),
  INDEX idx_products_pricing (price, sale_price),
  INDEX idx_products_stock (stock),
  INDEX idx_products_lookup (name, sku, material, stone_type)
);

CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_images_order (product_id, sort_order),
  INDEX idx_product_images_product (product_id),
  CONSTRAINT fk_product_images_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE product_categories (
  product_id INT NOT NULL,
  category_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, category_id),
  CONSTRAINT fk_pc_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pc_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE product_tags (
  product_id INT NOT NULL,
  tag_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pt_tag
    FOREIGN KEY (tag_id)
    REFERENCES tags(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_product_tags_tag (tag_id)
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  postal_code VARCHAR(30) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Nepal',
  note TEXT NULL,
  payment_method ENUM('cod', 'card', 'bank_transfer', 'upi') NOT NULL DEFAULT 'cod',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  status ENUM('placed', 'confirmed', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'placed',
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(12) NOT NULL DEFAULT 'NPR',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status (status, payment_status),
  INDEX idx_orders_created (created_at),
  INDEX idx_orders_customer (customer_name, email)
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  product_sku VARCHAR(80) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_order_items_order (order_id)
);

INSERT INTO admin_users (email, password_hash) VALUES
  ('admin@sazuna.com', '$2b$10$Cn3uRQCtNv2RKj0TfPTpruSQEzzzwxuZEivCir4bHbgpPkB2UqJd.');

INSERT INTO categories (id, name, slug, parent_id) VALUES
  (1, 'Rings', 'rings', NULL),
  (2, 'Necklaces', 'necklaces', NULL),
  (3, 'Bracelets', 'bracelets', NULL),
  (4, 'Earrings', 'earrings', NULL),
  (5, 'Bridal Collection', 'bridal-collection', NULL),
  (6, 'Daily Wear', 'daily-wear', NULL),
  (7, 'Uncategorized', 'uncategorized', NULL);

INSERT INTO tags (id, name, slug) VALUES
  (1, 'New Arrival', 'new-arrival'),
  (2, 'Best Seller', 'best-seller'),
  (3, 'Wedding', 'wedding'),
  (4, 'Gift Ready', 'gift-ready'),
  (5, 'Limited Stock', 'limited-stock');

INSERT INTO products (
  id, name, slug, sku, description, image_url,
  gross_weight, net_weight, diamond_weight, stone_weight,
  stone_type, material, purity,
  sale_price, price, stock, is_active
) VALUES
  (1, 'Aurora Diamond Ring', 'aurora-diamond-ring', 'SAZ-RING-001', 'Solitaire-inspired ring with elevated gallery design.', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80', 5.200, 4.600, 0.420, 0.080, 'Diamond', 'Gold', '18K', 899.00, 1049.00, 14, 1),
  (2, 'Celeste Halo Ring', 'celeste-halo-ring', 'SAZ-RING-002', 'Halo ring with delicate pave shoulders.', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=800&q=80', 4.950, 4.300, 0.500, 0.060, 'Diamond', 'Gold', '18K', NULL, 1180.00, 10, 1),
  (3, 'Luna Pearl Necklace', 'luna-pearl-necklace', 'SAZ-NECK-001', 'Freshwater pearl strand with gold clasp.', 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=800&q=80', 12.300, 11.900, 0.000, 3.200, 'Pearl', 'Gold', '14K', 640.00, 710.00, 21, 1),
  (4, 'Verdant Emerald Necklace', 'verdant-emerald-necklace', 'SAZ-NECK-002', 'Pendant necklace with emerald center stone.', 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80', 9.100, 8.700, 0.120, 0.850, 'Emerald', 'Gold', '18K', NULL, 1320.00, 9, 1),
  (5, 'Siena Tennis Bracelet', 'siena-tennis-bracelet', 'SAZ-BRAC-001', 'Classic tennis bracelet with uniform brilliance.', 'https://images.unsplash.com/photo-1629224316810-9d8805b95e76?auto=format&fit=crop&w=800&q=80', 8.200, 7.600, 1.050, 0.000, 'Diamond', 'Platinum', '950', 1850.00, 2100.00, 6, 1),
  (6, 'Aria Chain Bracelet', 'aria-chain-bracelet', 'SAZ-BRAC-002', 'Slim curb-chain bracelet suitable for stacking.', 'https://images.unsplash.com/photo-1543294001-f7cd5d7fb516?auto=format&fit=crop&w=800&q=80', 6.400, 6.100, 0.000, 0.000, 'None', 'Gold', '14K', NULL, 420.00, 30, 1),
  (7, 'Nova Stud Earrings', 'nova-stud-earrings', 'SAZ-EARR-001', 'Daily diamond studs with secure screw backs.', 'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=800&q=80', 2.400, 2.100, 0.300, 0.000, 'Diamond', 'Gold', '18K', 520.00, 590.00, 22, 1),
  (8, 'Orbit Drop Earrings', 'orbit-drop-earrings', 'SAZ-EARR-002', 'Dual-loop drops with sapphire accents.', 'https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=800&q=80', 3.100, 2.850, 0.080, 0.400, 'Sapphire', 'Gold', '18K', NULL, 780.00, 18, 1),
  (9, 'Vow Bridal Ring Set', 'vow-bridal-ring-set', 'SAZ-BRID-001', 'Engagement + wedding pair with matching profile.', 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80', 10.100, 9.200, 0.900, 0.050, 'Diamond', 'Platinum', '950', 2450.00, 2890.00, 4, 1),
  (10, 'Promise Bridal Band', 'promise-bridal-band', 'SAZ-BRID-002', 'Minimal bridal band with hidden stones.', 'https://images.unsplash.com/photo-1603974372035-a2b949f30d5f?auto=format&fit=crop&w=800&q=80', 4.500, 4.200, 0.160, 0.000, 'Diamond', 'Gold', '18K', NULL, 920.00, 12, 1),
  (11, 'Mira Daily Pendant', 'mira-daily-pendant', 'SAZ-DAIL-001', 'Lightweight pendant designed for all-day wear.', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80', 3.500, 3.200, 0.040, 0.120, 'Topaz', 'Gold', '14K', 260.00, 320.00, 34, 1),
  (12, 'Aura Daily Hoops', 'aura-daily-hoops', 'SAZ-DAIL-002', 'Comfort-fit hoops with polished profile.', 'https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?auto=format&fit=crop&w=800&q=80', 2.950, 2.620, 0.000, 0.000, 'None', 'Gold', '14K', NULL, 275.00, 41, 1),
  (13, 'Iris Gem Ring', 'iris-gem-ring', 'SAZ-RING-003', 'Color-pop ring featuring oval amethyst center.', 'https://images.unsplash.com/photo-1602752250015-52934bc45613?auto=format&fit=crop&w=800&q=80', 4.120, 3.880, 0.000, 0.950, 'Amethyst', 'Gold', '14K', NULL, 510.00, 16, 1),
  (14, 'Cascade Layer Necklace', 'cascade-layer-necklace', 'SAZ-NECK-003', 'Layered chains with tiny bezel-set stones.', 'https://images.unsplash.com/photo-1619119069152-a2b331eb392a?auto=format&fit=crop&w=800&q=80', 7.440, 7.020, 0.120, 0.180, 'Diamond', 'Gold', '14K', 690.00, 760.00, 19, 1),
  (15, 'Crown Statement Earrings', 'crown-statement-earrings', 'SAZ-EARR-003', 'Bridal-inspired chandelier silhouette.', 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=800&q=80', 6.900, 6.250, 0.420, 0.780, 'Ruby', 'Gold', '18K', NULL, 1420.00, 7, 1),
  (16, 'Arjun Signet Ring', 'arjun-signet-ring', 'SAZ-RING-004', 'Bold signet ring with a brushed finish and engraved crest, made for everyday statement wear.', 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=800&q=80', 7.800, 7.200, 0.000, 0.000, 'None', 'Gold', '18K', NULL, 980.00, 15, 1);

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT id, image_url, 1
FROM products
WHERE image_url IS NOT NULL;

INSERT INTO product_categories (product_id, category_id) VALUES
  (1, 1), (1, 6),
  (2, 1),
  (3, 2), (3, 6),
  (4, 2),
  (5, 3), (5, 5),
  (6, 3), (6, 6),
  (7, 4), (7, 6),
  (8, 4),
  (9, 5), (9, 1),
  (10, 5),
  (11, 6), (11, 2),
  (12, 6), (12, 4),
  (13, 1),
  (14, 2),
  (15, 4), (15, 5),
  (16, 1), (16, 6);

INSERT INTO product_tags (product_id, tag_id) VALUES
  (1, 2), (1, 3),
  (2, 1), (2, 2),
  (3, 4),
  (4, 1),
  (5, 2), (5, 5),
  (7, 2), (7, 4),
  (9, 3), (9, 5),
  (10, 3),
  (11, 1), (11, 4),
  (12, 4),
  (15, 3), (15, 5),
  (16, 1);

INSERT INTO orders (
  id, order_number, customer_name, email, phone,
  address_line1, address_line2, city, state, postal_code, country,
  note, payment_method, payment_status, status,
  subtotal, tax_amount, shipping_amount, total_amount, currency,
  created_at
) VALUES
  (1, 'SAZ-20260219-000001', 'Aarav Shah', 'aarav@example.com', '+9779811111111',
   'Durbar Marg 12', NULL, 'Kathmandu', 'Bagmati', '44600', 'Nepal',
   'Please call before delivery.', 'cod', 'pending', 'placed',
   1799.00, 233.87, 200.00, 2232.87, 'NPR', NOW()),
  (2, 'SAZ-20260219-000002', 'Nisha Gurung', 'nisha@example.com', '+9779822222222',
   'Lakeside Road 3', 'Apt 2B', 'Pokhara', 'Gandaki', '33700', 'Nepal',
   NULL, 'card', 'paid', 'completed',
   1049.00, 136.37, 200.00, 1385.37, 'NPR', NOW());

INSERT INTO order_items (
  order_id, product_id, product_name, product_sku, unit_price, quantity, line_total
) VALUES
  (1, 1, 'Aurora Diamond Ring', 'SAZ-RING-001', 899.00, 1, 899.00),
  (1, 7, 'Nova Stud Earrings', 'SAZ-EARR-001', 520.00, 1, 520.00),
  (1, 11, 'Mira Daily Pendant', 'SAZ-DAIL-001', 260.00, 1, 260.00),
  (1, 12, 'Aura Daily Hoops', 'SAZ-DAIL-002', 120.00, 1, 120.00),
  (2, 1, 'Aurora Diamond Ring', 'SAZ-RING-001', 1049.00, 1, 1049.00);

-- ==========================================================================
-- TABLES ADDED BY THE APPLICATION AT BOOT
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(150) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS product_tags (
        product_id INT NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (product_id, tag_id),
        INDEX idx_product_tags_tag (tag_id),
        CONSTRAINT fk_pt_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_pt_tag
          FOREIGN KEY (tag_id)
          REFERENCES tags(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(150) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS product_tags (
        product_id INT NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (product_id, tag_id),
        INDEX idx_product_tags_tag (tag_id),
        CONSTRAINT fk_pt_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_pt_tag
          FOREIGN KEY (tag_id)
          REFERENCES tags(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS collections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(180) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS collection_categories (
        collection_id INT NOT NULL,
        category_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection_id, category_id),
        INDEX idx_collection_categories_category (category_id),
        CONSTRAINT fk_cc_collection
          FOREIGN KEY (collection_id)
          REFERENCES collections(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_cc_category
          FOREIGN KEY (category_id)
          REFERENCES categories(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS collection_tags (
        collection_id INT NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection_id, tag_id),
        INDEX idx_collection_tags_tag (tag_id),
        CONSTRAINT fk_ct_collection
          FOREIGN KEY (collection_id)
          REFERENCES collections(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_ct_tag
          FOREIGN KEY (tag_id)
          REFERENCES tags(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS product_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        sort_order INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_product_images_order (product_id, sort_order),
        INDEX idx_product_images_product (product_id),
        CONSTRAINT fk_product_images_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS product_image_jobs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        sku VARCHAR(80) NOT NULL,
        input_image_urls LONGTEXT NOT NULL,
        output_image_urls LONGTEXT NULL,
        desired_is_active TINYINT(1) NOT NULL DEFAULT 1,
        status ENUM('pending', 'processing', 'ready', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
        attempt_count INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        error_message VARCHAR(500) NULL,
        processing_started_at DATETIME NULL,
        processed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_product_image_jobs_status (status, created_at, id),
        INDEX idx_product_image_jobs_product (product_id, id),
        CONSTRAINT fk_product_image_jobs_product
          FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS pricing_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        formula VARCHAR(500) NOT NULL,
        priority INT NOT NULL DEFAULT 100,
        material VARCHAR(120) NULL,
        purity VARCHAR(80) NULL,
        category_id INT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pricing_rules_active_priority (is_active, priority, id),
        INDEX idx_pricing_rules_category (category_id),
        CONSTRAINT fk_pricing_rules_category
          FOREIGN KEY (category_id)
          REFERENCES categories(id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      );

CREATE TABLE IF NOT EXISTS sku_weight_overrides (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        sku VARCHAR(80) NOT NULL,
        gross_weight DECIMAL(10,3) NULL,
        net_weight DECIMAL(10,3) NULL,
        diamond_weight DECIMAL(10,3) NULL,
        stone_weight DECIMAL(10,3) NULL,
        purity VARCHAR(20) NULL,
        source_file_name VARCHAR(255) NULL,
        source_uploaded_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sku_weight_overrides_sku (sku),
        INDEX idx_sku_weight_overrides_updated (updated_at)
      );

CREATE TABLE IF NOT EXISTS content_blocks (
          `key`        VARCHAR(120)  NOT NULL PRIMARY KEY,
          `value`      JSON          NOT NULL,
          is_published TINYINT       NOT NULL DEFAULT 1,
          updated_by   VARCHAR(255)  NULL,
          updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notify_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_slug VARCHAR(255) NOT NULL,
          product_id INT NULL,
          phone VARCHAR(32) NOT NULL,
          email VARCHAR(255) NULL,
          customer_name VARCHAR(200) NULL,
          source VARCHAR(40) NOT NULL DEFAULT 'pdp',
          status ENUM('waiting', 'notified', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'waiting',
          user_agent VARCHAR(255) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notified_at TIMESTAMP NULL,
          fulfilled_at TIMESTAMP NULL,
          INDEX idx_notify_product (product_slug, status),
          INDEX idx_notify_phone (phone),
          INDEX idx_notify_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_log (
          id            BIGINT       AUTO_INCREMENT PRIMARY KEY,
          admin_id      INT          NULL,
          admin_email   VARCHAR(255) NULL,
          action        VARCHAR(60)  NOT NULL,
          resource_type VARCHAR(40)  NOT NULL,
          resource_id   VARCHAR(80)  NULL,
          metadata_json JSON         NULL,
          ip            VARCHAR(64)  NULL,
          user_agent    VARCHAR(500) NULL,
          created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_admin_created (admin_id, created_at),
          INDEX idx_audit_resource (resource_type, resource_id),
          INDEX idx_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(30) NOT NULL UNIQUE,
        name VARCHAR(120) NULL,
        email VARCHAR(190) NULL,
        address_line1 VARCHAR(255) NULL,
        address_line2 VARCHAR(255) NULL,
        city VARCHAR(120) NULL,
        state VARCHAR(120) NULL,
        postal_code VARCHAR(30) NULL,
        country VARCHAR(100) NULL DEFAULT 'Nepal',
        dob DATE NULL,
        anniversary DATE NULL,
        ring_size VARCHAR(40) NULL,
        bangle_size VARCHAR(40) NULL,
        loyalty_points INT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customers_name (name),
        INDEX idx_customers_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        allowed_sections JSON NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_notes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        admin_id INT NULL,
        admin_email VARCHAR(190) NULL,
        message VARCHAR(500) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_notes_order (order_id, created_at),
        CONSTRAINT fk_order_notes_order
          FOREIGN KEY (order_id) REFERENCES orders(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_config (
        id TINYINT NOT NULL PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        earn_points DECIMAL(10,4) NOT NULL DEFAULT 1,
        per_amount DECIMAL(12,2) NOT NULL DEFAULT 100,
        redeem_value_per_point DECIMAL(10,4) NOT NULL DEFAULT 1,
        min_redeem_points INT NOT NULL DEFAULT 0,
        birthday_bonus_points INT NOT NULL DEFAULT 0,
        anniversary_bonus_points INT NOT NULL DEFAULT 0,
        expiry_days INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS abandoned_cart_config (
        id TINYINT PRIMARY KEY DEFAULT 1,
        min_age_minutes INT NOT NULL DEFAULT 30,
        include_pending TINYINT(1) NOT NULL DEFAULT 1,
        include_failed TINYINT(1) NOT NULL DEFAULT 1,
        include_started TINYINT(1) NOT NULL DEFAULT 1,
        default_window VARCHAR(10) NOT NULL DEFAULT '7d',
        whatsapp_template TEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS abandoned_checkouts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        cart_token VARCHAR(64) NOT NULL UNIQUE,
        customer_name VARCHAR(200) NULL,
        phone VARCHAR(30) NULL,
        email VARCHAR(255) NULL,
        items_json MEDIUMTEXT NULL,
        item_count INT NOT NULL DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'NPR',
        converted_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_abchk_live (converted_at, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_ledger (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        order_id INT NULL,
        delta INT NOT NULL,
        reason VARCHAR(60) NOT NULL,
        balance_after INT NULL,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        INDEX idx_loyalty_customer (customer_id, created_at),
        INDEX idx_loyalty_order (order_id),
        CONSTRAINT fk_loyalty_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_otp (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(30) NOT NULL,
        code_hash CHAR(64) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        consumed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_customer_otp_phone (phone, expires_at),
        INDEX idx_customer_otp_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- COLUMN ADDITIONS
-- Columns the application added to the base tables over time.
-- ==========================================================================

ALTER TABLE `products` ADD COLUMN `always_available` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`;
ALTER TABLE `admin_users` ADD COLUMN `name` VARCHAR(120) NULL AFTER `email`;
ALTER TABLE `admin_users` ADD COLUMN `role_id` INT NULL AFTER `is_active`;
ALTER TABLE `staff_roles` ADD COLUMN `default_section` VARCHAR(60) NULL AFTER `allowed_sections`;
ALTER TABLE `orders` ADD COLUMN `customer_id` INT NULL AFTER `id`;
ALTER TABLE `orders` ADD COLUMN `source` ENUM('web','desk') NOT NULL DEFAULT 'web' AFTER `order_number`;
ALTER TABLE `orders` ADD COLUMN `custom_bill_no` VARCHAR(80) NULL AFTER `order_number`;
ALTER TABLE `orders` ADD COLUMN `purchase_fired` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;
ALTER TABLE `orders` ADD COLUMN `created_by_admin_id` INT NULL AFTER `purchase_fired`;
ALTER TABLE orders MODIFY status ENUM(
        'pending_payment','payment_failed','placed','confirmed',
        'billed','processing','completed','cancelled'
      ) NOT NULL DEFAULT 'placed';
ALTER TABLE orders MODIFY payment_method ENUM(
        'cod','card','bank_transfer','upi','esewa','khalti','fonepay','cybersource','cash'
      ) NOT NULL DEFAULT 'cod';
ALTER TABLE `order_items` ADD COLUMN `is_custom` TINYINT(1) NOT NULL DEFAULT 0 AFTER `product_sku`;
ALTER TABLE `order_items` ADD COLUMN `material` VARCHAR(120) NULL AFTER `is_custom`;
ALTER TABLE `order_items` ADD COLUMN `purity` VARCHAR(80) NULL AFTER `material`;
ALTER TABLE `order_items` ADD COLUMN `gross_weight` DECIMAL(10,3) NULL AFTER `purity`;
ALTER TABLE `order_items` ADD COLUMN `net_weight` DECIMAL(10,3) NULL AFTER `gross_weight`;
ALTER TABLE `order_items` ADD COLUMN `diamond_weight` DECIMAL(10,3) NULL AFTER `net_weight`;
ALTER TABLE `order_items` ADD COLUMN `stone_weight` DECIMAL(10,3) NULL AFTER `diamond_weight`;

-- ==========================================================================
-- INDEXES
-- ==========================================================================

CREATE INDEX idx_pc_category_product ON product_categories (category_id, product_id);
CREATE INDEX idx_product_tags_tag_product ON product_tags (tag_id, product_id);
CREATE INDEX idx_products_active_publish_id ON products (is_active, publish_date, id);
CREATE INDEX idx_collections_active_id ON collections (is_active, id);
CREATE INDEX idx_orders_status_id ON orders (status, id);
CREATE INDEX idx_order_items_product ON order_items (product_id);
CREATE INDEX idx_product_image_jobs_status_id ON product_image_jobs (status, id);
CREATE INDEX idx_products_always_available ON products (always_available);
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
CREATE INDEX idx_orders_source ON orders (source, status);

-- ==========================================================================
-- CONFIGURATION DEFAULTS
-- Singleton rows the application expects to exist.
-- ==========================================================================

INSERT IGNORE INTO loyalty_config (id, enabled) VALUES (1, 0);
INSERT IGNORE INTO abandoned_cart_config (id) VALUES (1);

SET FOREIGN_KEY_CHECKS = 1;

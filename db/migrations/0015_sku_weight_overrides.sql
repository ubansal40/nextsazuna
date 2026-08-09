-- 0015_sku_weight_overrides.sql
--
-- The inventory sheet that powers SKU autofill in the product editor.
--
-- Staff receive an inventory export from the workshop (Tag No / Stamp / Gr.Wt /
-- N.Wt / Dia Wt / Stn.Wt). One upload replaces the sheet; from then on, typing a
-- SKU into a product card fills its purity and four weights, and the sale price
-- follows from the matching pricing rule. Without it, every one of those six
-- fields is retyped by hand per product, which is where the transcription errors
-- come from.
--
-- Schema matched to sazuna-unik 2's `sku_weight_overrides` so an export that
-- worked for the old admin works here unchanged.
--
-- `sku` is UNIQUE: the sheet is a lookup table keyed by SKU, not a log. Re-uploading
-- upserts, so correcting a weight is another upload rather than a manual edit.
-- `source_file_name` / `source_uploaded_at` are carried so the screen can say
-- which sheet is currently in force — "autofill is on, from March-inventory.xlsx"
-- is the difference between trusting the feature and not.

CREATE TABLE IF NOT EXISTS sku_weight_overrides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL,
  gross_weight DECIMAL(10,3) NULL,
  net_weight DECIMAL(10,3) NULL,
  diamond_weight DECIMAL(10,3) NULL,
  stone_weight DECIMAL(10,3) NULL,
  -- From the sheet's "Stamp" column (e.g. 18KT).
  purity VARCHAR(20) NULL,
  source_file_name VARCHAR(255) NULL,
  source_uploaded_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sku_weight_overrides_sku (sku),
  INDEX idx_sku_weight_overrides_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

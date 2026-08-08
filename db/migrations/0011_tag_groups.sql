-- 0011_tag_groups.sql
--
-- Tag groups, per the taxonomy redesign: the storefront filter groups a tag
-- belongs to. The reference's tags were a flat name/slug list with no grouping,
-- no per-tag visibility, and no merge. This adds the group table and the two
-- columns tags need — a group and a visibility flag — plus an order so a group's
-- tags list in a chosen sequence.
--
-- `group_id` is nullable (an ungrouped tag is fine) and ON DELETE SET NULL, so
-- deleting a group ungroups its tags rather than deleting them. Merge is an
-- operation, not schema: reassign `product_tags` to the survivor, then delete
-- the merged tag (done in the admin, audited).

CREATE TABLE IF NOT EXISTS tag_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tag_groups_order (sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tags
  ADD COLUMN group_id INT NULL AFTER slug,
  ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER group_id,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER is_visible,
  ADD CONSTRAINT fk_tags_group FOREIGN KEY (group_id) REFERENCES tag_groups(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

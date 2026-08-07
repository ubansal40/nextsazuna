-- 0003_category_intros_content_block.sql
--
-- Editorial copy shown under a category title on the listing page.
--
-- The design spec puts a subheading beneath every category heading, but
-- `categories` is a thin taxonomy table (id, name, slug, parent_id) with nowhere
-- to put prose — and adding a description column there would mix merchandising
-- copy into the taxonomy.
--
-- `content_blocks` already exists for exactly this: a key with a JSON value,
-- editable from the admin, published independently. One block holds a
-- slug → copy map, so adding copy for a new category is a content edit rather
-- than a migration.
--
-- Only the category the spec itself writes copy for is seeded. The rest render
-- without a subheading until someone writes one — inventing brand voice for
-- fourteen categories is not a migration's job.

INSERT INTO content_blocks (`key`, `value`, is_published, updated_by)
VALUES (
  'category_intros',
  JSON_OBJECT(
    'diamond-rings',
    'SGL-certified diamonds, hand-set in 9–22KT gold. Solitaires, halos, bands & cocktail rings — every grade exactly as quoted.'
  ),
  1,
  'migration'
)
ON DUPLICATE KEY UPDATE `key` = `key`;

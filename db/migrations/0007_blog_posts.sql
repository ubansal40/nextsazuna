-- 0007_blog_posts.sql
--
-- The Journal.
--
-- The Express app keeps posts as markdown files in `content/blog/*.md` with a
-- hand-parsed frontmatter block, and reads that directory at request time. That
-- works there because the app runs from a persistent checkout. It cannot work
-- here: Next builds `output: "standalone"`, so anything the admin writes to disk
-- at runtime is gone on the next deploy. The editor arriving with the admin
-- needs somewhere durable to put a post.
--
-- Shape follows the frontmatter exactly, so the port is a data move rather than
-- a redesign. Two things stay as they are rather than being "improved":
--
--   * `category` is a single string, not a table. The index derives its filter
--     pills from the distinct values actually in use, so a new category is a
--     post, not a migration.
--   * `published_at` is a DATE. The source stores a bare YYYY-MM-DD — the file
--     name encodes it — and no post has ever needed a time of day.
--
-- There is no `id` in the source; `slug` is its primary key. A surrogate id is
-- added anyway so the admin can rename a slug without losing the row's identity,
-- but `slug` stays UNIQUE because it is the URL.

CREATE TABLE IF NOT EXISTS blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(200) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  excerpt VARCHAR(320) NOT NULL DEFAULT '',
  -- External absolute URLs today; there is no upload pipeline for covers.
  cover VARCHAR(500) NOT NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT '',
  author VARCHAR(120) NOT NULL DEFAULT 'Sazuna Editorial',
  -- Markdown. Stored verbatim and never sanitised on the way in: the renderer
  -- escapes the whole source before applying a single rule, so raw HTML in a
  -- post is inert text by the time any formatting could see it.
  body MEDIUMTEXT NOT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- The index listing: published only, newest first.
  INDEX idx_blog_posts_published (status, published_at),
  INDEX idx_blog_posts_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- The two posts that exist, moved verbatim from content/blog/*.md.
-- Bodies are the markdown below the frontmatter, unchanged.
-- ---------------------------------------------------------------------------
INSERT INTO blog_posts (slug, title, excerpt, cover, category, author, status, published_at, body)
VALUES (
  'caring-for-your-silver',
  'Caring for your silver',
  'Three habits that keep 92.5 sterling looking new for a decade.',
  'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1400&q=80',
  'Care',
  'Sazuna Editorial',
  'published',
  '2026-04-15',
  'Sterling silver oxidises on contact with air. It''s chemistry, not a defect. The good news: a few small habits keep your pieces looking new for years.

## 1. Last on, first off

Put your jewellery on **after** perfume, lotion, and hairspray. Sulfur and certain oils dull the surface fastest. Take it off before showering, swimming, or strenuous exercise — sweat is mildly acidic and slowly etches the polish.

## 2. The microfibre rub

The single most useful tool in the box is a soft microfibre cloth. A 10-second rub on each side restores shine. Skip the silver-dip / liquid polish kits — they''re great on plain sterling but harsh on plating, set stones, and antiqued finishes.

## 3. Store individually

Keep each piece in its own pouch (the one your order arrived in is perfect) inside a closed box. Pieces tossed in a drawer tarnish faster from the humidity, and metal-on-metal contact creates micro-scratches.

## When in doubt

Bring it to the atelier on New Road — we''ll re-polish any Sazuna piece free, and re-plate gold-plated silver at cost (around Rs. 1,500 depending on size). Your in-house purity guarantee never expires.'
),
(
  'tihar-gifting-guide',
  'A guide to gifting at Tihar',
  'Brother and sister gifts that feel like heirlooms, not obligations.',
  'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=1400&q=80',
  'Festive',
  'Sazuna Editorial',
  'published',
  '2026-05-10',
  'Tihar at our home meant rangoli on the doorstep, a new piece of jewellery from Aama, and a quiet promise to wear it well into the next year. If you''re picking pieces for the brother–sister exchange this year, here''s how we''d think about it.

## For your sister

Sisters usually wear what suits them every day, not just on Bhai Tika. So pick a piece that survives the daily commute as much as the puja:

- **A pair of stud diamond earrings** — SGL certified, eye-clean, set in 14k or 18k plated silver. Light enough for the office. Big enough that her colleagues will notice.
- **A 92.5 sterling silver chain** with a small pendant — versatile, classic, ages well.
- **A delicate bracelet** that fits under a kurta sleeve.

Skip anything she''d have to "save for special occasions." Heirlooms are the ones that come out daily.

## For your brother

The bar is lower here — but the right men''s piece still gets worn for years:

- **A simple sterling silver chain** — 18 to 20 inches, no pendant.
- **A signet ring** — engraved with his initials, or left clean.
- **A bracelet** in 92.5 — not too dainty, not too chunky.

## A note on hallmarks

Don''t pay extra for hallmarks Nepal doesn''t certify. Our silver is 92.5 sterling, our diamonds carry independent SGL certificates, and both come with our in-house guarantee in writing — that''s the standard that matters here.

## Order by Oct 27

For Lakshmi Puja delivery anywhere in Nepal, place your order by **Oct 27**. Same-day in Kathmandu Valley if you order before 2 PM. Free shipping, COD available everywhere.

Or visit the atelier on New Road — we''ll wrap it for you.'
)
ON DUPLICATE KEY UPDATE slug = slug;

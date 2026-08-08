import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "../db";

/**
 * Journal posts.
 *
 * `published_at` is read through DATE_FORMAT rather than as a DATE. mysql2
 * hands a bare DATE back as a JS `Date` at local midnight, which shifts a day
 * once it crosses a timezone — a post published on the 10th displayed as the
 * 9th before this was added, and it would have shipped that way into the
 * article byline and the sitemap alike.
 */

/**
 * The public shapes. Declared plainly rather than as Omit<Row, "body">: a row
 * type extends RowDataPacket, whose index signature swallows the named keys the
 * moment Omit maps over it.
 */
export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  author: string;
  published_at: string | null;
}

export interface BlogPost extends BlogPostSummary {
  body: string;
}

type SummaryRow = BlogPostSummary & RowDataPacket;
type PostRow = BlogPost & RowDataPacket;

const LIST_COLUMNS = `slug, title, excerpt, cover, category, author,
        DATE_FORMAT(published_at, '%Y-%m-%d') AS published_at`;

/**
 * Every published post, newest first.
 *
 * Not paginated. There are two posts; the reference does not paginate either,
 * and the index's "load more" is a client affordance over a list that is
 * entirely in the HTML — which is what keeps the whole archive readable with
 * JavaScript off.
 */
export async function listPublishedPosts(): Promise<BlogPostSummary[]> {
  return query<SummaryRow>(
    `SELECT ${LIST_COLUMNS}
       FROM blog_posts
      WHERE status = 'published'
      ORDER BY published_at DESC, id DESC`,
  );
}

/** One published post, body included. Drafts are simply not found. */
export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const clean = String(slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(clean)) return null;

  return queryOne<PostRow>(
    `SELECT ${LIST_COLUMNS}, body
       FROM blog_posts
      WHERE slug = ? AND status = 'published'
      LIMIT 1`,
    [clean],
  );
}

/**
 * Other posts to read next.
 *
 * Same category first, then anything else, so a care article leads to the other
 * care articles before it reaches for a gifting guide.
 */
export async function getRelatedPosts(
  slug: string,
  category: string,
  limit = 3,
): Promise<BlogPostSummary[]> {
  return query<SummaryRow>(
    `SELECT ${LIST_COLUMNS}
       FROM blog_posts
      WHERE status = 'published' AND slug <> ?
      ORDER BY (category = ?) DESC, published_at DESC
      LIMIT ${Math.max(1, Math.min(6, limit))}`,
    [slug, category],
  );
}

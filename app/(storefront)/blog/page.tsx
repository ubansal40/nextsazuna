import type { Metadata } from "next";
import Link from "next/link";
import { ContentKicker } from "@/components/content/policy-page";
import { listPublishedPosts } from "@/lib/blog/posts";
import { postHref } from "@/lib/blog/markdown";
import { staticOrigin } from "@/lib/site-url";
import { cn } from "@/lib/cn";
import { FeaturedCard, PostCard } from "./_components/post-card";

/**
 * The Journal — Sazuna Journal.dc.html §listing.
 *
 * Category filtering is a set of real links against `?category=`, not a client
 * filter, so every view is a URL someone can share and a crawler can reach.
 * The spec layers instant filtering over the same links; that is an
 * enhancement, and the links are what work without it.
 */

export const metadata: Metadata = {
  title: "The Journal",
  description:
    "Buying guides, care rituals and stories from the bench — for the pieces you'll keep for life.",
  alternates: { canonical: "/blog" },
};

/**
 * `?category=guides&category=care` hands back an array, not a string.
 *
 * Nothing in the UI produces that URL, but anything at all can request one, and
 * `.toLowerCase()` on an array threw — a repeated parameter 500'd the whole
 * index. The listing surfaces guard it the same way; this is their `one()`.
 */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const category = one((await searchParams).category)?.trim() ?? "";
  const posts = await listPublishedPosts();

  // Derived from the posts themselves, so a new category is a post rather than
  // a migration.
  const categories = [...new Set(posts.map((p) => p.category).filter(Boolean))].sort();
  const active = categories.find((c) => c.toLowerCase() === category.toLowerCase()) ?? null;
  /**
   * A `?category=` that matches nothing is a failed filter, and it used to
   * render as the complete, unfiltered index with "All" lit up — the one
   * reading that is impossible to spot as wrong. It gets the empty state and is
   * told so instead.
   */
  const unmatched = category.length > 0 && !active;
  const shown = active ? posts.filter((p) => p.category === active) : unmatched ? [] : posts;

  const [featured, ...rest] = shown;

  /**
   * `Blog` with the posts nested, capped as the reference caps it. A filtered
   * view describes the whole Journal rather than the slice, since its canonical
   * points at the unfiltered index.
   */
  const schema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Sazuna Journal",
    url: `${staticOrigin()}/blog`,
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${staticOrigin()}${postHref(post.slug)}`,
      datePublished: post.published_at ?? undefined,
    })),
  };

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 journal-narrow:px-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="max-w-[680px] pt-[30px]">
        <ContentKicker>The Sazuna Journal</ContentKicker>
        <h1 className="m-0 text-story-h1-sm font-normal tracking-tight text-heading text-balance">
          Notes on diamonds, gold &amp; the moments between
        </h1>
        <p className="m-0 mt-3.5 text-control leading-relaxed text-muted [text-wrap:pretty]">
          Buying guides, care rituals and stories from the bench — for the pieces you&rsquo;ll keep
          for life.
        </p>
      </header>

      {categories.length > 0 && (
        <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
          <CategoryChip href="/blog" label="All" active={!active && !unmatched} />
          {categories.map((name) => (
            <CategoryChip
              key={name}
              href={`/blog?category=${encodeURIComponent(name)}`}
              label={name}
              active={name === active}
            />
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="mt-9 rounded-[var(--sz-radius-xl)] border border-dashed border-content-dashed bg-raised px-6 py-16 text-center">
          <span aria-hidden className="inline-flex items-center justify-center gap-2.5">
            <span className="size-3 rotate-45 bg-line" />
            <span className="size-[19px] rotate-45 bg-accent opacity-60" />
            <span className="size-3 rotate-45 bg-line" />
          </span>
          <p className="m-0 mt-5 font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
            {unmatched
              ? /* Echoed back so the reader can see the typo, clipped so a
                   pathological query string cannot blow out the card. */
                `No category called “${category.slice(0, 40)}”`
              : active
                ? "No articles in this category yet"
                : "No articles yet"}
          </p>
          <p className="mx-auto m-0 mt-2 max-w-[40ch] text-sm leading-relaxed text-muted">
            {unmatched
              ? "Pick one of the categories above, or read everything in the Journal."
              : "New stories from the atelier are on the way."}
          </p>
          {(active || unmatched) && (
            <Link
              href="/blog"
              className="mt-5 inline-flex items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-6 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
            >
              All stories
            </Link>
          )}
        </div>
      ) : (
        <>
          <FeaturedCard post={featured} />
          {rest.length > 0 && (
            <div className="mt-11 grid gap-y-8 gap-x-[26px] grid-cols-3 journal-stacked:grid-cols-2 journal-single:grid-cols-1">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-pill border px-4 text-sm font-semibold no-underline min-h-10 hover:no-underline",
        active
          ? "border-primary-700 bg-primary-700 text-white"
          : "border-line bg-raised text-body hover:border-accent hover:text-primary-700",
      )}
    >
      {label}
    </Link>
  );
}

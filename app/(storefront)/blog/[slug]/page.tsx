import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/ui";
import { PolicyToc } from "@/components/content/policy-toc";
import { getPublishedPost, getRelatedPosts } from "@/lib/blog/posts";
import {
  formatPostDate,
  isoDate,
  postHref,
  readingMinutes,
  render,
  withHeadingIds,
} from "@/lib/blog/markdown";
import { staticOrigin } from "@/lib/site-url";
import { PostCard } from "../_components/post-card";

/**
 * One Journal article — Sazuna Journal.dc.html §article.
 *
 * The body is rendered on the server. Nothing about the post reaches the
 * browser as markdown, and the HTML it does send was escaped before a single
 * formatting rule ran — see lib/blog/markdown.ts.
 *
 * The table of contents is the same component the policy pages use, which is
 * why the anchors clear the sticky header here too.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return {};

  const description = post.excerpt.trim().slice(0, 160) || `${post.title} — from the Sazuna atelier.`;

  return {
    title: post.title,
    description,
    alternates: { canonical: postHref(post.slug) },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `${staticOrigin()}${postHref(post.slug)}`,
      images: post.cover ? [post.cover] : undefined,
      publishedTime: post.published_at ?? undefined,
      authors: post.author ? [post.author] : undefined,
    },
  };
}

export default async function JournalPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  // A draft, a typo and a deleted post all land the same way.
  if (!post) notFound();

  const { html, toc } = withHeadingIds(render(post.body));
  const related = await getRelatedPosts(post.slug, post.category);
  const origin = staticOrigin();
  const url = `${origin}${postHref(post.slug)}`;

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt || undefined,
      image: post.cover ? [post.cover] : undefined,
      author: { "@type": "Organization", name: post.author || "Sazuna Editorial" },
      publisher: { "@type": "Organization", name: "Sazuna Jewellers", "@id": `${origin}/#org` },
      datePublished: post.published_at ?? undefined,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Journal", item: `${origin}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {post.cover && (
        <div className="aspect-16/6 overflow-hidden bg-surface journal-stacked:aspect-16/8 journal-single:aspect-4/3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover}
            alt=""
            className="size-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      )}

      <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 journal-narrow:px-5">
        <nav aria-label="Breadcrumb" className="pt-5">
          <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-sm">
            <li>
              <Link href="/" className="text-muted no-underline hover:no-underline">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-control-border">
              ›
            </li>
            <li>
              <Link href="/blog" className="text-muted no-underline hover:no-underline">
                Journal
              </Link>
            </li>
            {post.category && (
              <>
                <li aria-hidden className="text-control-border">
                  ›
                </li>
                <li aria-current="page" className="font-medium text-heading">
                  {post.category}
                </li>
              </>
            )}
          </ol>
        </nav>

        <header className="mx-auto mt-7 max-w-[760px] text-center">
          {post.category && (
            <p className="m-0 mb-3.5 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong">
              {post.category}
            </p>
          )}
          <h1 className="m-0 text-story-h1-sm font-normal tracking-tight text-heading text-balance">
            {post.title}
          </h1>
          <p className="m-0 mt-5 flex flex-wrap items-center justify-center gap-2.5 font-mono text-xs text-muted">
            <span
              aria-hidden
              className="inline-flex size-8 items-center justify-center rounded-pill bg-primary-800 font-[family-name:var(--sz-font-display)] text-sm text-accent"
            >
              S
            </span>
            <span className="font-medium text-body">{post.author}</span>
            <span aria-hidden className="size-[3px] rounded-pill bg-accent" />
            {post.published_at && (
              <time dateTime={isoDate(post.published_at)}>{formatPostDate(post.published_at)}</time>
            )}
            <span aria-hidden className="size-[3px] rounded-pill bg-accent" />
            <span>{readingMinutes(post.body)} min read</span>
          </p>
        </header>

        <div className="mx-auto mt-10 grid max-w-[976px] items-start gap-14 grid-cols-[232px_minmax(0,688px)] journal-stacked:max-w-[688px] journal-stacked:grid-cols-1 journal-stacked:gap-0">
          {toc.length > 0 ? (
            <PolicyToc entries={toc.map((h) => ({ id: h.id, label: h.label }))} />
          ) : (
            <div className="journal-stacked:hidden" />
          )}

          <div className="min-w-0">
            <p className="m-0 mb-5 text-content-lead font-medium leading-relaxed text-lead [text-wrap:pretty]">
              {post.excerpt}
            </p>

            {/*
              Safe by construction rather than by sanitising: `render` escapes
              the entire source before applying any formatting rule, so nothing
              an author wrote can still be markup by the time it reaches here.
              See lib/blog/markdown.ts and scripts/check-blog-render.mts.
            */}
            <Prose measure="full" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        {related.length > 0 && (
          <section className="mx-auto mt-16 max-w-[1080px]">
            <h2 className="m-0 mb-6 font-[family-name:var(--sz-font-display)] text-story-h2-sm font-normal tracking-tight text-heading">
              More from the Journal
            </h2>
            <div className="grid gap-y-8 gap-x-[26px] grid-cols-3 journal-stacked:grid-cols-2 journal-single:grid-cols-1">
              {related.map((item) => (
                <PostCard key={item.slug} post={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

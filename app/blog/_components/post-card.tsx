import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatPostDate, isoDate, postHref, readingMinutes } from "@/lib/blog/markdown";

/**
 * Journal cards — Sazuna Journal.dc.html §listing.
 *
 * `featured` is the oversized lead: image beside the copy rather than above it.
 * Both variants are the same data, so a search that promotes a post into the
 * lead slot does not need a different component.
 *
 * Cover images are plain <img>, not next/image. They are external Unsplash URLs
 * the shop does not own; routing them through the optimiser would make every
 * page load depend on a third party responding, and `onerror` cannot be used to
 * hide a broken one from a Server Component anyway.
 */

export interface PostCardData {
  slug: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  published_at: string | null;
  body?: string;
}

const cardClass =
  "group flex flex-col overflow-hidden rounded-[var(--sz-radius-xl)] border border-line bg-raised no-underline transition-[box-shadow,transform] duration-[var(--sz-dur-slow)] ease-[var(--sz-ease-out)] hover:-translate-y-1 hover:shadow-lg hover:no-underline";

function Meta({ post }: { post: PostCardData }) {
  const date = formatPostDate(post.published_at);
  return (
    <p className="m-0 mt-3.5 flex items-center gap-2.5 font-mono text-2xs text-muted-soft">
      {date && <time dateTime={isoDate(post.published_at)}>{date}</time>}
      <span aria-hidden className="size-[3px] rounded-pill bg-accent" />
      <span>{readingMinutes(post.body ?? post.excerpt)} min read</span>
    </p>
  );
}

function Cover({ post, className }: { post: PostCardData; className: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)}>
      {post.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover}
          alt=""
          className="size-full object-cover transition-transform duration-[var(--sz-dur-slow)] ease-[var(--sz-ease-out)] group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
      )}
      {post.category && (
        <span className="absolute start-3 top-3 rounded-sm bg-canvas/90 px-2.5 py-1.5 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
          {post.category}
        </span>
      )}
    </div>
  );
}

export function FeaturedCard({ post }: { post: PostCardData }) {
  return (
    <Link
      href={postHref(post.slug)}
      className={cn(cardClass, "mt-7 grid grid-cols-[1.12fr_.88fr] journal-stacked:grid-cols-1")}
    >
      <Cover post={post} className="aspect-16/11 journal-stacked:aspect-3/2" />
      <div className="flex flex-col justify-center p-8 journal-narrow:p-5">
        <p className="m-0 mb-3 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong">
          Featured
        </p>
        <h2 className="m-0 font-[family-name:var(--sz-font-display)] text-story-h2-sm font-normal leading-tight tracking-tight text-heading text-balance">
          {post.title}
        </h2>
        <p className="m-0 mt-3.5 text-control leading-relaxed text-muted [text-wrap:pretty]">
          {post.excerpt}
        </p>
        <Meta post={post} />
      </div>
    </Link>
  );
}

export function PostCard({ post }: { post: PostCardData }) {
  return (
    <Link href={postHref(post.slug)} className={cardClass}>
      <Cover post={post} className="aspect-3/2" />
      <div className="p-[18px] pb-5">
        <h3 className="m-0 font-[family-name:var(--sz-font-display)] text-story-card-title font-medium leading-tight text-heading [text-wrap:pretty]">
          {post.title}
        </h3>
        <p className="m-0 mt-2.5 line-clamp-2 text-control-sm leading-relaxed text-muted">
          {post.excerpt}
        </p>
        <Meta post={post} />
      </div>
    </Link>
  );
}

import Link from "next/link";
import { Icon, Prose } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FeatureCard, StoryBlock, StoryPage as StoryPageData } from "@/lib/content-pages/types";
import { ContentKicker } from "./policy-page";
import { renderInline } from "./inline";

/**
 * The brand pages — Sazuna Story.dc.html.
 *
 * About, craftsmanship, certification and stores are one component over a block
 * union, the way the spec builds them.
 *
 * The spec opens with a 16:6 photographic hero. There is no photography to put
 * in it — the Express pages carry none, and about.html records that its stock
 * imagery was removed rather than left in with alt text describing someone
 * else's hands. So every page uses the spec's own `noHero` variant: the same
 * eyebrow and title, set on the canvas rather than over an image. When real
 * atelier photography exists, the hero and the image column are the two places
 * it goes.
 */

const storyContainer = "mx-auto max-w-[var(--sz-story-container)] px-10 story-narrow:px-[18px]";

export function StoryPage({ page }: { page: StoryPageData }) {
  return (
    <div className="pb-24">
      <div className={storyContainer}>
        <header className="mx-auto max-w-[var(--sz-container-narrow)] pt-10 text-center">
          <div className="flex justify-center">
            <ContentKicker>{page.hero.eyebrow}</ContentKicker>
          </div>
          <h1 className="m-0 text-story-h2 font-normal tracking-tight text-heading text-balance story-stacked:text-story-h2-sm">
            {page.hero.title}
          </h1>
        </header>

        <p className="mx-auto mt-10 max-w-[var(--sz-container-narrow)] text-content-lead font-medium leading-relaxed text-lead [text-wrap:pretty]">
          {renderInline(page.hero.intro)}
        </p>
      </div>

      {page.blocks.map((block, index) => (
        <StoryBlockView key={index} block={block} />
      ))}
    </div>
  );
}

function StoryBlockView({ block }: { block: StoryBlock }) {
  switch (block.type) {
    /**
     * The spec pairs prose with a 4:3 image and alternates which side it sits
     * on. With no image there is no pair, so this runs as a single measured
     * column — a lone text column stretched across 1180px would be unreadable.
     */
    case "imageText":
      return (
        <section className={cn(storyContainer, "mt-[var(--sz-story-gap)]")}>
          <div className="max-w-[var(--sz-container-narrow)]">
            {block.eyebrow && <ContentKicker>{block.eyebrow}</ContentKicker>}
            <h2 className="m-0 mb-4 text-story-h2 font-normal tracking-tight text-heading story-stacked:text-story-h2-sm">
              {block.heading}
            </h2>
            <Prose measure="story">
              {block.body.map((paragraph, i) => (
                <p key={i}>{renderInline(paragraph)}</p>
              ))}
            </Prose>
          </div>
        </section>
      );

    /** Full-bleed oxblood band. The one place the page leaves the canvas. */
    case "statement":
      return (
        <section className="mt-[var(--sz-story-gap)] bg-primary-800">
          <div className={cn(storyContainer, "py-[72px] text-center")}>
            <p className="mx-auto m-0 max-w-[20ch] font-[family-name:var(--sz-font-display)] text-story-quote leading-snug text-white italic text-balance">
              &ldquo;{block.quote}&rdquo;
            </p>
            {block.attribution && (
              <p className="m-0 mt-5 font-mono text-xs tracking-wide text-accent">
                {block.attribution}
              </p>
            )}
          </div>
        </section>
      );

    case "features":
      return (
        <section className={cn(storyContainer, "mt-[var(--sz-story-gap)]")}>
          {(block.eyebrow || block.heading) && (
            <div className="mb-8 max-w-[var(--sz-container-narrow)]">
              {block.eyebrow && <ContentKicker>{block.eyebrow}</ContentKicker>}
              {block.heading && (
                <h2 className="m-0 text-story-h2 font-normal tracking-tight text-heading story-stacked:text-story-h2-sm">
                  {block.heading}
                </h2>
              )}
            </div>
          )}
          <div
            className={cn(
              "grid gap-[var(--sz-story-card-gap)]",
              // The spec draws three; four cards would leave a lone card on a
              // second row, so the count picks the track.
              block.cards.length % 3 === 0 ? "grid-cols-3" : "grid-cols-2",
              "story-stacked:grid-cols-2 story-narrow:grid-cols-1",
            )}
          >
            {block.cards.map((card) => (
              <FeatureCardView key={card.title} card={card} />
            ))}
          </div>
        </section>
      );

    case "links":
      return (
        <section className={cn(storyContainer, "mt-[var(--sz-story-gap-tight)]")}>
          <div className="grid gap-[var(--sz-story-card-gap)] grid-cols-2 story-narrow:grid-cols-1">
            {block.cards.map((card) => (
              <Link
                key={card.heading}
                href={card.action.href}
                className="group flex flex-col rounded-[var(--sz-radius-xl)] border border-line-soft bg-raised px-6 py-7 no-underline transition-colors duration-[var(--sz-dur)] hover:border-accent hover:no-underline"
              >
                <span className="font-[family-name:var(--sz-font-display)] text-story-card-title text-heading">
                  {card.heading}
                </span>
                <span className="mt-2 text-sm leading-relaxed text-muted">
                  {renderInline(card.body)}
                </span>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
                  {card.action.label}
                  <Icon
                    name="arrow-right"
                    size={15}
                    className="transition-transform duration-[var(--sz-dur)] group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      );

    case "cta":
      return (
        <section className={cn(storyContainer, "mt-[var(--sz-story-gap)]")}>
          <div className="rounded-[var(--sz-radius-xl)] bg-surface px-8 py-14 text-center">
            <h2 className="mx-auto m-0 max-w-[18ch] text-story-h2 font-normal tracking-tight text-heading text-balance story-stacked:text-story-h2-sm">
              {block.heading}
            </h2>
            {block.body && (
              <p className="mx-auto mt-3.5 max-w-[46ch] text-prose leading-relaxed text-muted">
                {renderInline(block.body)}
              </p>
            )}
            <StoryAction action={block.action} />
          </div>
        </section>
      );

    case "store":
      return <StoreCard block={block} className={cn(storyContainer, "mt-[var(--sz-story-gap)]")} />;
  }
}

function FeatureCardView({ card }: { card: FeatureCard }) {
  return (
    <div className="flex flex-col rounded-[var(--sz-radius-xl)] border border-line-soft bg-raised px-6 py-[26px]">
      <span className="inline-flex size-[var(--sz-story-icon)] items-center justify-center rounded-[var(--sz-radius-story-icon)] bg-primary-50 text-primary-700">
        {card.badge ? (
          <span className="font-mono text-control-sm font-medium">{card.badge}</span>
        ) : (
          card.icon && <Icon name={card.icon} size={22} strokeWidth={1.5} />
        )}
      </span>
      <h3 className="mt-[18px] mb-2 font-[family-name:var(--sz-font-display)] text-story-card-title font-medium text-heading">
        {card.title}
      </h3>
      <p className="m-0 text-sm leading-relaxed text-muted [text-wrap:pretty]">
        {renderInline(card.body)}
      </p>
      {card.action && (
        <Link
          href={card.action.href}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
        >
          {card.action.label}
          <Icon name="arrow-right" size={15} />
        </Link>
      )}
    </div>
  );
}

function StoryAction({ action }: { action: { label: string; href: string } }) {
  const className =
    "mt-6 inline-flex items-center gap-2.5 rounded-[var(--sz-radius-btn-lg)] bg-primary-700 px-7 text-control font-semibold text-white no-underline min-h-[52px] hover:bg-primary-800 hover:text-white hover:no-underline";

  if (/^https?:\/\//.test(action.href)) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {action.label}
        <Icon name="arrow-right" size={15} />
      </a>
    );
  }
  return (
    <Link href={action.href} className={className}>
      {action.label}
      <Icon name="arrow-right" size={15} />
    </Link>
  );
}

function StoreCard({
  block,
  className,
}: {
  block: Extract<StoryBlock, { type: "store" }>;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="grid overflow-hidden rounded-[var(--sz-radius-xl)] border border-line bg-raised grid-cols-2 story-stacked:grid-cols-1">
        <div className="px-8 py-8">
          <ContentKicker>Flagship store</ContentKicker>
          <h2 className="m-0 mb-5 font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
            {block.name}
          </h2>

          <dl className="m-0 flex flex-col gap-3.5 text-sm text-body">
            <StoreRow icon="pin" label="Address">
              {block.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </StoreRow>
            <StoreRow icon="clock" label="Opening hours">
              {block.hours.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </StoreRow>
            <StoreRow icon="phone" label="Phone">
              <a href={`tel:${block.phone.replace(/\s/g, "")}`} className="font-mono text-sm">
                {block.phone}
              </a>
            </StoreRow>
          </dl>

          <a
            href={block.directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-[var(--sz-radius-btn-lg)] bg-primary-700 px-5 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            <Icon name="pin" size={16} />
            Get directions
          </a>
        </div>

        {/* Lazy, and last in the DOM, so a third-party frame never blocks the
            copy a visitor actually came for. */}
        <iframe
          title={block.mapTitle}
          src={block.mapEmbedSrc}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="min-h-[320px] w-full border-0"
        />
      </div>
    </section>
  );
}

function StoreRow({
  icon,
  label,
  children,
}: {
  icon: "pin" | "clock" | "phone";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="flex-none pt-0.5 text-primary-700">
        <Icon name={icon} size={17} strokeWidth={1.6} />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="m-0 leading-relaxed">{children}</dd>
    </div>
  );
}

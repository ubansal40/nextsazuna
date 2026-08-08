import "server-only";

import { queryOne } from "./db";
import type { RowDataPacket } from "mysql2";

/**
 * Editable content blocks.
 *
 * `content_blocks` is a key → JSON store the admin writes to. Readers ask for a
 * key and get a parsed value, or null when the block is absent or unpublished.
 *
 * Every read is defensive: this is admin-authored JSON, so a malformed value
 * must degrade to "no content" rather than throwing and taking down a page that
 * would otherwise render perfectly well without it.
 */

interface ContentRow extends RowDataPacket {
  value: string | object | null;
}

export async function getContentBlock<T>(key: string): Promise<T | null> {
  let row: ContentRow | null;

  try {
    row = await queryOne<ContentRow>(
      "SELECT `value` FROM content_blocks WHERE `key` = ? AND is_published = 1 LIMIT 1",
      [key],
    );
  } catch (error) {
    /**
     * Content blocks are decoration — an announcement strip, a payment mark, a
     * category subheading. Every caller already handles their absence.
     *
     * Two situations depend on this not throwing. At build time there are no
     * database credentials by design (see .github/workflows/ci.yml), yet the
     * root layout reads two blocks, so prerendering `/_not-found` would fail
     * the whole build. And at runtime, a brief database outage should cost the
     * shell its announcement bar rather than turning every page into a 500.
     *
     * Catalog reads deliberately do not do this: a listing with no products is
     * a lie, and should fail loudly.
     */
    console.warn(`[content] "${key}" unavailable; rendering without it`, error);
    return null;
  }

  if (!row?.value) return null;

  // MariaDB stores JSON as LONGTEXT, so the driver may hand back either a
  // parsed object or the raw string depending on column type detection.
  if (typeof row.value === "object") return row.value as T;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/**
 * WhatsApp deep link for the floating chat button and the search dead end.
 *
 * The number and the prefilled message are admin-editable in `site_identity`.
 * Returns null when no number is configured — a `wa.me/` link with no number is
 * a broken link, and the shell would rather render nothing.
 */
export async function getWhatsAppHref(): Promise<string | null> {
  const identity = await getContentBlock<{
    whatsapp_number?: unknown;
    whatsapp_message?: unknown;
  }>("site_identity");

  const number =
    typeof identity?.whatsapp_number === "string"
      ? identity.whatsapp_number.replace(/\D/g, "")
      : "";
  if (!number) return null;

  const message =
    typeof identity?.whatsapp_message === "string" ? identity.whatsapp_message.trim() : "";

  return message
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${number}`;
}

/** Announcement bar, as the admin stores it. */
export interface AnnouncementBar {
  messages: string[];
  autoSlide: boolean;
  /** Milliseconds between messages. */
  interval: number;
}

/**
 * Copy shown in the strip above the header.
 *
 * The spec rotates through the messages one at a time, so the bar is useless
 * with an empty list — an absent, unpublished or malformed block returns null
 * and the shell renders no bar at all rather than an empty oxblood strip.
 */
export async function getAnnouncementBar(): Promise<AnnouncementBar | null> {
  const block = await getContentBlock<{
    messages?: unknown;
    auto_slide?: unknown;
    slide_interval_seconds?: unknown;
  }>("announcement_bar");
  if (!block) return null;

  const messages = Array.isArray(block.messages)
    ? block.messages.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    : [];
  if (messages.length === 0) return null;

  // A zero or missing interval would rotate every frame, so fall back to the
  // spec's 3.2s cadence and floor anything faster than a readable second.
  const seconds = Number(block.slide_interval_seconds);
  const interval = Number.isFinite(seconds) && seconds > 0 ? Math.max(seconds, 1) * 1000 : 3200;

  return {
    messages,
    autoSlide: block.auto_slide !== false && messages.length > 1,
    interval,
  };
}

/** Shop details the footer renders, from `site_identity`. */
export interface SiteContact {
  address: string | null;
  phone: string | null;
  /** "10:00–20:00", already joined. Null when either end is missing. */
  hours: string | null;
  social: { instagram: string | null; facebook: string | null; tiktok: string | null; youtube: string | null };
}

export async function getSiteContact(): Promise<SiteContact> {
  const identity = await getContentBlock<Record<string, unknown>>("site_identity");
  const str = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const social = (identity?.social ?? {}) as Record<string, unknown>;
  const opens = str(identity?.opens);
  const closes = str(identity?.closes);

  return {
    address: str(identity?.address),
    phone: str(identity?.phone),
    hours: opens && closes ? `${opens}–${closes}` : null,
    social: {
      instagram: str(social.instagram),
      facebook: str(social.facebook),
      tiktok: str(social.tiktok),
      youtube: str(social.youtube),
    },
  };
}

/** A payment method as the storefront may see it. */
export interface PaymentMethod {
  code: string;
  label: string;
}

/**
 * Enabled payment methods, projected down to what is safe to render.
 *
 * SECURITY: the `payment_methods` block stores live gateway credentials —
 * CyberSource and Khalti secret keys sit in the same JSON. Never hand that
 * object to a component: a Client Component would serialise the whole thing
 * into the RSC payload and publish the keys. This returns code and label only,
 * and every storefront reader must go through it rather than
 * `getContentBlock("payment_methods")`.
 */
export async function getEnabledPaymentMethods(): Promise<PaymentMethod[]> {
  const block = await getContentBlock<unknown>("payment_methods");
  if (!Array.isArray(block)) return [];

  return block.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const method = entry as Record<string, unknown>;
    if (!method.is_enabled) return [];
    const code = typeof method.code === "string" ? method.code : "";
    const label = typeof method.label === "string" ? method.label : "";
    return code && label ? [{ code, label }] : [];
  });
}

/** Editorial copy shown under a category title, keyed by category slug. */
export async function getCategoryIntro(slug: string): Promise<string | null> {
  const intros = await getContentBlock<Record<string, unknown>>("category_intros");
  const copy = intros?.[slug];
  return typeof copy === "string" && copy.trim() ? copy : null;
}

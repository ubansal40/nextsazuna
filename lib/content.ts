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
  const row = await queryOne<ContentRow>(
    "SELECT `value` FROM content_blocks WHERE `key` = ? AND is_published = 1 LIMIT 1",
    [key],
  );
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

/** Editorial copy shown under a category title, keyed by category slug. */
export async function getCategoryIntro(slug: string): Promise<string | null> {
  const intros = await getContentBlock<Record<string, unknown>>("category_intros");
  const copy = intros?.[slug];
  return typeof copy === "string" && copy.trim() ? copy : null;
}

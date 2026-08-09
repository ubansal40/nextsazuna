/**
 * Image queue policy — the decisions, with no database and no filesystem in them.
 *
 * Deliberately free of `import "server-only"` so `scripts/check-image-queue.mts`
 * can import it. Everything here answers a question the queue has to get right
 * and that is miserable to prove against a live table: is this failure worth
 * retrying, when may it be retried, is this claim still mine, what does the
 * operator get told.
 *
 * The state machine, matched to sazuna-unik 2's:
 *
 *     pending ──claim──▶ processing ──ok──▶ ready
 *        ▲                    │
 *        │                    ├──transient failure, attempts left──▶ pending
 *        │                    ├──permanent failure, or out of attempts──▶ failed
 *        └──retry / stale sweep──┘
 *
 *   cancelled is terminal and only ever set by a newer job superseding this one.
 */

export const IMAGE_JOB_STATUSES = ["pending", "processing", "ready", "failed", "cancelled"] as const;
export type ImageJobStatus = (typeof IMAGE_JOB_STATUSES)[number];

/** How many times one job may be claimed before it is failed for good. */
export const MAX_ATTEMPTS = 5;

/**
 * How long a job may sit in `processing` before it is assumed dead.
 *
 * The number that matters most here. Too short and a legitimately slow job (20
 * photos at 4000×3000) is reclaimed while it is still encoding; too long and a
 * product sits "Processing" for that long after a deploy killed its worker. Six
 * minutes clears a full 20-photo job with room to spare — measured against the
 * ~2s-per-photo the pipeline actually takes — while still recovering inside one
 * coffee. The claim token is what makes an over-eager reclaim harmless, so this
 * can be tuned down without risking a double write.
 */
export const STALE_CLAIM_SECONDS = Math.max(
  30,
  Number(process.env.IMAGE_JOB_STALE_SECONDS) || 360,
);

/**
 * Cap on the global backlog, as the reference has.
 *
 * Counted across pending + processing, not per product: the drain is
 * single-flight, so what protects the box is the total amount of sharp work
 * queued, not how it is distributed. A bulk import that blew past this would
 * otherwise spike memory until the process is OOM-killed — and on shared
 * hosting an OOM kill takes the storefront down with it, not just the admin.
 */
export const MAX_BACKLOG = Math.max(10, Number(process.env.IMAGE_JOB_MAX_BACKLOG) || 500);

/** `error_message` is VARCHAR(500); truncate rather than let the INSERT fail. */
export const ERROR_MAX_LENGTH = 500;

/**
 * How many jobs one drain claims before returning, and how long it may spend.
 *
 * The reference's worker is a daemon and simply keeps going. There is no daemon
 * here — a drain runs inside a request (or inside `after()`, which is still the
 * request's lifetime), so it must hand back control before the platform decides
 * the request has hung. It finishes the job in flight and then stops claiming;
 * the next trigger picks up the rest. That is why the queue has to be resumable
 * rather than run-to-completion.
 */
export const DRAIN_MAX_JOBS = Math.max(1, Number(process.env.IMAGE_JOB_DRAIN_MAX_JOBS) || 4);
export const DRAIN_BUDGET_MS = Math.max(1000, Number(process.env.IMAGE_JOB_DRAIN_BUDGET_MS) || 45_000);

/**
 * How many photos within one job are encoded at once.
 *
 * The reference's `PRODUCT_IMAGE_PROCESS_CONCURRENCY`, default 2. Each sharp
 * pipeline holds a decoded 4000×3000 bitmap plus a 1000² canvas, so this is a
 * memory dial, not a speed dial — 2 is what the shared-hosting box has headroom
 * for.
 */
export const IMAGE_CONCURRENCY = Math.max(1, Number(process.env.PRODUCT_IMAGE_PROCESS_CONCURRENCY) || 2);

/**
 * Backoff before a failed job may be claimed again, by attempt number.
 *
 * Bounded and short. The point is to ride out a blip — a raw file written but
 * not yet flushed, a connection dropped mid-deploy — not to implement a durable
 * retry service. A permanent failure never reaches here at all: it is failed on
 * the first attempt, so the admin sees the real reason immediately instead of
 * watching "Processing" for ten minutes before being told the file was a HEIC.
 */
const BACKOFF_SECONDS = [10, 30, 90, 240] as const;

export function retryDelaySeconds(attemptCount: number): number {
  const index = Math.max(0, Math.floor(attemptCount) - 1);
  return BACKOFF_SECONDS[Math.min(index, BACKOFF_SECONDS.length - 1)];
}

/**
 * A failure that retrying cannot fix.
 *
 * An unreadable file is the whole reason this distinction exists. `sharp`
 * reports every input it cannot decode identically, so without a marker the
 * queue treats "this is a HEIC and this build has no libheif" the same as "the
 * disk was briefly unavailable" — and retries the first four more times before
 * telling anyone. Thrown by the pipeline's own format guard.
 */
export class PermanentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentImageError";
  }
}

/** Raised when the backlog cap is hit. The save is refused, not silently dropped. */
export class ImageQueueFullError extends Error {
  readonly pending: number;
  constructor(pending: number) {
    super(
      `Image processing is backed up (${pending} photos queued). ` +
        "The product wasn't saved — try again in a few minutes.",
    );
    this.name = "ImageQueueFullError";
    this.pending = pending;
  }
}

export function truncateJobError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "Image processing failed.");
  return (message.trim() || "Image processing failed.").slice(0, ERROR_MAX_LENGTH);
}

export function isPermanentFailure(error: unknown): boolean {
  return error instanceof PermanentImageError;
}

export interface FailurePlan {
  /** Where the job lands. */
  status: Extract<ImageJobStatus, "pending" | "failed">;
  /** Seconds to wait before it may be claimed again; 0 when terminal. */
  retryInSeconds: number;
  /** True when this is the end of the line for the job. */
  terminal: boolean;
  message: string;
}

/**
 * Decide what a failed attempt does to the job.
 *
 * `attemptCount` is the count AFTER the claim incremented it, matching the
 * reference — so the first run of a job arrives here with 1, and a job with
 * max_attempts 5 gets five encodes, not six.
 */
export function planFailure(input: {
  attemptCount: number;
  maxAttempts: number;
  error: unknown;
}): FailurePlan {
  const message = truncateJobError(input.error);
  const attempts = Math.max(1, Math.floor(input.attemptCount));
  const max = Math.max(1, Math.floor(input.maxAttempts));

  if (isPermanentFailure(input.error) || attempts >= max) {
    return { status: "failed", retryInSeconds: 0, terminal: true, message };
  }
  return {
    status: "pending",
    retryInSeconds: retryDelaySeconds(attempts),
    terminal: false,
    message,
  };
}

/**
 * Whether the queue still owes this product work.
 *
 * Drives the admin list's poll: while any loaded row is in one of these states
 * the screen keeps asking, and stops the moment none is. `null` (no job at all)
 * is not in-flight — most products have never had one.
 */
export function isJobInFlight(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

/** Whether a job in this state may be retried by the admin. */
export function isRetryable(status: string | null | undefined): boolean {
  return status === "failed";
}

/**
 * What the operator is told about a failed job.
 *
 * The stored `error_message` is written for whoever is reading the server log —
 * it names the file, its size and the sniffed format. That is the right detail
 * for diagnosis and the wrong thing to lead with on a screen, so the sentence
 * comes first and the diagnostic detail (the bracketed suffix the pipeline
 * appends) is dropped. Nothing here is a secret; it is an editing decision, not
 * a redaction.
 */
export function operatorFailureMessage(errorMessage: string | null | undefined): string {
  const raw = String(errorMessage ?? "").trim();
  if (!raw) return "The photos couldn't be processed.";
  const withoutDiagnostics = raw.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  return withoutDiagnostics || raw;
}

/** JSON encode/decode for the two url columns, tolerant of anything already stored. */
export function serializeJobUrls(urls: readonly string[]): string {
  return JSON.stringify(normalizeUrlList(urls));
}

export function parseJobUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  const trimmed = String(value).trim();
  if (!trimmed) return [];

  // Everything this app writes is a JSON array. A bare `/uploads/...` string is
  // tolerated because the reference stored one that way and the column may
  // outlive the migration — but ONLY when it actually looks like a path.
  // Anything else (truncated JSON, a stray object, a log line) is not a photo
  // list, and reading it as a one-item list would carry that garbage all the
  // way to a filesystem lookup before anyone noticed.
  if (!trimmed.startsWith("[")) {
    return trimmed.startsWith("/") ? normalizeUrlList([trimmed]) : [];
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? normalizeUrlList(parsed) : [];
  } catch {
    return [];
  }
}

/** Trim, drop empties, de-duplicate, preserve order. Order is the photo order. */
export function normalizeUrlList(value: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const url = typeof item === "string" ? item.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Run an async worker over a list with a fixed number in flight.
 *
 * The reference's `mapWithConcurrency`. Results keep input order regardless of
 * completion order — the photo at index 0 is the cover, so an order that
 * depends on which encode finished first would silently reshuffle a product's
 * gallery.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

import "server-only";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool, transaction } from "../db";
import { recordAdminAction } from "./audit";
import type { AdminContext } from "./rbac";
import {
  buildImageOverlays,
  createStagingDir,
  discardStagingDir,
  isRawUrl,
  pathForUrl,
  pathsForUrls,
  processProductImage,
  publishStagedImages,
  removeFiles,
  sniffImageFormat,
  stageProcessedImage,
  type StagedImage,
} from "./images";
import {
  DRAIN_BUDGET_MS,
  DRAIN_MAX_JOBS,
  IMAGE_CONCURRENCY,
  ImageQueueFullError,
  MAX_ATTEMPTS,
  MAX_BACKLOG,
  PermanentImageError,
  STALE_CLAIM_SECONDS,
  mapWithConcurrency,
  parseJobUrls,
  planFailure,
  serializeJobUrls,
  type ImageJobStatus,
} from "./image-queue";

/**
 * The product image queue — sazuna-unik 2's worker, ported to a runtime with no
 * worker.
 *
 * The reference runs a `setInterval` daemon inside its Express process: every
 * few seconds it reclaims stale claims, then claims and processes a batch. That
 * design is the reason the owner trusts it — a save returns immediately, a
 * crashed run is recovered, and a failure is retried rather than lost.
 *
 * None of that requires a daemon. It requires a queue whose state lives in the
 * database rather than in a running process, and something to turn the crank.
 * `output: standalone` gives us no daemon, so the crank is turned by requests:
 * `after()` on a save, an authenticated drain route the admin screen polls, and
 * the same route on a cron. `drainImageJobs` is written so that *any* number of
 * those firing at once, or none of them firing for an hour, still converges —
 * because on Hostinger the process really can be replaced mid-job (a deploy
 * repoints `hbuilds/current` and the old process keeps running against a
 * directory that is no longer current).
 *
 * What that costs, honestly: a job is only as prompt as the next trigger. If
 * nobody saves, nobody has the admin open, and no cron is configured, a job
 * left half-done by a deploy waits. That is the trade for having no daemon, and
 * it is why the drain route exists and why the report asks for a cron entry.
 */

const CLAIM_TOKEN_BYTES = 16; // 32 hex chars — the column is CHAR(32).

interface JobRow extends RowDataPacket {
  id: number;
  product_id: number;
  sku: string;
  input_image_urls: string;
  desired_is_active: number;
  status: ImageJobStatus;
  attempt_count: number;
  max_attempts: number;
  claim_token: string | null;
}

/** A job this process has successfully claimed, with the token proving it. */
interface ClaimedJob {
  id: number;
  productId: number;
  sku: string;
  rawUrls: string[];
  desiredActive: number;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string;
}

/* --- enqueue --------------------------------------------------------------- */

/**
 * Enqueue a processing job for a product's raw uploads.
 *
 * Runs inside the caller's transaction — the same one that wrote the product
 * and forced it to draft — so the product and the promise to process its photos
 * commit together. There is no window in which a product is saved with raw
 * photos and no job to turn them into images.
 *
 * Every earlier unfinished job for the product is superseded first, including
 * `failed` ones. The reference does this too, and it matters more than it
 * looks: without it, re-saving a product whose photos failed leaves the old
 * failed row as the latest for some orderings, and the list keeps reporting
 * "Failed" for a product that is now processing fine.
 */
export async function enqueueImageJob(
  connection: PoolConnection,
  input: { productId: number; sku: string; rawUrls: string[]; desiredActive: boolean },
): Promise<number> {
  const [backlog] = await connection.execute<(RowDataPacket & { pending: number })[]>(
    "SELECT COUNT(*) AS pending FROM product_image_jobs WHERE status IN ('pending','processing')",
  );
  const pending = Number(backlog[0]?.pending ?? 0);
  if (pending >= MAX_BACKLOG) throw new ImageQueueFullError(pending);

  await connection.execute(
    `UPDATE product_image_jobs
        SET status = 'cancelled',
            error_message = 'Superseded by a newer upload.',
            claim_token = NULL,
            next_attempt_at = NULL
      WHERE product_id = ? AND status IN ('pending','processing','failed')`,
    [input.productId],
  );

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO product_image_jobs
       (product_id, sku, input_image_urls, desired_is_active, status, attempt_count, max_attempts)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    [
      input.productId,
      input.sku,
      serializeJobUrls(input.rawUrls),
      input.desiredActive ? 1 : 0,
      MAX_ATTEMPTS,
    ],
  );
  return result.insertId;
}

/* --- claim ----------------------------------------------------------------- */

/**
 * Flip claims that no live run can still be holding back to claimable.
 *
 * The recovery path, and the one that makes the whole thing safe on Hostinger.
 * `claimNextJob` only ever picks `pending` rows, so a row left `processing` by a
 * process that was replaced mid-encode would sit there forever — and it would
 * keep counting against the backlog cap, so enough of them eventually wedge the
 * queue for every product. A job that has been `processing` longer than
 * `STALE_CLAIM_SECONDS` cannot be live, so it goes back to `pending` (or to
 * `failed`, if the claim that died was its last attempt).
 *
 * `attempt_count` was already incremented when the claim was taken, so a job
 * that reliably kills the process is bounded by `max_attempts` exactly like any
 * other failure, rather than looping forever.
 */
export async function reclaimStaleJobs(): Promise<number> {
  const note = "Processing was interrupted — the server restarted before it finished.";

  const [exhausted] = await pool().execute<ResultSetHeader>(
    `UPDATE product_image_jobs
        SET status = 'failed', error_message = ?, claim_token = NULL, processed_at = NULL
      WHERE status = 'processing'
        AND processing_started_at IS NOT NULL
        AND processing_started_at < (NOW() - INTERVAL ? SECOND)
        AND attempt_count >= max_attempts`,
    [note, STALE_CLAIM_SECONDS],
  );

  const [retryable] = await pool().execute<ResultSetHeader>(
    `UPDATE product_image_jobs
        SET status = 'pending', error_message = ?, claim_token = NULL,
            processed_at = NULL, next_attempt_at = NOW()
      WHERE status = 'processing'
        AND processing_started_at IS NOT NULL
        AND processing_started_at < (NOW() - INTERVAL ? SECOND)
        AND attempt_count < max_attempts`,
    [note, STALE_CLAIM_SECONDS],
  );

  return exhausted.affectedRows + retryable.affectedRows;
}

/**
 * Claim the next job, or return null when there is nothing to do.
 *
 * `SELECT … FOR UPDATE` inside a transaction, as the reference does: the row is
 * locked for the moment between reading it and marking it `processing`, so two
 * concurrent drains cannot both take it. Plain `FOR UPDATE` rather than
 * `SKIP LOCKED` — the second is only available on newer MariaDB, and the
 * contention here is one row for a fraction of a millisecond.
 *
 * The claim also writes a fresh random token. That is this port's one real
 * addition to the reference's model, and it closes a race the reference has:
 * when a slow-but-alive job is reclaimed and then re-claimed by a second run,
 * the reference's finalize sees `status = 'processing'` and commits anyway, so
 * the abandoned run can overwrite the newer run's images. Matching on the token
 * means only the run that currently holds the claim can finish the job.
 */
async function claimNextJob(): Promise<ClaimedJob | null> {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<JobRow[]>(
      `SELECT id, product_id, sku, input_image_urls, desired_is_active,
              status, attempt_count, max_attempts, claim_token
         FROM product_image_jobs
        WHERE status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND attempt_count < max_attempts
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE`,
    );

    const row = rows[0];
    if (!row) {
      await connection.commit();
      return null;
    }

    const claimToken = randomBytes(CLAIM_TOKEN_BYTES).toString("hex");
    await connection.execute(
      `UPDATE product_image_jobs
          SET status = 'processing',
              claim_token = ?,
              attempt_count = attempt_count + 1,
              processing_started_at = NOW(),
              next_attempt_at = NULL,
              error_message = NULL
        WHERE id = ?`,
      [claimToken, row.id],
    );
    await connection.commit();

    return {
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      rawUrls: parseJobUrls(row.input_image_urls),
      desiredActive: Number(row.desired_is_active) ? 1 : 0,
      attemptCount: Number(row.attempt_count) + 1,
      maxAttempts: Number(row.max_attempts),
      claimToken,
    };
  } catch (error) {
    await connection.rollback().catch(() => {
      // Surface the original failure, not a rollback failure.
    });
    throw error;
  } finally {
    connection.release();
  }
}

/* --- process --------------------------------------------------------------- */

/**
 * Encode one claimed job's photos and publish them, or record why not.
 *
 * The order is deliberate: everything expensive and everything that can fail on
 * a file happens outside the transaction, into a staging directory. The
 * transaction then does nothing but re-check the claim, move the files, and
 * write four rows — so the database is never holding locks while sharp works,
 * and a product is never left pointing at images that were not written.
 */
async function processClaimedJob(job: ClaimedJob): Promise<boolean> {
  let stagingDir = "";
  const staged: StagedImage[] = [];

  try {
    const rawUrls = job.rawUrls.filter(isRawUrl);
    if (rawUrls.length === 0) throw new Error("This job has no raw photos to process.");

    // One SKU label and one logo for the whole job, as the reference does.
    const overlays = await buildImageOverlays(job.sku);
    stagingDir = await createStagingDir(job.id);

    const results = await mapWithConcurrency(rawUrls, IMAGE_CONCURRENCY, async (rawUrl, index) => {
      const filePath = pathForUrl(rawUrl);
      if (!filePath) throw new Error(`Photo ${index + 1} has an unusable location.`);
      const source = await readFile(filePath);
      try {
        const avif = await processProductImage(source, job.sku, overlays);
        return await stageProcessedImage(stagingDir, avif, job.sku, index);
      } catch (error) {
        // Name the file and its real format on the way out. When a job fails in
        // production the stored message is all anybody has, and "unsupported
        // image format" on its own says nothing about which photo or why.
        const detail = `${path.basename(filePath)}, ${source.length} bytes, detected ${sniffImageFormat(source)}`;
        const message = error instanceof Error ? error.message : "Image processing failed.";
        const annotated = `${message} [${detail}]`;
        // Re-throw as the SAME class. The permanent/transient distinction is
        // carried by the type, so wrapping a PermanentImageError in a plain
        // Error would quietly turn "this file can never be read" back into four
        // more attempts at reading it.
        throw error instanceof PermanentImageError
          ? new PermanentImageError(annotated)
          : new Error(annotated);
      }
    });
    staged.push(...results);

    const finalUrls = staged.map((item) => item.url);
    const published = await finalizeJob(job, staged, finalUrls);

    if (!published) {
      // The claim was taken from us, or the job was superseded. Everything we
      // encoded is now junk — the run that holds the claim will produce its own.
      await discardStagingDir(stagingDir);
      return false;
    }

    // Only once the product genuinely points at the new images: the raw
    // originals have no further purpose. The reference deletes them here too,
    // and on the Hostinger storage volume the alternative is a 4 MB JPEG per
    // photo accumulating forever beside the 60 KB AVIF that replaced it.
    await removeFiles(pathsForUrls(rawUrls));
    await discardStagingDir(stagingDir);
    return true;
  } catch (error) {
    await discardStagingDir(stagingDir);
    await failJob(job, error);
    return false;
  }
}

/**
 * Publish a job's output. Returns false when this run no longer owns the claim.
 *
 * The claim is re-read `FOR UPDATE` and matched on both status and token before
 * anything is written. A stale run therefore cannot resurrect a cancelled job,
 * cannot overwrite a newer run's images, and cannot flip a product back to
 * visible after somebody unpublished it — all three of which are reachable
 * without the token check.
 */
async function finalizeJob(
  job: ClaimedJob,
  staged: readonly StagedImage[],
  finalUrls: readonly string[],
): Promise<boolean> {
  let moved = false;
  try {
    return await transaction(async (conn) => {
      const [rows] = await conn.execute<JobRow[]>(
        `SELECT id, status, claim_token FROM product_image_jobs WHERE id = ? LIMIT 1 FOR UPDATE`,
        [job.id],
      );
      const row = rows[0];
      if (!row || row.status !== "processing" || row.claim_token !== job.claimToken) return false;

      await publishStagedImages(staged);
      moved = true;

      await conn.execute("DELETE FROM product_images WHERE product_id = ?", [job.productId]);
      for (let i = 0; i < finalUrls.length; i += 1) {
        await conn.execute(
          "INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)",
          [job.productId, finalUrls[i], i + 1],
        );
      }
      await conn.execute("UPDATE products SET image_url = ?, is_active = ? WHERE id = ?", [
        finalUrls[0] ?? null,
        job.desiredActive,
        job.productId,
      ]);
      await conn.execute(
        `UPDATE product_image_jobs
            SET status = 'ready', output_image_urls = ?, processed_at = NOW(),
                error_message = NULL, claim_token = NULL, next_attempt_at = NULL
          WHERE id = ?`,
        [serializeJobUrls(finalUrls), job.id],
      );
      return true;
    });
  } catch (error) {
    // The files were moved into the served directory and then the transaction
    // rolled back. Nothing references them, so take them back out — otherwise a
    // retry writes the same content-addressed names over orphans.
    if (moved) await removeFiles(staged.map((item) => item.finalPath));
    throw error;
  }
}

/** Record a failed attempt, and decide whether it is the last one. */
async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const plan = planFailure({
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    error,
  });

  await pool().execute(
    `UPDATE product_image_jobs
        SET status = ?, error_message = ?, claim_token = NULL, processed_at = NULL,
            next_attempt_at = ${plan.terminal ? "NULL" : "DATE_ADD(NOW(), INTERVAL ? SECOND)"}
      WHERE id = ? AND claim_token = ?`,
    plan.terminal
      ? [plan.status, plan.message, job.id, job.claimToken]
      : [plan.status, plan.message, plan.retryInSeconds, job.id, job.claimToken],
  );

  console.error(
    `[admin] image job ${job.id} (product ${job.productId}) attempt ${job.attemptCount}/${job.maxAttempts} failed` +
      `${plan.terminal ? " — giving up" : ` — retrying in ${plan.retryInSeconds}s`}: ${plan.message}`,
  );
}

/* --- drain ----------------------------------------------------------------- */

/**
 * Single-flight guard, per process.
 *
 * The reference's `imageJobWorkerRunning`. Two overlapping drains would be
 * *correct* — the claim is atomic — but they would double the sharp memory in
 * flight, which on shared hosting is the thing that gets the process killed.
 * On `globalThis` because Next re-evaluates modules on hot reload.
 */
declare global {
  var __sazunaImageDrain: Promise<DrainResult> | undefined;
}

export interface DrainResult {
  claimed: number;
  succeeded: number;
  failed: number;
  reclaimed: number;
  /** True when the drain stopped on its budget rather than an empty queue. */
  moreWaiting: boolean;
}

const IDLE: DrainResult = { claimed: 0, succeeded: 0, failed: 0, reclaimed: 0, moreWaiting: false };

/**
 * Process pending jobs until the queue is empty or the budget runs out.
 *
 * Safe to call from anywhere, as often as anyone likes — that is the point.
 * It never throws: every trigger is either fire-and-forget or a status poll,
 * and neither should be able to fail a save or a page because the queue had a
 * bad moment.
 */
export async function drainImageJobs(
  options: { maxJobs?: number; budgetMs?: number } = {},
): Promise<DrainResult> {
  if (globalThis.__sazunaImageDrain) return globalThis.__sazunaImageDrain;

  const run = (async (): Promise<DrainResult> => {
    const maxJobs = Math.max(1, options.maxJobs ?? DRAIN_MAX_JOBS);
    const budgetMs = Math.max(1000, options.budgetMs ?? DRAIN_BUDGET_MS);
    const deadline = Date.now() + budgetMs;
    const result: DrainResult = { ...IDLE };

    try {
      // Recovery first: a job stranded by a replaced process must become
      // claimable before we look for work, or a drain triggered right after a
      // deploy finds "nothing pending" and the stranded job waits for the next
      // one. Its own catch, so a reclaim hiccup never blocks the claim loop.
      try {
        result.reclaimed = await reclaimStaleJobs();
        if (result.reclaimed > 0) {
          console.warn(`[admin] reclaimed ${result.reclaimed} interrupted image job(s)`);
        }
      } catch (error) {
        console.error("[admin] stale image-job reclaim failed", error);
      }

      for (let i = 0; i < maxJobs; i += 1) {
        if (Date.now() >= deadline) {
          result.moreWaiting = true;
          break;
        }
        const job = await claimNextJob();
        if (!job) break;
        result.claimed += 1;
        if (await processClaimedJob(job)) result.succeeded += 1;
        else result.failed += 1;
      }

      if (!result.moreWaiting && result.claimed === maxJobs) {
        result.moreWaiting = await hasClaimableJobs();
      }
    } catch (error) {
      console.error("[admin] image job drain failed", error);
    }

    return result;
  })();

  globalThis.__sazunaImageDrain = run;
  try {
    return await run;
  } finally {
    globalThis.__sazunaImageDrain = undefined;
  }
}

async function hasClaimableJobs(): Promise<boolean> {
  const [rows] = await pool().execute<(RowDataPacket & { n: number })[]>(
    `SELECT 1 AS n FROM product_image_jobs
      WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      LIMIT 1`,
  );
  return rows.length > 0;
}

/* --- status + retry -------------------------------------------------------- */

export interface ImageJobState {
  productId: number;
  jobId: number;
  status: ImageJobStatus;
  error: string | null;
  attemptCount: number;
  maxAttempts: number;
  /** The processed image URLs, once there are any. */
  images: string[];
  /**
   * The product's visibility now the job has settled.
   *
   * Carried because "the job is ready" does not by itself mean "the product is
   * published": a job restores the visibility the product was saved with, and
   * editing a draft leaves it a draft. Without this the polling screen would
   * have to guess, and would show a draft flipping to Published the moment its
   * photos finished.
   */
  productIsActive: boolean;
}

/**
 * The latest job per product, for the screens that poll.
 *
 * Scoped to the product ids the caller is actually showing rather than the
 * whole table — the list loads 50 rows at a time and has no use for the state
 * of a job on page nine.
 */
export async function getImageJobStates(productIds: readonly number[]): Promise<ImageJobState[]> {
  const ids = Array.from(new Set(productIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool().query<
    (RowDataPacket & {
      id: number;
      product_id: number;
      status: ImageJobStatus;
      error_message: string | null;
      attempt_count: number;
      max_attempts: number;
      output_image_urls: string | null;
      is_active: number;
    })[]
  >(
    `SELECT j.id, j.product_id, j.status, j.error_message, j.attempt_count,
            j.max_attempts, j.output_image_urls, p.is_active
       FROM product_image_jobs j
       JOIN (SELECT product_id, MAX(id) AS latest
               FROM product_image_jobs
              WHERE product_id IN (${placeholders})
              GROUP BY product_id) g
         ON g.product_id = j.product_id AND g.latest = j.id
       JOIN products p ON p.id = j.product_id`,
    ids,
  );

  return rows.map((row) => ({
    productId: row.product_id,
    jobId: row.id,
    status: row.status,
    error: row.error_message,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    images: parseJobUrls(row.output_image_urls),
    productIsActive: Number(row.is_active) === 1,
  }));
}

export type RetryOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_failed" | "no_raw_files" };

/**
 * Re-queue a product's failed photo job, on the admin's say-so.
 *
 * The gap the inline pipeline left: a failure put the product in Draft with no
 * images and no way back except re-uploading the photos, which the operator may
 * no longer have to hand. The raw originals are still on disk precisely because
 * they are only deleted on success, so a retry has something to work from.
 *
 * Attempts are reset rather than continued. This is a person deciding to try
 * again — usually after fixing whatever caused it — so starting a fresh budget
 * is what they mean, and the alternative (a retry button that does nothing
 * because the counter is spent) is worse than no button.
 */
export async function retryImageJob(admin: AdminContext, productId: number): Promise<RetryOutcome> {
  const outcome = await transaction(async (conn) => {
    const [rows] = await conn.execute<JobRow[]>(
      `SELECT id, product_id, sku, input_image_urls, desired_is_active,
              status, attempt_count, max_attempts, claim_token
         FROM product_image_jobs
        WHERE product_id = ?
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [productId],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: "not_found" } as const;
    if (row.status !== "failed") return { ok: false, reason: "not_failed" } as const;

    // A retry with no surviving raw files would claim, fail, and land back
    // here — better to say so than to loop the operator through it. The check
    // is `existsSync`, not just "the job listed some": raw files are deleted on
    // success and a deploy can move the storage root, so the URL surviving in
    // the row proves nothing about the bytes surviving on disk.
    const rawPaths = pathsForUrls(parseJobUrls(row.input_image_urls).filter(isRawUrl));
    if (!rawPaths.some((filePath) => existsSync(filePath))) {
      return { ok: false, reason: "no_raw_files" } as const;
    }

    await conn.execute(
      `UPDATE product_image_jobs
          SET status = 'pending', attempt_count = 0, error_message = NULL,
              claim_token = NULL, next_attempt_at = NULL, processed_at = NULL
        WHERE id = ?`,
      [row.id],
    );

    await recordAdminAction(conn, admin, {
      action: "product.images.retry",
      resourceType: "product",
      resourceId: productId,
      metadata: { job_id: row.id, sku: row.sku, previous_attempts: Number(row.attempt_count) },
    });

    return { ok: true } as const;
  });

  return outcome;
}

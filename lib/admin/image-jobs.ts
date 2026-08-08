import "server-only";

import { readFile } from "node:fs/promises";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool, transaction } from "../db";
import {
  processProductImage,
  storeProcessedImage,
  pathForUrl,
  isRawUrl,
} from "./images";

/**
 * The product image job flow — the reference's worker, adapted.
 *
 * `output: standalone` has no background process, so there is no daemon polling
 * a queue; the upload/save path calls `runImageJob` inline. The
 * `product_image_jobs` row is still kept — for status (the list shows a product
 * as "Processing"/"Failed" from it), for retries, and so the draft-until-ready
 * invariant is auditable: a product saved with raw photos is forced to draft,
 * and only restored to its intended visibility once the AVIFs are written.
 */

const MAX_ATTEMPTS = 5;

interface JobRow extends RowDataPacket {
  id: number;
  product_id: number;
  sku: string;
  input_image_urls: string;
  desired_is_active: number;
  status: string;
  attempt_count: number;
  max_attempts: number;
}

function parseUrls(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Enqueue a processing job for a product's raw uploads. Cancels any earlier
 * unfinished job for the same product first — only the latest set of photos
 * matters. Runs inside the caller's transaction (the same one that wrote the
 * product and forced it to draft), so the job and the draft commit together.
 */
export async function enqueueImageJob(
  connection: PoolConnection,
  input: { productId: number; sku: string; rawUrls: string[]; desiredActive: boolean },
): Promise<number> {
  await connection.execute(
    "UPDATE product_image_jobs SET status = 'cancelled' WHERE product_id = ? AND status IN ('pending','processing')",
    [input.productId],
  );
  const [result] = await connection.execute(
    `INSERT INTO product_image_jobs
       (product_id, sku, input_image_urls, desired_is_active, status, attempt_count, max_attempts)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    [input.productId, input.sku, JSON.stringify(input.rawUrls), input.desiredActive ? 1 : 0, MAX_ATTEMPTS],
  );
  return (result as { insertId: number }).insertId;
}

/**
 * Process one job to completion, inline. Claims it (so a double-fire is a no-op),
 * runs the sharp pipeline on each raw file, then in one transaction swaps in the
 * processed images and restores the product's intended visibility. On failure
 * the product stays a draft and the job is marked failed once attempts run out —
 * never a half-processed product live on the storefront.
 */
export async function runImageJob(jobId: number): Promise<{ ok: boolean; images?: string[] }> {
  // Claim: only a pending/failed job with attempts left is picked up, and the
  // atomic guard means two concurrent runs cannot both process it.
  const [claim] = await pool().execute(
    `UPDATE product_image_jobs
        SET status = 'processing', processing_started_at = NOW(), attempt_count = attempt_count + 1
      WHERE id = ? AND status IN ('pending','failed') AND attempt_count < max_attempts`,
    [jobId],
  );
  if ((claim as { affectedRows: number }).affectedRows === 0) return { ok: false };

  const [rows] = await pool().execute<JobRow[]>("SELECT * FROM product_image_jobs WHERE id = ? LIMIT 1", [jobId]);
  const job = rows[0];
  if (!job) return { ok: false };

  try {
    const rawUrls = parseUrls(job.input_image_urls).filter(isRawUrl);
    if (rawUrls.length === 0) throw new Error("Job has no raw input files.");

    const finalUrls: string[] = [];
    for (let i = 0; i < rawUrls.length; i += 1) {
      const filePath = pathForUrl(rawUrls[i]);
      if (!filePath) throw new Error(`Unresolvable raw url: ${rawUrls[i]}`);
      const source = await readFile(filePath);
      const avif = await processProductImage(source, job.sku);
      finalUrls.push(await storeProcessedImage(avif, job.sku, i));
    }

    await transaction(async (conn) => {
      await conn.execute("DELETE FROM product_images WHERE product_id = ?", [job.product_id]);
      for (let i = 0; i < finalUrls.length; i += 1) {
        await conn.execute(
          "INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)",
          [job.product_id, finalUrls[i], i + 1],
        );
      }
      await conn.execute("UPDATE products SET image_url = ?, is_active = ? WHERE id = ?", [
        finalUrls[0],
        job.desired_is_active,
        job.product_id,
      ]);
      await conn.execute(
        "UPDATE product_image_jobs SET status = 'ready', output_image_urls = ?, processed_at = NOW() WHERE id = ?",
        [JSON.stringify(finalUrls), jobId],
      );
    });

    return { ok: true, images: finalUrls };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Image processing failed";
    // Out of attempts → failed for good; otherwise leave it pending to retry.
    await pool().execute(
      `UPDATE product_image_jobs
          SET status = IF(attempt_count >= max_attempts, 'failed', 'pending'), error_message = ?
        WHERE id = ?`,
      [message, jobId],
    );
    console.error(`[admin] image job ${jobId} failed:`, message);
    return { ok: false };
  }
}

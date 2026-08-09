-- 0016_image_job_claims.sql
--
-- Makes the product image queue resumable.
--
-- `product_image_jobs` already carries the reference app's columns (status,
-- attempt_count, max_attempts, processing_started_at, error_message). What it
-- lacks is anything that survives the process dying mid-job — and on Hostinger
-- that is the normal case, not the edge case: a deploy repoints
-- `hbuilds/current` at a new version directory and the running process is
-- replaced, so a job claimed by the old process is stranded in `processing`
-- with nothing to pick it up.
--
-- Two columns fix that.
--
-- `claim_token` — a random per-claim id. The reference guards its finalize step
-- by re-reading the row `FOR UPDATE` and checking `status = 'processing'`, which
-- does not distinguish "still my claim" from "reclaimed and re-claimed by a
-- second run while I was encoding". The finalize here matches on the token as
-- well, so a run whose claim was stolen writes nothing and discards its output
-- instead of clobbering the newer run's images.
--
-- `next_attempt_at` — the earliest time a failed job may be retried. The
-- reference retries on the very next worker tick, which for a deterministic
-- failure burns all five attempts inside fifteen seconds. Here retries are
-- triggered by requests rather than a daemon, so a bounded backoff is what
-- keeps a transient failure (a raw file not yet visible, a DB blip during a
-- deploy) recoverable instead of terminal. NULL means "eligible now", so every
-- existing row stays claimable exactly as it is today.
--
-- Both are additive and nullable: nothing in the table changes meaning.

ALTER TABLE product_image_jobs
  ADD COLUMN claim_token CHAR(32) NULL AFTER max_attempts,
  ADD COLUMN next_attempt_at DATETIME NULL AFTER processing_started_at;

-- The claim query orders pending-before-retryable and filters on
-- `next_attempt_at`, so the existing (status, created_at, id) index no longer
-- covers it. This one does, and it is the hot path: every drain runs it.
ALTER TABLE product_image_jobs
  ADD INDEX idx_product_image_jobs_claim (status, next_attempt_at, id);

-- The stale-claim sweep scans `processing` rows by age. Without this it is a
-- full scan of the table on every drain.
ALTER TABLE product_image_jobs
  ADD INDEX idx_product_image_jobs_stale (status, processing_started_at);

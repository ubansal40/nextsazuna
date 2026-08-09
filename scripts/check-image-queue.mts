#!/usr/bin/env node
/**
 * Image queue policy checks.
 *
 * The queue's correctness lives in decisions, not in sharp: is this failure
 * worth retrying, when may it be retried, does a job ever exceed its attempt
 * budget, does a photo list survive a round trip through the database in the
 * order it was uploaded. Every one of those is miserable to prove against a
 * live table and trivial to prove here, which is why `lib/admin/image-queue.ts`
 * carries no `import "server-only"`.
 *
 * The one that matters most is the permanent/transient split. Get it wrong in
 * the safe direction and an unreadable photo shows "Processing" for ten minutes
 * before admitting defeat; get it wrong in the other and a blip during a deploy
 * is a terminal failure the operator has to notice and retry by hand.
 *
 * Run: npx tsx scripts/check-image-queue.mts
 */
import {
  ImageQueueFullError,
  MAX_ATTEMPTS,
  PermanentImageError,
  ERROR_MAX_LENGTH,
  isJobInFlight,
  isPermanentFailure,
  isRetryable,
  mapWithConcurrency,
  normalizeUrlList,
  operatorFailureMessage,
  parseJobUrls,
  planFailure,
  retryDelaySeconds,
  serializeJobUrls,
  truncateJobError,
} from "../lib/admin/image-queue";

const checks: [string, boolean][] = [];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* --- failure classification ------------------------------------------------ */

const transient = new Error("EBUSY: resource busy");
const permanent = new PermanentImageError("That file isn't a readable image (detected: heic).");

checks.push(
  ["a plain Error is transient", !isPermanentFailure(transient)],
  ["a PermanentImageError is permanent", isPermanentFailure(permanent)],
  ["a non-Error throw is treated as transient", !isPermanentFailure("boom")],
);

const firstTransient = planFailure({ attemptCount: 1, maxAttempts: MAX_ATTEMPTS, error: transient });
checks.push(
  ["a transient failure with attempts left goes back to pending", firstTransient.status === "pending"],
  ["...and is not terminal", firstTransient.terminal === false],
  ["...and waits before the next attempt", firstTransient.retryInSeconds > 0],
);

const firstPermanent = planFailure({ attemptCount: 1, maxAttempts: MAX_ATTEMPTS, error: permanent });
checks.push(
  ["a permanent failure fails on the FIRST attempt", firstPermanent.status === "failed"],
  ["...and is terminal", firstPermanent.terminal === true],
  ["...and schedules no retry", firstPermanent.retryInSeconds === 0],
  ["...and keeps the operator-facing reason", firstPermanent.message.includes("readable image")],
);

const lastAttempt = planFailure({
  attemptCount: MAX_ATTEMPTS,
  maxAttempts: MAX_ATTEMPTS,
  error: transient,
});
checks.push(
  ["a transient failure on the last attempt is terminal", lastAttempt.terminal === true],
  ["...and lands in failed", lastAttempt.status === "failed"],
);

// The budget must be exactly max_attempts encodes: attempt_count arrives here
// already incremented by the claim, so an off-by-one gives a sixth attempt.
const attemptsThatRetry = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1).filter(
  (n) => !planFailure({ attemptCount: n, maxAttempts: MAX_ATTEMPTS, error: transient }).terminal,
);
checks.push([
  `a job gets exactly ${MAX_ATTEMPTS} attempts, not ${MAX_ATTEMPTS + 1}`,
  attemptsThatRetry.length === MAX_ATTEMPTS - 1,
]);

// A job whose row was hand-edited to an absurd count must still terminate.
checks.push([
  "an attempt count past the budget is terminal, not negative-retried",
  planFailure({ attemptCount: 99, maxAttempts: MAX_ATTEMPTS, error: transient }).terminal === true,
]);
checks.push([
  "max_attempts of 1 means one attempt and no retry",
  planFailure({ attemptCount: 1, maxAttempts: 1, error: transient }).terminal === true,
]);

/* --- backoff --------------------------------------------------------------- */

const delays = [1, 2, 3, 4, 5, 20].map(retryDelaySeconds);
checks.push(
  ["backoff is strictly non-decreasing", delays.every((d, i) => i === 0 || d >= delays[i - 1])],
  ["backoff is always positive", delays.every((d) => d > 0)],
  ["backoff is bounded — it never runs away", Math.max(...delays) <= 600],
  ["a nonsensical attempt number still yields a usable delay", retryDelaySeconds(0) > 0],
);

/* --- error text ------------------------------------------------------------ */

const long = truncateJobError(new Error("x".repeat(5000)));
checks.push(
  [`a long message is truncated to the column width (${ERROR_MAX_LENGTH})`, long.length === ERROR_MAX_LENGTH],
  ["an empty message still says something", truncateJobError(new Error("   ")).length > 0],
  ["a null failure still says something", truncateJobError(null).length > 0],
  ["a thrown string survives", truncateJobError("disk full").includes("disk full")],
);

checks.push(
  [
    "the operator message drops the diagnostic suffix",
    operatorFailureMessage("That file isn't a readable image (detected: heic). [a.jpg, 12 bytes, detected heic]") ===
      "That file isn't a readable image (detected: heic).",
  ],
  [
    "a message that is ONLY diagnostics is kept rather than blanked",
    operatorFailureMessage("[a.jpg, 12 bytes]").length > 0,
  ],
  ["no message at all still reads as a sentence", operatorFailureMessage(null).length > 0],
);

/* --- state predicates ------------------------------------------------------ */

checks.push(
  ["pending is in flight", isJobInFlight("pending")],
  ["processing is in flight", isJobInFlight("processing")],
  ["ready is not in flight", !isJobInFlight("ready")],
  ["failed is not in flight", !isJobInFlight("failed")],
  ["cancelled is not in flight", !isJobInFlight("cancelled")],
  ["a product with no job at all is not in flight", !isJobInFlight(null)],
  ["only failed offers a retry", isRetryable("failed") && !isRetryable("ready") && !isRetryable("cancelled")],
  ["a cancelled job is never retried — a newer one superseded it", !isRetryable("cancelled")],
);

/* --- url lists ------------------------------------------------------------- */

const urls = ["/uploads/products/raw/a.jpg", "/uploads/products/raw/b.jpg"];
checks.push(
  ["a url list round-trips through the column", eq(parseJobUrls(serializeJobUrls(urls)), urls)],
  ["order is preserved — index 0 is the cover photo", parseJobUrls(serializeJobUrls(urls))[0] === urls[0]],
  ["duplicates collapse", eq(normalizeUrlList(["/a", "/a", "/b"]), ["/a", "/b"])],
  ["blanks and whitespace are dropped", eq(normalizeUrlList(["", "  ", "/a"]), ["/a"])],
  ["non-strings are dropped rather than stringified", eq(normalizeUrlList([null, 7, {}, "/a"]), ["/a"])],
  ["an empty column reads as no photos", eq(parseJobUrls(null), []) && eq(parseJobUrls(""), [])],
  ["malformed JSON reads as no photos rather than throwing", eq(parseJobUrls("{not json"), [])],
  ["a bare (pre-JSON) url column is tolerated", eq(parseJobUrls("/uploads/products/raw/a.jpg"), ["/uploads/products/raw/a.jpg"])],
  ["a JSON object (not an array) reads as no photos", eq(parseJobUrls('{"a":1}'), [])],
);

/* --- concurrency ----------------------------------------------------------- */

{
  const items = [10, 20, 30, 40, 50, 60, 70];
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency(items, 2, async (n, i) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    // Reverse the durations so completion order differs from input order —
    // otherwise "results are in input order" proves nothing.
    await new Promise((resolve) => setTimeout(resolve, (items.length - i) * 2));
    inFlight -= 1;
    return n * 2;
  });
  checks.push(
    ["concurrency: results keep INPUT order, not completion order", eq(out, items.map((n) => n * 2))],
    ["concurrency: the limit is respected", peak <= 2],
    ["concurrency: the limit is actually used", peak === 2],
  );

  checks.push(["concurrency: an empty list is a no-op", eq(await mapWithConcurrency([], 4, async () => 1), [])]);

  let rejected = false;
  try {
    await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("nope");
      return n;
    });
  } catch {
    rejected = true;
  }
  checks.push(["concurrency: one worker throwing rejects the whole batch", rejected]);
}

/* --- backlog refusal ------------------------------------------------------- */

const full = new ImageQueueFullError(500);
checks.push(
  ["the backlog refusal names the depth", full.message.includes("500")],
  ["...and says the product was not saved", /wasn't saved/i.test(full.message)],
  ["...and is catchable by type", full instanceof ImageQueueFullError && full instanceof Error],
);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ image queue checks FAILED — this policy decides whether a photo is ever retried.");
}
process.exit(failed ? 1 : 0);

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin/session";
import { authorizeSection } from "@/lib/admin/rbac";
import { drainImageJobs, getImageJobStates, type DrainResult, type ImageJobState } from "@/lib/admin/image-jobs";

/**
 * The image queue's crank and its status board — /admin/products/image-jobs.
 *
 *   GET  ?ids=1,2,3   what the queue currently says about those products
 *   POST ?ids=1,2,3   drain pending jobs, then report the same
 *
 * The reference app does not need this: it has a daemon, and the admin screens
 * only ever read a status the worker already produced. With no daemon, the
 * work has to be triggered by something request-shaped, and the two things that
 * reliably exist are an operator with the products screen open and a cron.
 * This route serves both, which is why draining and reporting are one endpoint —
 * the screen that wants to know is also the best available excuse to do the
 * work.
 *
 * A Route Handler rather than a Server Action because a cron can call it with
 * `curl`, and because it answers 401/403 as JSON: a poll wants a status code,
 * not the HTML of a login page. The RBAC gate is `products` either way — the
 * same section that governs saving the product these photos belong to.
 */

export const dynamic = "force-dynamic";

export type ImageJobsResponse =
  | { ok: true; jobs: ImageJobState[]; drained?: DrainResult }
  | { ok: false; error: string };

/**
 * A cron has no session cookie. When `IMAGE_JOB_DRAIN_TOKEN` is set, a matching
 * bearer token may drain — and *only* drain: it is not given the per-product
 * status read, because a shared secret in a crontab line is a weaker credential
 * than an admin session and should be able to do exactly one thing.
 *
 * Unset (the default) means no token path exists at all, rather than an empty
 * string that anything matches.
 */
function hasDrainToken(request: Request): boolean {
  const expected = process.env.IMAGE_JOB_DRAIN_TOKEN;
  if (!expected || expected.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // Compare a fixed-length digest-shaped pair: timingSafeEqual throws on a
  // length mismatch, and throwing is itself a length oracle.
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseIds(request: Request): number[] {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
}

async function authorize(): Promise<boolean> {
  const admin = await currentAdmin();
  return Boolean(admin && authorizeSection(admin, "products"));
}

/** Poll: what is the queue doing about these products? */
export async function GET(request: Request): Promise<Response> {
  if (!(await authorize())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const jobs = await getImageJobStates(parseIds(request));
  return NextResponse.json({ ok: true, jobs } satisfies ImageJobsResponse);
}

/** Turn the crank, then report. */
export async function POST(request: Request): Promise<Response> {
  const byToken = hasDrainToken(request);
  const bySession = byToken ? false : await authorize();
  if (!byToken && !bySession) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  // Never throws by contract, but a poll must not 500 the screen even if that
  // contract is broken later.
  let drained: DrainResult;
  try {
    drained = await drainImageJobs();
  } catch (error) {
    console.error("[admin] image job drain route failed", error);
    return NextResponse.json({ ok: false, error: "The queue didn't run." }, { status: 500 });
  }

  const jobs = bySession ? await getImageJobStates(parseIds(request)) : [];
  return NextResponse.json({ ok: true, jobs, drained } satisfies ImageJobsResponse);
}

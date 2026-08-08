/**
 * A fixed-window rate limiter, in process memory.
 *
 * Be clear about what this is and is not. It is a speed bump on the guest order
 * lookup, which is the one public endpoint that answers questions about real
 * orders. It is **not** the security boundary — that is the contact check in
 * lib/order-lookup.ts, backed by non-sequential order numbers and an identical
 * response for every kind of failure.
 *
 * Two limitations that matter before anyone relies on it:
 *
 *   - It is per process. The counters live in a module-scope Map, so they reset
 *     on every deploy and are useless the moment the app runs on more than one
 *     node. Sazuna deploys a single Node process behind LiteSpeed, which is the
 *     only reason this is worth having; a second instance needs Redis or the
 *     limiter needs deleting rather than being quietly trusted.
 *   - It keys on whatever the caller passes. See requestIp() for why the
 *     client-supplied end of `x-forwarded-for` cannot be one of those keys.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Entries are only ever dropped when their own key is next seen, so a burst of
 * unique keys would grow the map forever. This sweeps expired ones whenever it
 * gets large — cheap, and bounded by how many distinct keys are actually live.
 */
const SWEEP_AT = 5_000;

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  if (windows.size > SWEEP_AT) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Test seam. Never call this from application code. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * The caller's IP, as far as it can be trusted.
 *
 * `x-forwarded-for` is a list the client can prepend to: a request arriving
 * with `X-Forwarded-For: 1.2.3.4` leaves the proxy as `1.2.3.4, <real ip>`.
 * So the **last** hop is read, not the first — the first is whatever the client
 * claimed, and keying a limiter on it lets anyone reset their own counter by
 * inventing a new value per request.
 *
 * This is only sound because the reverse proxy is the sole ingress. Behind a
 * chain of proxies the right entry is a known offset from the end, not the end.
 */
export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    const last = hops.at(-1);
    if (last) return last;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

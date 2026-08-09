/**
 * A counting gate for the sharp pipeline.
 *
 * Processing moved from a queue into the upload request itself, which removed a
 * table, a cron and three classes of stranded-job bug — but it also removed the
 * one thing the queue was quietly doing well: it never ran more than
 * `IMAGE_CONCURRENCY` encodes at once. Without a replacement, five browser tabs
 * dropping five photos each is thirty concurrent sharp pipelines, and each one
 * holds a decoded 4032×3024 bitmap (~48 MB) plus a 1000² canvas. On shared
 * hosting that is not a slow page, it is an OOM kill — and the kill takes the
 * storefront down with the admin, because they are the same process.
 *
 * So the gate is the queue's memory ceiling without the queue. Requests past the
 * limit wait their turn rather than being refused, because waiting two seconds
 * is invisible and an error is not.
 *
 * Deliberately free of `import "server-only"` so `scripts/check-images.mts` can
 * exercise it — the ordering and the timeout cleanup are exactly the kind of
 * thing that looks obviously correct and is not.
 */

export class GateTimeoutError extends Error {
  constructor(waitMs: number) {
    super(`Waited ${Math.round(waitMs / 1000)}s for an image slot.`);
    this.name = "GateTimeoutError";
  }
}

export interface Gate {
  /** Run `task` once a slot is free. Rejects with GateTimeoutError if none comes. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** How many tasks are running right now. */
  active(): number;
  /** How many are queued behind them. */
  waiting(): number;
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * @param limit   how many tasks may run at once (floored at 1)
 * @param waitMs  how long a task may sit in the queue before giving up
 */
export function createGate(limit: number, waitMs: number): Gate {
  const max = Math.max(1, Math.floor(limit) || 1);
  const timeout = Math.max(1000, Math.floor(waitMs) || 1000);
  const queue: Waiter[] = [];
  let running = 0;

  function acquire(): Promise<void> {
    if (running < max) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null };
      // A waiter that gives up must leave the queue, or `release` later hands a
      // slot to a promise nobody is listening to and the slot is lost for the
      // lifetime of the process. That leak is silent and cumulative: it looks
      // like the box getting slower, not like a bug.
      waiter.timer = setTimeout(() => {
        const at = queue.indexOf(waiter);
        if (at >= 0) queue.splice(at, 1);
        reject(new GateTimeoutError(timeout));
      }, timeout);
      queue.push(waiter);
    });
  }

  function release(): void {
    const next = queue.shift();
    if (!next) {
      running -= 1;
      return;
    }
    // The slot passes straight from the finishing task to the next waiter, so
    // `running` is never decremented — decrementing and re-incrementing would
    // open a window for a fresh caller to take the slot ahead of a queued one.
    if (next.timer) clearTimeout(next.timer);
    next.resolve();
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    active: () => running,
    waiting: () => queue.length,
  };
}

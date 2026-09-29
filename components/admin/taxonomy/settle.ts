import { unstable_rethrow } from "next/navigation";

/**
 * Await a Server Action, and resolve to `fallback` if the call itself fails.
 *
 * The taxonomy screens' actions (and the homepage builder's save) report their
 * own refusals as `{ ok: false, error }`, but the call can still reject: the
 * connection drops, a deploy lands under an open tab, or the server fails
 * outside an action's own `try`. Inside `startTransition` that rejection
 * escapes to the error boundary and replaces the whole screen — and any open
 * drawer's unsaved draft — with an error page. Turned into an ordinary failure
 * here, it takes the path a refusal already takes: one toast, the draft kept,
 * an optimistic move rolled back.
 *
 * A redirect is not a failure. `requireSection` sends an expired session to the
 * login page by throwing, and `unstable_rethrow` hands that back to Next.
 */
export async function settle<T, F>(call: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await call;
  } catch (error) {
    unstable_rethrow(error);
    // A warning, not an error: it is handled, and the screen says so.
    console.warn("[admin] a server action call failed", error);
    return fallback;
  }
}

/** The failure result for a call that never came back. */
export const UNREACHABLE = {
  ok: false as const,
  error: "That didn't reach the server — check the connection and try again. Nothing on this screen was lost.",
};

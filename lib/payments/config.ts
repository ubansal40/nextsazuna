import "server-only";

import { getContentBlock } from "../content";

/**
 * Payment method configuration.
 *
 * SECURITY: the `payment_methods` content block stores live gateway
 * credentials — CyberSource `secret_key`/`access_key` and Khalti `secret_key`
 * sit in the same JSON as the labels. Nothing here hands that object out
 * wholesale. `listCheckoutMethods()` returns only what the browser may see;
 * `getGatewayCredentials()` is for server-side signing and its result must
 * never be returned from a Server Action or embedded in a page.
 *
 * The credentials belong in environment variables. Reading them from a
 * database row means every admin with content access can read live keys, and
 * they end up in database backups. Moving them is tracked separately; this
 * module is the single choke point that makes the move a one-file change.
 */

/** Methods this build can actually complete a payment with. */
export const IMPLEMENTED = ["cod", "esewa", "khalti", "cybersource"] as const;
export type MethodCode = (typeof IMPLEMENTED)[number];

/** What the checkout page is allowed to know about a method. */
export interface CheckoutMethod {
  code: MethodCode;
  label: string;
  description: string;
  /** Percent added to the order for choosing this method. */
  surchargePercent: number;
  /** Short tag shown on the right of the option row. */
  tag: string;
}

export interface GatewayCredentials {
  code: string;
  mode: "test" | "live";
  credentials: Record<string, string>;
}

interface RawMethod {
  code?: unknown;
  label?: unknown;
  description?: unknown;
  surcharge_percent?: unknown;
  mode?: unknown;
  is_enabled?: unknown;
  credentials?: unknown;
}

const TAG: Record<MethodCode, string> = {
  cod: "COD",
  esewa: "eSewa",
  khalti: "Khalti",
  cybersource: "+3%",
};

function isImplemented(code: string): code is MethodCode {
  return (IMPLEMENTED as readonly string[]).includes(code);
}

async function readBlock(): Promise<RawMethod[]> {
  const block = await getContentBlock<unknown>("payment_methods");
  return Array.isArray(block)
    ? block.filter((m): m is RawMethod => Boolean(m) && typeof m === "object")
    : [];
}

/**
 * Methods to offer at checkout.
 *
 * Enabled in the block AND implemented here. A method the admin enables but
 * this build cannot complete would be a dead end at the worst possible moment,
 * so it is simply not offered.
 */
export async function listCheckoutMethods(): Promise<CheckoutMethod[]> {
  const methods = await readBlock().then((all) =>
    all.flatMap((method) => {
      const code = typeof method.code === "string" ? method.code : "";
      if (!method.is_enabled || !isImplemented(code)) return [];

      const surcharge = Number(method.surcharge_percent);
      return [
        {
          code,
          label: typeof method.label === "string" ? method.label : code,
          description: typeof method.description === "string" ? method.description : "",
          surchargePercent: Number.isFinite(surcharge) && surcharge > 0 ? surcharge : 0,
          tag: TAG[code],
        },
      ];
    }),
  );

  // Cash first: it is the default in this market and the one that always works.
  return methods.sort((a, b) => (a.code === "cod" ? -1 : b.code === "cod" ? 1 : 0));
}

/** The surcharge for a method, as a percentage. Unknown methods add nothing. */
export async function surchargeFor(code: string): Promise<number> {
  const method = (await listCheckoutMethods()).find((m) => m.code === code);
  return method?.surchargePercent ?? 0;
}

/**
 * Gateway credentials, for signing. Server-side only — never return this.
 *
 * Environment variables win over the content block, so the credentials can be
 * moved out of the database without touching any caller.
 */
export async function getGatewayCredentials(code: string): Promise<GatewayCredentials | null> {
  const method = (await readBlock()).find((m) => m.code === code);
  if (!method) return null;

  const fromBlock =
    method.credentials && typeof method.credentials === "object"
      ? Object.fromEntries(
          Object.entries(method.credentials as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === "string" ? value : "",
          ]),
        )
      : {};

  const prefix = `SAZUNA_${code.toUpperCase()}_`;
  const fromEnv = Object.fromEntries(
    Object.entries(process.env)
      .filter(([key, value]) => key.startsWith(prefix) && value)
      .map(([key, value]) => [key.slice(prefix.length).toLowerCase(), value as string]),
  );

  /**
   * Mode comes from the method's own row, the way the Express app resolves it —
   * it is the founder's setting, editable in the admin, and per gateway.
   *
   * `SAZUNA_PAYMENTS_MODE` overrides it in one direction only: a deployment
   * can force `test`, so a development machine never puts a real transaction
   * through a live gateway. It cannot force `live`, because switching a
   * gateway on for real money should be a deliberate content change, not an
   * environment variable someone copies between hosts.
   */
  const override = process.env.SAZUNA_PAYMENTS_MODE?.trim().toLowerCase();
  const declared = typeof method.mode === "string" ? method.mode.toLowerCase() : "";
  const mode: "test" | "live" =
    override === "test" ? "test" : declared === "live" ? "live" : "test";

  return { code, mode, credentials: { ...fromBlock, ...fromEnv } };
}

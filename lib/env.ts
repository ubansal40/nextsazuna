import { z } from "zod";

/**
 * Environment contract.
 *
 * Parsed once, at first import, so a missing or malformed variable fails loudly
 * at boot with a readable message instead of surfacing as `undefined` inside a
 * database call three layers down.
 *
 * Nothing here may be imported from a Client Component — these are server-only
 * values and must never reach the browser bundle.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
  DB_NAME: z.string().min(1, "DB_NAME is required"),
  /** Shared hosting caps connections aggressively; keep this small. */
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Read the validated environment. Call this inside a function rather than at
 * module scope, so importing a module never triggers validation during a build
 * step that has no database credentials.
 */
export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

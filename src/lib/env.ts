/**
 * Central required-environment-variable list. Nothing in this codebase had
 * a shared validation point before this — DATABASE_URL and SESSION_SECRET
 * were each checked lazily, only the first time something actually touched
 * them (prisma.ts on first query, session.ts's secret() on first sign or
 * verify), so a missing var surfaced as a confusing runtime error deep
 * inside whatever code path hit it first, rather than failing at startup.
 *
 * `validateEnv()` is called once from src/instrumentation.ts when the
 * server process boots, so a missing var fails immediately and loudly,
 * naming every missing var at once. `env` gives typed access to the same
 * list afterward, still checking itself on each access (see `requireEnv`)
 * rather than trusting that startup validation already ran — importing
 * this module must stay side-effect-free (no eager `process.env` reads at
 * module scope), or a bare `import { validateEnv }` would risk throwing on
 * the first missing var before validateEnv() itself ever runs.
 */
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

function requireEnv(key: RequiredEnvVar): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
  }
}

/** Each property read re-validates itself on access (via requireEnv)
 * rather than being computed once at module load, so nothing here runs
 * merely from importing the module. */
export const env: Record<RequiredEnvVar, string> = new Proxy(
  {} as Record<RequiredEnvVar, string>,
  { get: (_target, key) => requireEnv(key as RequiredEnvVar) },
);

/**
 * Next.js calls register() once when the server process boots, before any
 * request is handled — the right place for startup validation, as opposed
 * to a required env var only surfacing as a confusing error the first time
 * some request path happens to touch it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}

import { existsSync } from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

/**
 * Resolves (and validates) the ffmpeg binary's real filesystem path —
 * shared by poster.ts and video-probe.ts, which used to each define their
 * own copy of this. @ffmpeg-installer/ffmpeg computes the path itself
 * (see next.config.ts's serverExternalPackages comment for why that can't
 * be trusted blindly once this app is bundled/deployed); this just
 * confirms the file it resolved to is actually there before anything
 * tries to spawn it.
 *
 * A missing binary here is always an environment/deployment problem, not
 * a per-clip one — loud and specific on purpose, same "don't swallow an
 * environment problem without a trace" stance as env.ts's requireEnv.
 * Callers in poster.ts/video-probe.ts still catch this and degrade
 * per-call (no poster, no verified duration) rather than crash, but see
 * checkFfmpegAtStartup below for making the underlying cause visible
 * *before* it first shows up as a confusing "couldn't verify that clip's
 * length" rejection on someone's upload.
 */
export function ffmpegPath(): string {
  const path = ffmpegInstaller.path;
  if (!existsSync(path)) {
    throw new Error(
      `ffmpeg binary not found at ${path} (from @ffmpeg-installer/ffmpeg). ` +
        `Clip processing (duration checks and poster extraction) can't run ` +
        `without it. Check that this platform (${process.platform}/${process.arch}) ` +
        `has a build and that node_modules actually installed it; in ` +
        `production, also check that next.config.ts's outputFileTracingIncludes ` +
        `actually shipped it into the deployed function — Vercel's file ` +
        `tracer doesn't always find this package's binary on its own.`,
    );
  }
  return path;
}

/**
 * Called once from src/instrumentation.ts when the server process boots —
 * same spot validateEnv() (lib/env.ts) already checks required env vars
 * from, so a missing ffmpeg binary is visible in the very first cold
 * start's logs instead of only surfacing the first time someone uploads a
 * clip and gets a generic rejection with the real cause buried in a
 * per-request log line.
 *
 * Deliberately doesn't throw and take the process down, unlike
 * validateEnv(): a missing DATABASE_URL or SESSION_SECRET breaks the
 * whole app, but a missing ffmpeg binary only breaks clip uploads
 * (poster.ts/video-probe.ts both already degrade a single failed call
 * without taking anything else down — see their own module comments), so
 * crashing every cold start over one feature's dependency would be a
 * bigger outage than the feature it's protecting.
 */
export function checkFfmpegAtStartup(): void {
  try {
    ffmpegPath();
  } catch (error) {
    console.error(
      "[startup] ffmpeg is unavailable — clip uploads (duration validation and posters) will fail until this is fixed:",
      error,
    );
  }
}

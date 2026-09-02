import { spawn } from "child_process";
import { ffmpegPath } from "@/lib/ffmpeg";

// Same reasoning as poster.ts's own timeout: a stalled network read against
// R2 shouldn't hang a clip upload indefinitely. ffmpeg only needs to reach
// the container's duration metadata here, not decode anything, so this is
// normally fast — the timeout exists for the unusual case, not the typical
// one.
const FFMPEG_TIMEOUT_MS = 15_000;

// ffmpeg prints a line like "Duration: 00:01:23.45, start: 0.000000, ..."
// to stderr while it opens the input, regardless of whether an output was
// given — this is the same info `ffprobe` would report, without needing a
// separate ffprobe binary (this project only bundles ffmpeg).
const DURATION_PATTERN = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d{2})/;

/**
 * Reads a video's real duration straight off its container metadata — the
 * authoritative check finalizeClipUploadAction enforces MAX_CLIP_DURATION_SEC
 * against, rather than the client-reported durationSec form field, which is
 * only ever a courtesy (used for poster-seeking hints) upstream of this and
 * trivial to lie about for anyone calling the action directly.
 *
 * `videoUrl` is a fetchable (signed) URL, not a local path — ffmpeg reads
 * just enough of it over HTTP Range requests to find the duration box,
 * same "don't download the whole clip" approach extractPosterFrame uses
 * for its own seeks. No output is requested, so this never decodes a
 * single frame.
 *
 * Resolves null if ffmpeg couldn't determine a duration at all (corrupt or
 * unreadable file) or timed out — callers treat that as "couldn't verify"
 * and reject rather than assume it's short enough. Only a genuinely
 * missing ffmpeg binary throws, same as poster.ts.
 */
export function probeVideoDurationSec(videoUrl: string): Promise<number | null> {
  const path = ffmpegPath();
  return new Promise((resolve) => {
    const child = spawn(path, ["-hide_banner", "-i", videoUrl], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;

    const finish = (result: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", () => finish(null));
    child.on("close", () => {
      // ffmpeg always exits non-zero here (no output was requested), which
      // is expected and not itself a failure — only the presence (or
      // absence) of a parseable Duration line matters.
      const match = stderr.match(DURATION_PATTERN);
      if (!match) {
        finish(null);
        return;
      }
      const [, hours, minutes, seconds, centiseconds] = match;
      const totalSeconds =
        Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(centiseconds) / 100;
      finish(Number.isFinite(totalSeconds) ? totalSeconds : null);
    });
  });
}

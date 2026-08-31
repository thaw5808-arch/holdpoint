import { spawn } from "child_process";
import { existsSync } from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";

// Plenty for a feed card or a <video poster>, nowhere near source
// resolution — matches the width the client-side capture used to export.
const POSTER_MAX_WIDTH = 480;

// How long a single ffmpeg attempt gets before it's killed and treated as
// a failed attempt — a stalled network seek against R2 shouldn't hang a
// clip upload (or the backfill script) indefinitely.
const FFMPEG_TIMEOUT_MS = 15_000;

// Same target as the old client-side capture: ~1s in, or earlier for a
// clip shorter than 2s. See seekCandidates for the retry timestamps.
const PRIMARY_SEEK_SECONDS = 1;

function ffmpegPath(): string {
  const path = ffmpegInstaller.path;
  if (!existsSync(path)) {
    // A missing binary here means the environment, not the clip — loud
    // and specific on purpose (see the module-level comment) rather than
    // silently falling back to something else. Callers still catch this
    // and store no poster rather than fail the whole upload, but it's
    // logged, never swallowed without a trace.
    throw new Error(
      `ffmpeg binary not found at ${path} (from @ffmpeg-installer/ffmpeg). ` +
        `Poster extraction can't run without it — check that this platform ` +
        `(${process.platform}/${process.arch}) has a build, or that ` +
        `node_modules actually installed it.`,
    );
  }
  return path;
}

/**
 * Timestamps (seconds) to try in order. The primary target mirrors the
 * old client-side capture — early enough to still be "this clip", clamped
 * to half the duration so a sub-2s clip never seeks past its own end.
 * Retries move later into the clip: a blank first frame is usually a
 * fade-in or a loading screen, so later is more likely to have picked up
 * real content by then. Deduped and clamped so a very short clip doesn't
 * end up trying the same timestamp three times.
 */
function seekCandidates(durationSec: number): number[] {
  const ceiling = Math.max(0, durationSec - 0.05);
  const candidates = [Math.min(PRIMARY_SEEK_SECONDS, durationSec / 2), durationSec * 0.5, durationSec * 0.85]
    .map((t) => Math.max(0, Math.min(t, ceiling)))
    .filter((t, i, arr) => arr.indexOf(t) === i);
  return candidates.length > 0 ? candidates : [0];
}

/** Runs ffmpeg against a single seek target, returning the exported JPEG's
 * bytes straight off stdout — no temp file to clean up. Resolves null on
 * any failure (bad exit code, killed by the timeout, nothing on stdout)
 * rather than rejecting, so callers can just move on to the next
 * timestamp. */
function extractFrameAt(path: string, videoUrl: string, seekSeconds: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const args = [
      // -ss before -i: seeks by demuxing straight to the target instead of
      // decoding from the start, so this only pulls the bytes it needs
      // over HTTP (the same Range-request seeking the app's own clip
      // route already relies on) rather than downloading the whole clip.
      "-ss",
      seekSeconds.toFixed(2),
      "-i",
      videoUrl,
      "-frames:v",
      "1",
      "-vf",
      `scale=${POSTER_MAX_WIDTH}:-2`,
      "-q:v",
      "3",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ];
    const child = spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const finish = (result: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        if (stderr) console.warn(`[poster] ffmpeg exited ${code} at ${seekSeconds}s:`, stderr.slice(-500));
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });
  });
}

/** A real captured frame is never perfectly flat — even a dark scene has
 * compression noise and gradient. sharp's per-channel stats() give the
 * min/max actually present; a blank (all-one-color) frame collapses that
 * range to ~0 regardless of which color it is. Confirmed live against a
 * real captured-blank poster (range 0) and a real captured photo from the
 * same clip (range 255). */
export async function isBlankImage(buffer: Buffer): Promise<boolean> {
  try {
    const { channels } = await sharp(buffer).stats();
    const range = Math.max(...channels.map((channel) => channel.max - channel.min));
    return range < 2;
  } catch {
    // Not even decodable isn't a usable poster either.
    return true;
  }
}

/**
 * Extracts a real poster frame from a video already sitting in storage —
 * given a fetchable (signed or public) URL rather than a local path, so
 * this works the same way whether it's called right after an upload
 * finishes or by the backfill script against an existing clip. Tries a
 * few timestamps in order, skipping any that come back blank (the same
 * decoder-hasn't-painted-yet failure the old client-side capture hit —
 * see upload-clip-form.tsx's history — can happen server-side too, just
 * as a seek that lands exactly on a fade-in or loading-screen frame
 * rather than a timing race). Resolves null once every candidate has
 * failed or come back blank; never throws for a per-clip failure — only
 * a genuinely missing ffmpeg binary throws, since that's an environment
 * problem, not a clip problem.
 */
export async function extractPosterFrame({
  videoUrl,
  durationSec,
}: {
  videoUrl: string;
  durationSec: number;
}): Promise<Buffer | null> {
  const path = ffmpegPath();
  for (const seek of seekCandidates(durationSec)) {
    const frame = await extractFrameAt(path, videoUrl, seek);
    if (!frame) continue;
    if (await isBlankImage(frame)) continue;
    return frame;
  }
  return null;
}

/**
 * Generates a poster for every published clip that has a real video but
 * no thumbnailUrl — the clips ffmpeg-based extraction (see
 * extractPosterFrame in src/lib/poster.ts) never got a chance to run on,
 * because they were uploaded before that existed, or ended up with a
 * corrupted/blank poster that was manually cleared afterward. Reuses the
 * exact same extraction + blank-frame check finalizeClipUploadAction runs
 * on a fresh upload, so a clip backfilled here is held to the same bar as
 * one uploaded today.
 *
 * Defaults to a dry run: it still runs the real ffmpeg extraction against
 * each clip's video (so the report reflects what would actually happen,
 * not just a list of candidates) but writes nothing — no object uploaded
 * to storage, no Clip row touched. Pass --commit to actually store the
 * results.
 *
 *   npx tsx scripts/backfill-clip-posters.ts            # dry run, reports only
 *   npx tsx scripts/backfill-clip-posters.ts --commit   # generate + store posters
 */
import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { extractPosterFrame } from "../src/lib/poster";
import { storage } from "../src/lib/storage";

async function main() {
  const commit = process.argv.includes("--commit");

  const targets = await prisma.clip.findMany({
    where: { thumbnailUrl: null, playbackUrl: { not: null } },
    select: { id: true, slug: true, title: true, userId: true, playbackUrl: true, durationSec: true },
    orderBy: { slug: "asc" },
  });

  if (targets.length === 0) {
    console.log("No clips with a video but no poster — nothing to do.");
    return;
  }

  console.log(
    `Found ${targets.length} clip(s) with no poster:\n` + targets.map((clip) => `  - ${clip.slug}  (${clip.title})`).join("\n"),
  );
  console.log(commit ? "\n--commit given — generated posters will be stored.\n" : "\nDry run — extraction runs for real, but nothing will be stored. Re-run with --commit to store.\n");

  let succeeded = 0;
  let noFrame = 0;
  let failed = 0;

  for (const clip of targets) {
    // playbackUrl can't actually be null here — the query above filters
    // it out — but the schema still types it as nullable.
    if (!clip.playbackUrl) continue;

    process.stdout.write(`${clip.slug}: extracting… `);
    try {
      const videoUrl = await storage.getUrl(clip.playbackUrl);
      const posterBuffer = await extractPosterFrame({ videoUrl, durationSec: clip.durationSec });

      if (!posterBuffer) {
        console.log("no usable frame found (every candidate timestamp came back blank).");
        noFrame++;
        continue;
      }

      if (!commit) {
        console.log(`got a real frame (${posterBuffer.byteLength} bytes) — not stored (dry run).`);
        succeeded++;
        continue;
      }

      const thumbnailKey = `clips/${clip.userId}/${randomUUID()}.jpg`;
      await storage.put(thumbnailKey, posterBuffer, "image/jpeg");
      await prisma.clip.update({ where: { id: clip.id }, data: { thumbnailUrl: thumbnailKey } });
      console.log(`stored ${thumbnailKey} (${posterBuffer.byteLength} bytes).`);
      succeeded++;
    } catch (error) {
      console.log(`FAILED — ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log(
    `\nDone: ${succeeded} succeeded, ${noFrame} had no usable frame, ${failed} errored.` +
      (commit ? "" : " Re-run with --commit to actually store these."),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

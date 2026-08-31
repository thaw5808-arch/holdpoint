/**
 * Removes seeded/demo clips that never got a real upload — the ones with
 * `playbackUrl: null`, which render the generated-gradient Thumb plus a
 * play-button placeholder in ClipStage instead of an actual video. Kept
 * as a script rather than a one-off command so this is repeatable (e.g.
 * after reseeding) and reviewable in a diff, same as verify-brackets.ts
 * and verify-logic.ts.
 *
 * Comment.clip and Reaction.clip (which is how both likes and saves are
 * stored — see clip.ts) are both `onDelete: Cascade` in schema.prisma, so
 * deleting the Clip row removes those automatically at the database
 * level. This script still counts them beforehand so the report below is
 * an honest per-table breakdown rather than a single opaque "N clips
 * deleted". There's no dependent "share" row to worry about: sharing a
 * clip creates a Message whose `payload` references the clip by a plain
 * JSON field, not a foreign key (see sendClipToUserAction in
 * src/lib/actions/clip.ts) — deleting the clip leaves that message's
 * payload pointing at a clip that no longer exists, the same accepted
 * gap that already exists whenever a clip is deleted any other way.
 *
 * Defaults to a dry run — it only reports what it would do. Pass
 * --commit to actually delete.
 *
 *   npx tsx scripts/delete-clips-without-video.ts            # report only
 *   npx tsx scripts/delete-clips-without-video.ts --commit   # delete
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const commit = process.argv.includes("--commit");

  const targets = await prisma.clip.findMany({
    where: { playbackUrl: null },
    select: { id: true, slug: true, title: true },
    orderBy: { slug: "asc" },
  });

  if (targets.length === 0) {
    console.log("No clips without a playbackUrl — nothing to do.");
    return;
  }

  const ids = targets.map((clip) => clip.id);
  const [commentCount, reactionCount] = await Promise.all([
    prisma.comment.count({ where: { clipId: { in: ids } } }),
    prisma.reaction.count({ where: { clipId: { in: ids } } }),
  ]);

  console.log(`Found ${targets.length} clip(s) with no playbackUrl:`);
  for (const clip of targets) console.log(`  - ${clip.slug}  (${clip.title})`);
  console.log(
    `\nDependent rows that would go with them: ${commentCount} comment(s), ${reactionCount} reaction(s) (likes + saves combined).`,
  );

  if (!commit) {
    console.log("\nDry run only — nothing deleted. Re-run with --commit to actually delete these.");
    return;
  }

  const deleted = await prisma.clip.deleteMany({ where: { id: { in: ids } } });

  console.log(
    `\nDeleted ${deleted.count} clip(s), cascading to ${commentCount} comment(s) and ${reactionCount} reaction(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

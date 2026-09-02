"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyMany } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/** Re-going-live within this long of the *previous* go-live doesn't
 * re-notify followers — see goLiveAction's own comment for how that's
 * detected without a dedicated column. */
const RENOTIFY_COOLDOWN_MS = 30 * 60_000;

export type GoLiveResult = { isLive: true } | { error: string };

/**
 * Flips the caller's own channel live, records the start time, and tells
 * every follower (STREAM_LIVE notification). There's no streamId
 * parameter to spoof — the channel is always the signed-in user's own
 * (Stream.userId is unique), the same shape as every other
 * caller-owns-the-thing action in this file.
 *
 * Two guards keep this from spamming followers:
 *  - Already live is a no-op (`stream.isLive` check below) — a second
 *    click, or two tabs racing, doesn't bump startedAt or notify again.
 *  - A stream that ended and went live again within RENOTIFY_COOLDOWN_MS
 *    skips the fan-out. That reuses the *previous* startedAt as the "when
 *    did we last tell people" marker rather than adding a column just for
 *    this — endStreamAction deliberately leaves startedAt alone when it
 *    flips isLive off (see its own comment), so it's still sitting there
 *    to compare against the next time this runs.
 *
 * The notification write itself follows notify.ts's own contract via
 * notifyMany: it happens after the Stream row is already committed, and a
 * failure there is only ever logged — it can't undo (or block returning)
 * the fact that the channel is now live.
 */
export async function goLiveAction(): Promise<GoLiveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const stream = await prisma.stream.findUnique({ where: { userId: user.id } });
  if (!stream) return { error: "You don't have a channel yet." };
  if (stream.isLive) return { isLive: true };

  const now = new Date();
  const recentlyNotified = stream.startedAt !== null && now.getTime() - stream.startedAt.getTime() < RENOTIFY_COOLDOWN_MS;

  await prisma.stream.update({
    where: { id: stream.id },
    data: { isLive: true, startedAt: now },
  });

  if (!recentlyNotified) {
    const followers = await prisma.follow.findMany({
      where: { followedId: user.id },
      select: { followerId: true },
    });
    await notifyMany(
      followers.map((follow) => follow.followerId),
      {
        kind: "STREAM_LIVE",
        title: `${user.displayName} is live`,
        body: `${user.displayName} just started streaming — ${stream.title}`,
        href: `/watch/${stream.slug}`,
      },
    );
  }

  revalidatePath("/", "layout");
  return { isLive: true };
}

export type EndStreamResult = { isLive: false } | { error: string };

/**
 * Flips the caller's own channel offline. Deliberately leaves `startedAt`
 * as-is rather than clearing it: nothing renders it once `isLive` is
 * false (every reader — StreamCard, WatchView, this page's own preview —
 * guards it behind `stream.isLive` first), and goLiveAction above needs
 * the last real value to still be there to detect a quick restart. No
 * notification on ending — the task this shipped for only ever asked to
 * tell followers when a channel *starts* streaming.
 */
export async function endStreamAction(): Promise<EndStreamResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const stream = await prisma.stream.findUnique({ where: { userId: user.id } });
  if (!stream) return { error: "You don't have a channel yet." };
  if (!stream.isLive) return { isLive: false };

  await prisma.stream.update({ where: { id: stream.id }, data: { isLive: false } });

  revalidatePath("/", "layout");
  return { isLive: false };
}

const updateStreamDetailsInput = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters").max(140, "Keep it under 140 characters"),
  // Empty string means "no game" — the category <select>'s own "No game"
  // option, mirrored from the same convention finalizeClipUploadAction
  // (actions/clip.ts) uses for a clip's optional game field.
  gameSlug: z.string().trim(),
  tags: z.string().trim().max(300, "Keep the tag list shorter."),
});

export type UpdateStreamDetailsResult = { saved: true } | { error: string };

/**
 * Saves the Studio dashboard's title/category/tags fields — previously a
 * plain `<input defaultValue=…>` with no form, no action, and no way for
 * anything typed there to ever reach the database. Category comes in as a
 * Game slug (a `<select>` of real games, not free text — Stream.gameId is
 * a foreign key, and matching a typed-in name against it would mean
 * either silently failing on a typo or fuzzy-matching an ambiguous one) —
 * validated by looking the slug up rather than trusted as-is.
 */
export async function updateStreamDetailsAction(
  title: string,
  gameSlug: string,
  tags: string,
): Promise<UpdateStreamDetailsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = updateStreamDetailsInput.safeParse({ title, gameSlug, tags });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details." };

  const stream = await prisma.stream.findUnique({ where: { userId: user.id } });
  if (!stream) return { error: "You don't have a channel yet." };

  let gameId: string | null = null;
  if (parsed.data.gameSlug) {
    const game = await prisma.game.findUnique({ where: { slug: parsed.data.gameSlug } });
    if (!game) return { error: "Pick a real game." };
    gameId = game.id;
  }

  // Comma-separated free text -> a short, deduped tag list, same shape
  // Stream.tags already holds (see seed.ts) — capped so this can't be used
  // to paste in an unbounded pile of tags.
  const tagList = [...new Set(parsed.data.tags.split(",").map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 5)
    .map((tag) => tag.slice(0, 24));

  await prisma.stream.update({
    where: { id: stream.id },
    data: { title: parsed.data.title, gameId, tags: tagList },
  });

  revalidatePath("/", "layout");
  return { saved: true };
}

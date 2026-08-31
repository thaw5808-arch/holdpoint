import { prisma } from "./prisma";
import { avatarSrc } from "./avatar-url";
import { clipPosterSrc, clipVideoSrc } from "./clip-video-url";

// Shared by the /clips page's initial server-rendered batch and
// loadMoreClipsAction's follow-up batches, so both ever only have one
// definition of "what a page of the feed looks like".
export const CLIP_FEED_BATCH_SIZE = 20;

export interface FeedClip {
  id: string;
  userId: string;
  slug: string;
  title: string;
  caption: string | null;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  game: string | null;
  views: number;
  playbackUrl?: string | null;
  posterUrl?: string | null;
  likes: number;
  saves: number;
  comments: number;
  liked: boolean;
  saved: boolean;
}

/** Seek-pagination cursor: the (views, createdAt, id) of the last clip
 * already sent to the client, in the feed's own sort order. Deliberately
 * not an offset — see fetchClipFeedPage below. */
export type ClipFeedCursor = { views: number; createdAt: string; id: string };

// id as a final tiebreaker so no two clips can ever tie on the full sort
// key — keyset pagination needs that to stay deterministic across pages.
const clipFeedOrderBy = [{ views: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * One page of the /clips feed, most-viewed-then-newest first. Cursor-based
 * (keyset) rather than offset-based: the WHERE clause is built from the
 * actual (views, createdAt, id) of the last clip already sent, not from
 * "skip N rows". A clip published or deleted anywhere in the list between
 * page loads can't shift what a later page returns that way — an offset
 * would either repeat a clip (something above the cursor got deleted,
 * shifting everything up a slot) or skip one (something got inserted
 * above it). And because the cursor carries the row's own values rather
 * than "look up this id's current row", it keeps working even if the clip
 * it was taken from has since been deleted.
 *
 * (views itself is a live counter — see recordClipView in actions/clip.ts
 * — so ranking by it can drift a little over a long scroll session if a
 * clip's view count crosses the cursor's snapshotted value between pages.
 * That's a property of ranking by a mutating counter, not of the
 * pagination strategy, and it's the same tradeoff any view-count-ranked
 * feed makes.)
 */
export async function fetchClipFeedPage({
  viewerId,
  cursor,
}: {
  viewerId: string;
  cursor?: ClipFeedCursor;
}): Promise<{ clips: FeedClip[]; nextCursor: ClipFeedCursor | null }> {
  const rows = await prisma.clip.findMany({
    where: {
      published: true,
      ...(cursor
        ? {
            OR: [
              { views: { lt: cursor.views } },
              { views: cursor.views, createdAt: { lt: new Date(cursor.createdAt) } },
              { views: cursor.views, createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    include: {
      user: { include: { profile: true } },
      game: true,
      _count: { select: { comments: true } },
    },
    orderBy: clipFeedOrderBy,
    take: CLIP_FEED_BATCH_SIZE,
  });

  if (rows.length === 0) return { clips: [], nextCursor: null };

  // The viewer's own like/save state, so a returning viewer sees their
  // prior reactions reflected instead of every clip starting unliked.
  const viewerReactions = await prisma.reaction.findMany({
    where: { userId: viewerId, clipId: { in: rows.map((clip) => clip.id) }, emote: { in: ["like", "save"] } },
    select: { clipId: true, emote: true },
  });
  const likedClipIds = new Set(
    viewerReactions.filter((reaction) => reaction.emote === "like").map((reaction) => reaction.clipId),
  );
  const savedClipIds = new Set(
    viewerReactions.filter((reaction) => reaction.emote === "save").map((reaction) => reaction.clipId),
  );

  const clips = rows.map((clip) => ({
    id: clip.id,
    userId: clip.userId,
    slug: clip.slug,
    title: clip.title,
    caption: clip.caption,
    displayName: clip.user.displayName,
    username: clip.user.username,
    avatarUrl: avatarSrc(clip.user.profile?.avatarUrl),
    game: clip.game?.shortName ?? null,
    views: clip.views,
    playbackUrl: clipVideoSrc(clip.playbackUrl),
    posterUrl: clipPosterSrc(clip.thumbnailUrl),
    likes: clip.likes,
    saves: clip.saves,
    comments: clip._count.comments,
    liked: likedClipIds.has(clip.id),
    saved: savedClipIds.has(clip.id),
  }));

  // A partial batch (fewer rows than asked for) means the table's
  // exhausted — no cursor, so the client knows not to ask again. A full
  // batch always gets one, even on the off chance the very next page
  // turns out empty; the client just finds that out on that next fetch.
  const last = rows[rows.length - 1];
  const nextCursor: ClipFeedCursor | null =
    rows.length === CLIP_FEED_BATCH_SIZE
      ? { views: last.views, createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  return { clips, nextCursor };
}

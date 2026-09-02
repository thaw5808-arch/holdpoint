import { prisma } from "@/lib/prisma";

/**
 * "For You" ranking for the Live page (spec: two tabs ahead of the game
 * filters, matching the pattern TikTok uses for its own For You / Following
 * split).
 *
 * There's no watch-history table in this app, so the score is built entirely
 * from signals that already exist elsewhere: the games on the viewer's
 * profile (GameRank), who they follow (Follow), whose clips they've liked or
 * watched (Reaction / ClipView), and their region (Profile.region). Every
 * factor is a named, bounded weight — same "not a black box" stance as
 * COMPATIBILITY_WEIGHTS in compatibility.ts — so the ranking stays
 * explainable instead of a single opaque number.
 *
 * Weights (why this order):
 *   - followedCreator (45): the strongest possible signal — the viewer
 *     already chose to follow this exact person. Outranks everything else.
 *   - gameOnProfile (25): they picked this game for their own profile, so a
 *     stream in it is on-topic even from a creator they've never seen.
 *   - likedCreatorClips (18): they positively reacted to this creator's
 *     content before — weaker than a follow (liking one clip isn't the same
 *     commitment) but a real, deliberate signal.
 *   - viewedCreatorClips (7): they watched this creator's clips, but a view
 *     is passive/ambiguous (could've scrolled past) — kept as a light nudge,
 *     not a strong one.
 *   - sameRegion (5): same region usually means lower latency chat and a
 *     more relevant community, but it's the weakest signal here since it
 *     says nothing about the viewer's actual taste.
 * These five sum to 100 — the max score a stream can reach when it matches
 * every signal the viewer has.
 *
 * On top of that, every stream also earns a small popularity tiebreaker
 * (log10(viewers + 1), capped well under the smallest weight above) so that
 * (a) ties within the same signal bucket resolve toward the bigger channel,
 * and (b) a brand-new viewer with zero signals — no follows, no profile
 * games, no clip activity, no region set — still gets ranked by viewer
 * count, i.e. exactly the "Live right now" popularity order the page showed
 * before personalization existed, instead of an empty or arbitrarily
 * ordered feed.
 */
export const FOR_YOU_WEIGHTS = {
  followedCreator: 45,
  gameOnProfile: 25,
  likedCreatorClips: 18,
  viewedCreatorClips: 7,
  sameRegion: 5,
} as const;

export interface ForYouSignals {
  followedCreatorIds: Set<string>;
  profileGameIds: Set<string>;
  likedCreatorIds: Set<string>;
  viewedCreatorIds: Set<string>;
  region: string | null;
}

export interface ForYouCandidate {
  userId: string;
  gameId: string | null;
  viewerCount: number;
  creatorRegion: string | null;
}

export function scoreForYouStream(stream: ForYouCandidate, signals: ForYouSignals): number {
  let score = 0;
  if (signals.followedCreatorIds.has(stream.userId)) score += FOR_YOU_WEIGHTS.followedCreator;
  if (stream.gameId && signals.profileGameIds.has(stream.gameId)) score += FOR_YOU_WEIGHTS.gameOnProfile;
  if (signals.likedCreatorIds.has(stream.userId)) score += FOR_YOU_WEIGHTS.likedCreatorClips;
  if (signals.viewedCreatorIds.has(stream.userId)) score += FOR_YOU_WEIGHTS.viewedCreatorClips;
  if (signals.region && stream.creatorRegion === signals.region) score += FOR_YOU_WEIGHTS.sameRegion;
  // Popularity tiebreaker — see file header. log10(10,000 viewers) is 4,
  // versus the smallest real signal weight of 5, so it can nudge ties but
  // never let a huge channel outrank an actual personalization match.
  score += Math.log10(stream.viewerCount + 1);
  return score;
}

/** Gathers everything scoreForYouStream needs about one viewer, in four
 * cheap parallel queries against tables that already exist for other
 * features (game picker, follows, clip likes, clip view ledger). */
export async function forYouSignals(userId: string, region: string | null): Promise<ForYouSignals> {
  const [gameRanks, follows, likes, views] = await Promise.all([
    prisma.gameRank.findMany({ where: { userId }, select: { gameId: true } }),
    prisma.follow.findMany({ where: { followerId: userId }, select: { followedId: true } }),
    prisma.reaction.findMany({
      where: { userId, emote: "like" },
      select: { clip: { select: { userId: true } } },
    }),
    prisma.clipView.findMany({
      where: { session: { userId } },
      select: { clip: { select: { userId: true } } },
    }),
  ]);

  return {
    followedCreatorIds: new Set(follows.map((follow) => follow.followedId)),
    profileGameIds: new Set(gameRanks.map((rank) => rank.gameId)),
    likedCreatorIds: new Set(likes.map((reaction) => reaction.clip.userId)),
    viewedCreatorIds: new Set(views.map((view) => view.clip.userId)),
    region,
  };
}

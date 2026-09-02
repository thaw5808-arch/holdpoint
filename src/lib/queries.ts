import { avatarSrc } from "./avatar-url";
import { prisma } from "./prisma";
import { relativeTime } from "./format";
import type { CurrentUser } from "./session";

export async function followedChannels(userId: string) {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      followed: {
        include: { channel: { include: { game: true } }, profile: true },
      },
    },
  });

  return follows
    .filter((follow) => follow.followed.channel)
    .map((follow) => ({
      slug: follow.followed.channel!.slug,
      name: follow.followed.displayName,
      username: follow.followed.username,
      avatarUrl: avatarSrc(follow.followed.profile?.avatarUrl),
      game: follow.followed.channel!.game?.shortName ?? null,
      isLive: follow.followed.channel!.isLive,
      viewers: follow.followed.channel!.viewerCount,
    }))
    .sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.viewers - a.viewers);
}

export async function liveStreams({
  take = 12,
  gameId,
  followedBy,
}: { take?: number; gameId?: string; followedBy?: string } = {}) {
  return prisma.stream.findMany({
    where: {
      isLive: true,
      ...(gameId ? { gameId } : {}),
      ...(followedBy ? { user: { followers: { some: { followerId: followedBy } } } } : {}),
    },
    include: { user: { include: { profile: true } }, game: true },
    orderBy: { viewerCount: "desc" },
    take,
  });
}

export type LiveStream = Awaited<ReturnType<typeof liveStreams>>[number];

export async function trendingClips(take = 12) {
  return prisma.clip.findMany({
    where: { published: true },
    include: { user: { include: { profile: true } }, game: true },
    orderBy: [{ views: "desc" }],
    take,
  });
}

export type TrendingClip = Awaited<ReturnType<typeof trendingClips>>[number];

export async function upcomingTournaments(take = 6) {
  return prisma.tournament.findMany({
    where: { status: { in: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "LIVE"] } },
    include: { game: true, _count: { select: { teams: true } } },
    orderBy: { startsAt: "asc" },
    take,
  });
}

export async function notificationFeed(userId: string, take = 12) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    href: row.href,
    unread: row.readAt === null,
    at: relativeTime(row.createdAt),
  }));
}

export async function searchSuggestions() {
  const [creators, games, teams, tournaments] = await Promise.all([
    prisma.stream.findMany({
      include: { user: true, game: true },
      orderBy: { viewerCount: "desc" },
      take: 6,
    }),
    prisma.game.findMany({ take: 5 }),
    prisma.team.findMany({ take: 4 }),
    prisma.tournament.findMany({ take: 3, orderBy: { startsAt: "asc" } }),
  ]);

  return [
    ...creators.map((stream) => ({
      kind: "Creator" as const,
      label: stream.user.displayName,
      href: `/watch/${stream.slug}`,
      meta: stream.isLive ? "Live" : undefined,
    })),
    ...games.map((game) => ({
      kind: "Game" as const,
      label: game.name,
      href: `/discover?game=${game.slug}`,
    })),
    ...teams.map((team) => ({
      kind: "Team" as const,
      label: team.name,
      href: `/teams/${team.slug}`,
      meta: team.tag,
    })),
    ...tournaments.map((tournament) => ({
      kind: "Tournament" as const,
      label: tournament.name,
      href: `/tournaments/${tournament.slug}`,
    })),
  ];
}

export async function unreadMessageCount(userId: string) {
  // Muted conversations (ConversationMember.mutedAt) are excluded outright
  // rather than counted-then-subtracted — their messages still land and
  // post normally, they just never contribute to this badge.
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, mutedAt: null },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;

  const counts = await Promise.all(
    memberships.map((membership) =>
      prisma.message.count({
        where: {
          conversationId: membership.conversationId,
          senderId: { not: userId },
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      }),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}

/** Snapshot in the shape the compatibility engine expects. */
export async function playerSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preference: true, ranks: { include: { game: true } } },
  });
  if (!user?.preference) return null;
  return {
    region: user.preference.region,
    languages: user.preference.languages,
    competitive: user.preference.competitive,
    activeHours: user.preference.activeHours,
    micRequired: user.preference.micRequired,
    preferredRoles: user.preference.preferredRoles,
    ranks: user.ranks.map((rank) => ({
      gameId: rank.gameId,
      tierIdx: rank.tierIdx,
      tierCount: rank.game.rankTiers.length,
      role: rank.role,
    })),
  };
}

export function isOnboarded(user: CurrentUser) {
  return user.onboardedAt !== null;
}

/** Teams the user can invite players to — owner or captain only, same
 * MANAGER_ROLES boundary inviteToTeamAction re-checks server-side. */
export async function managedTeams(userId: string) {
  const memberships = await prisma.teamMember.findMany({
    where: { userId, role: { in: ["OWNER", "CAPTAIN"] } },
    include: { team: { select: { id: true, name: true, slug: true } } },
  });
  return memberships.map((membership) => membership.team).sort((a, b) => a.name.localeCompare(b.name));
}

export type ManagedTeam = Awaited<ReturnType<typeof managedTeams>>[number];

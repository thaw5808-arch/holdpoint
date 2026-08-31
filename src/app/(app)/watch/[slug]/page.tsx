import { notFound } from "next/navigation";
import { WatchView } from "@/components/watch-view";
import { avatarSrc } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const stream = await prisma.stream.findUnique({
    where: { slug },
    include: {
      game: true,
      user: { include: { profile: true, _count: { select: { followers: true } } } },
      // Most recent 60 first (not the oldest 60 — the whole point of a
      // persisted chat is that it keeps growing past this cap), then
      // reversed below into chronological order for display.
      messages: {
        where: { deleted: false },
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: "desc" },
        take: 60,
      },
      polls: {
        where: { resolved: false },
        include: { options: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!stream) notFound();

  // Both directions of the relationship — "Follow back" (see followLabel
  // in follow-button.tsx) needs to know whether this channel's owner
  // already follows the viewer, not just whether the viewer follows them.
  const [followed, followsViewer, subs, mods] = await Promise.all([
    user
      ? prisma.follow.findUnique({
          where: { followerId_followedId: { followerId: user.id, followedId: stream.userId } },
        })
      : null,
    user
      ? prisma.follow.findUnique({
          where: { followerId_followedId: { followerId: stream.userId, followedId: user.id } },
        })
      : null,
    prisma.subscription.findMany({
      where: { creatorId: stream.userId },
      select: { viewerId: true },
    }),
    prisma.ban.findMany({ where: { scope: "CHANNEL", scopeId: stream.id }, select: { userId: true } }),
  ]);

  const subscriberIds = new Set(subs.map((sub) => sub.viewerId));
  const bannedIds = new Set(mods.map((ban) => ban.userId));
  const poll = stream.polls[0];

  return (
    <WatchView
      viewerId={user?.id ?? null}
      followed={Boolean(followed)}
      followsViewer={Boolean(followsViewer)}
      subscribed={user ? subscriberIds.has(user.id) : false}
      stream={{
        id: stream.id,
        userId: stream.userId,
        slug: stream.slug,
        title: stream.title,
        displayName: stream.user.displayName,
        username: stream.user.username,
        avatarUrl: avatarSrc(stream.user.profile?.avatarUrl),
        verified: stream.user.profile?.verified ?? false,
        game: stream.game?.name ?? null,
        gameSlug: stream.game?.slug ?? null,
        tags: stream.tags,
        viewers: stream.viewerCount,
        followers: stream.user._count.followers,
        startedAt: stream.startedAt?.toISOString() ?? null,
        isLive: stream.isLive,
        slowMode: stream.chatSlowMode,
        followersOnly: stream.followersOnly,
        subsOnly: stream.subsOnly,
        about:
          stream.user.profile?.bio ??
          "No channel description yet. Clips, VODs and the community stay up between streams.",
      }}
      chat={stream.messages
        .filter((message) => !bannedIds.has(message.userId))
        .reverse()
        .map((message) => ({
          id: message.id,
          username: message.user.username,
          displayName: message.user.displayName,
          body: message.body,
          pinned: message.pinned,
          createdAt: message.createdAt.toISOString(),
          badges: [
            ...(message.user.role === "MODERATOR" || message.user.role === "ADMIN"
              ? (["MOD"] as const)
              : []),
            ...(subscriberIds.has(message.userId) ? (["SUB"] as const) : []),
          ],
        }))}
      poll={
        poll
          ? {
              id: poll.id,
              kind: poll.kind,
              question: poll.question,
              options: poll.options.map((option) => ({
                id: option.id,
                label: option.label,
                votes: option.votes,
                points: option.points,
              })),
            }
          : null
      }
    />
  );
}

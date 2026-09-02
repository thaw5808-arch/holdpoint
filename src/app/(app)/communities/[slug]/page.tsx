import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { CommunityChannelFeed } from "@/components/community-channel-feed";
import { ClipsChannelComposer } from "@/components/community-clip-composer";
import { CommunityChannelNav } from "@/components/community-channel-nav";
import { CommunityPostComposer, JoinToPostPrompt } from "@/components/community-post-composer";
import { Emblem } from "@/components/emblem";
import { JoinCommunityButton } from "@/components/join-community-button";
import { Pill, SectionHeader } from "@/components/ui";
import { VoiceChannelView } from "@/components/voice-channel-view";
import { avatarSrc } from "@/lib/avatar-url";
import { CHANNEL_KIND_ICON } from "@/lib/channel-kind-icon";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { compactNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MOD_ROLES = new Set(["MODERATOR", "ADMIN", "OWNER"]);

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { slug } = await params;
  const { channel: channelName } = await searchParams;
  const user = await getCurrentUser();

  const community = await prisma.community.findUnique({
    where: { slug },
    include: {
      game: true,
      channels: { where: { deletedAt: null }, orderBy: { position: "asc" } },
      voiceRooms: { include: { participants: { include: { user: { include: { profile: true } } } } } },
      members: {
        include: { user: { include: { profile: true } } },
        orderBy: { points: "desc" },
        take: 12,
      },
      _count: { select: { members: true } },
    },
  });
  if (!community) notFound();

  const membership = user
    ? await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: user.id } },
      })
    : null;

  const active =
    community.channels.find((entry) => entry.name === channelName) ?? community.channels[0];
  const isVoiceChannel = active?.kind === "VOICE";
  const isClipsChannel = active?.kind === "CLIPS";

  // A voice channel has no posts UI at all (see VoiceChannelView below) —
  // no reason to query CommunityPost for one. `clip` is included
  // regardless of kind (cheap: it's null on every row outside a CLIPS
  // channel) rather than branching the query itself on isClipsChannel.
  //
  // Fetched newest-first so `take` grabs the most recent 20 rather than
  // the oldest 20, then reversed for display — the channel view reads
  // chat-style, oldest at the top and newest at the bottom right above the
  // composer (see CommunityChannelFeed), the opposite of the query order.
  const posts =
    active && !isVoiceChannel
      ? (
          await prisma.communityPost.findMany({
            where: { channelId: active.id, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { clip: { select: { id: true, slug: true, title: true, durationSec: true, thumbnailUrl: true } } },
          })
        ).reverse()
      : [];
  const authors = await prisma.user.findMany({
    where: { id: { in: posts.map((post) => post.authorId) } },
    include: { profile: true },
  });
  const authorById = new Map(authors.map((author) => [author.id, author]));

  const isModerator = Boolean(membership && MOD_ROLES.has(membership.role));
  const canPostHere = Boolean(active) && (active?.kind !== "ANNOUNCEMENT" || isModerator);

  const ActiveIcon = active ? CHANNEL_KIND_ICON[active.kind] : null;

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <header className="mb-5 flex flex-wrap items-start gap-4 border-b border-line pb-5">
        <Emblem seed={community.slug} tag={community.name.slice(0, 3)} size={60} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-xl uppercase tracking-[0.04em]">{community.name}</h1>
          <p className="mt-0.5 text-sm text-muted">{community.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {community.game && <Pill tone="signal">{community.game.name}</Pill>}
            <span className="tabular text-[0.6875rem] text-faint">
              {compactNumber(community._count.members)} members
            </span>
          </div>
        </div>
        <JoinCommunityButton communityId={community.id} joined={Boolean(membership)} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[190px_1fr_260px]">
        <nav aria-label="Channels">
          <CommunityChannelNav
            communityId={community.id}
            communitySlug={community.slug}
            channels={community.channels.map((entry) => ({ id: entry.id, name: entry.name, kind: entry.kind }))}
            activeChannelId={active?.id}
            isModerator={isModerator}
            legacyVoiceRooms={community.voiceRooms.map((room) => ({
              id: room.id,
              name: room.name,
              capacity: room.capacity,
              participants: room.participants.map((participant) => ({
                id: participant.id,
                speaking: participant.speaking,
                username: participant.user.username,
                displayName: participant.user.displayName,
                avatarUrl: avatarSrc(participant.user.profile?.avatarUrl),
              })),
            }))}
          />
        </nav>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            {ActiveIcon && <ActiveIcon size={15} className="text-faint" />}
            <h2 className="display text-sm uppercase tracking-[0.05em]">{active?.name}</h2>
            {active?.topic && <span className="truncate text-[0.75rem] text-faint">{active.topic}</span>}
          </div>

          {active && isVoiceChannel && <VoiceChannelView channelName={active.name} />}

          {active && !isVoiceChannel && (
            <div className="sticky top-[var(--header-h)] flex h-[calc(100dvh_-_var(--header-h)_-_var(--mobile-nav-clearance))] min-h-0 flex-col border border-line bg-surface lg:h-[calc(100dvh_-_var(--header-h))]">
              <CommunityChannelFeed
                key={active.id}
                viewerId={user?.id}
                emptyMessage={
                  isClipsChannel
                    ? `No clips shared in #${active.name} yet. Be the first.`
                    : `Nothing posted in #${active.name} yet. Say the first thing.`
                }
                posts={posts.map((post) => {
                  const author = authorById.get(post.authorId);
                  return {
                    id: post.id,
                    authorId: post.authorId,
                    body: post.body,
                    // undefined outside a CLIPS channel (no card at all);
                    // null when this post's clip has since been deleted
                    // (onDelete: SetNull — see schema.prisma) so the row
                    // renders a "removed" stub instead.
                    clip: isClipsChannel
                      ? post.clip && { ...post.clip, thumbnailUrl: clipPosterSrc(post.clip.thumbnailUrl) }
                      : undefined,
                    pinned: post.pinned,
                    createdAt: post.createdAt.toISOString(),
                    authorName: author?.displayName ?? "Member",
                    authorUsername: author?.username,
                    authorAvatarUrl: avatarSrc(author?.profile?.avatarUrl),
                    canDelete: Boolean(user && (post.authorId === user.id || isModerator)),
                    canReport: Boolean(user && post.authorId !== user.id),
                  };
                })}
                composer={
                  user ? (
                    membership ? (
                      isClipsChannel ? (
                        <ClipsChannelComposer
                          key={active.id}
                          channelId={active.id}
                          channelName={active.name}
                          canPostHere={canPostHere}
                        />
                      ) : (
                        <CommunityPostComposer
                          key={active.id}
                          channelId={active.id}
                          channelName={active.name}
                          canPostHere={canPostHere}
                        />
                      )
                    ) : (
                      <JoinToPostPrompt communityId={community.id} />
                    )
                  ) : (
                    <p className="border-t border-dashed border-line px-3 py-2.5 text-sm text-muted">
                      <Link href="/login" className="text-signal hover:underline">
                        Log in
                      </Link>{" "}
                      to post in #{active.name}.
                    </p>
                  )
                }
              />
            </div>
          )}
        </section>

        <aside>
          <SectionHeader eyebrow="Leaderboard" title="Most active" />
          <ol className="divide-y divide-line border border-line">
            {community.members.map((member, index) => (
              <li key={member.id} className="flex items-center gap-2 bg-surface px-2.5 py-2">
                <span className="tabular w-5 text-[0.6875rem] text-faint">{index + 1}</span>
                <Link href={`/u/${member.user.username}`} className="flex min-w-0 flex-1 items-center gap-2 hover:text-signal">
                  <Avatar
                    name={member.user.displayName}
                    seed={member.user.username}
                    size={26}
                    avatarUrl={avatarSrc(member.user.profile?.avatarUrl)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{member.user.displayName}</span>
                </Link>
                <span className="tabular text-[0.6875rem] text-signal">{member.points}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

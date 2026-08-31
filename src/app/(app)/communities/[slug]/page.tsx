import Link from "next/link";
import { notFound } from "next/navigation";
import { Hash, Megaphone, Mic, Volume2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CommunityPostComposer, JoinToPostPrompt } from "@/components/community-post-composer";
import { CommunityPostRow } from "@/components/community-post-row";
import { Emblem } from "@/components/emblem";
import { JoinCommunityButton } from "@/components/join-community-button";
import { Pill, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { compactNumber, relativeTime } from "@/lib/format";
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
      channels: { orderBy: { position: "asc" } },
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
  const posts = active
    ? await prisma.communityPost.findMany({
        where: { channelId: active.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];
  const authors = await prisma.user.findMany({
    where: { id: { in: posts.map((post) => post.authorId) } },
    include: { profile: true },
  });
  const authorById = new Map(authors.map((author) => [author.id, author]));

  const isModerator = Boolean(membership && MOD_ROLES.has(membership.role));
  const canPostHere = Boolean(active) && (active?.kind !== "ANNOUNCEMENT" || isModerator);

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
          <p className="eyebrow mb-2">Channels</p>
          <ul className="space-y-0.5">
            {community.channels.map((entry) => {
              const current = entry.id === active?.id;
              const Icon =
                entry.kind === "ANNOUNCEMENT" ? Megaphone : entry.kind === "VOICE" ? Volume2 : Hash;
              return (
                <li key={entry.id}>
                  <Link
                    href={`/communities/${community.slug}?channel=${entry.name}`}
                    className={`flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] ${
                      current ? "bg-surface text-text" : "text-muted hover:bg-surface"
                    }`}
                  >
                    <Icon size={13} className={current ? "text-signal" : ""} />
                    <span className="truncate">{entry.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="eyebrow mb-2 mt-5">Voice</p>
          <ul className="space-y-2">
            {community.voiceRooms.map((room) => (
              <li key={room.id} className="border border-line bg-surface p-2">
                <p className="flex items-center gap-1.5 text-[0.8125rem]">
                  <Mic size={12} className="text-signal" />
                  {room.name}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {room.participants.map((participant) => (
                    <li key={participant.id}>
                      <Link
                        href={`/u/${participant.user.username}`}
                        className="flex items-center gap-1.5 hover:text-signal"
                      >
                        <Avatar
                          name={participant.user.displayName}
                          seed={participant.user.username}
                          size={18}
                          avatarUrl={avatarSrc(participant.user.profile?.avatarUrl)}
                        />
                        <span
                          className={`truncate text-[0.6875rem] ${
                            participant.speaking ? "text-signal" : "text-faint"
                          }`}
                        >
                          {participant.user.displayName}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="tabular mt-1.5 text-[0.625rem] text-faint">
                  {room.participants.length}/{room.capacity}
                </p>
              </li>
            ))}
          </ul>
        </nav>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Hash size={15} className="text-faint" />
            <h2 className="display text-sm uppercase tracking-[0.05em]">{active?.name}</h2>
            {active?.topic && <span className="truncate text-[0.75rem] text-faint">{active.topic}</span>}
          </div>

          {active &&
            (user ? (
              membership ? (
                <CommunityPostComposer
                  key={active.id}
                  channelId={active.id}
                  channelName={active.name}
                  canPostHere={canPostHere}
                />
              ) : (
                <JoinToPostPrompt communityId={community.id} />
              )
            ) : (
              <p className="mb-3 border border-dashed border-line px-3 py-2.5 text-sm text-muted">
                <Link href="/login" className="text-signal hover:underline">
                  Log in
                </Link>{" "}
                to post in #{active.name}.
              </p>
            ))}

          <ul className="space-y-3">
            {posts.map((post) => {
              const author = authorById.get(post.authorId);
              return (
                <CommunityPostRow
                  key={post.id}
                  post={{
                    id: post.id,
                    body: post.body,
                    pinned: post.pinned,
                    createdAt: relativeTime(post.createdAt),
                    authorName: author?.displayName ?? "Member",
                    authorUsername: author?.username,
                    authorAvatarUrl: avatarSrc(author?.profile?.avatarUrl),
                    canDelete: Boolean(user && (post.authorId === user.id || isModerator)),
                    canReport: Boolean(user && post.authorId !== user.id),
                  }}
                />
              );
            })}
            {posts.length === 0 && (
              <li className="border border-dashed border-line p-6 text-center text-sm text-muted">
                Nothing posted in #{active?.name} yet. Say the first thing.
              </li>
            )}
          </ul>
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

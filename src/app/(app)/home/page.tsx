import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Hash, Megaphone } from "lucide-react";
import {
  ChannelStrip,
  ClipTile,
  StreamCard,
  TournamentRow,
  Thumb,
} from "@/components/cards";
import { Emblem } from "@/components/emblem";
import { PlayerCard } from "@/components/player-card";
import { EmptyState, Pill, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { playCompatibility } from "@/lib/compatibility";
import { compactNumber, duration } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { levelProgress } from "@/lib/progression";
import {
  liveStreams,
  managedTeams,
  playerSnapshot,
  trendingClips,
  upcomingTournaments,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [followedLive, otherLive, clips, tournaments, memberships, history, games, teams] =
    await Promise.all([
      liveStreams({ take: 6, followedBy: user.id }),
      liveStreams({ take: 8 }),
      trendingClips(10),
      upcomingTournaments(4),
      prisma.communityMember.findMany({
        where: { userId: user.id },
        include: {
          community: {
            include: {
              game: true,
              channels: { orderBy: { position: "asc" }, take: 3 },
              _count: { select: { members: true } },
            },
          },
        },
        take: 3,
      }),
      prisma.vOD.findMany({
        include: { user: true, game: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.game.findMany({ take: 8 }),
      managedTeams(user.id),
    ]);

  const featured = followedLive[0] ?? otherLive[0];
  const rest = [...followedLive.slice(1), ...otherLive.filter((s) => s.id !== featured?.id)]
    .filter((stream, index, all) => all.findIndex((s) => s.id === stream.id) === index)
    .slice(0, 6);

  // Recommended players — real scoring, not a shuffle.
  const me = await playerSnapshot(user.id);
  const candidates = await prisma.user.findMany({
    where: { id: { not: user.id }, preference: { isNot: null } },
    include: { preference: true, ranks: { include: { game: true } }, profile: true },
    take: 24,
  });
  const gameNames = Object.fromEntries(games.map((game) => [game.id, game.shortName]));
  const recommended = me
    ? candidates
        .map((candidate) => {
          const snapshot = {
            region: candidate.preference!.region,
            languages: candidate.preference!.languages,
            competitive: candidate.preference!.competitive,
            activeHours: candidate.preference!.activeHours,
            micRequired: candidate.preference!.micRequired,
            preferredRoles: candidate.preference!.preferredRoles,
            ranks: candidate.ranks.map((rank) => ({
              gameId: rank.gameId,
              tierIdx: rank.tierIdx,
              tierCount: rank.game.rankTiers.length,
              role: rank.role,
            })),
          };
          const result = playCompatibility(me, snapshot, gameNames);
          const topRank = candidate.ranks[0];
          return { candidate, result, topRank };
        })
        .filter((row) => row.topRank && row.result.score >= 45)
        .sort((a, b) => b.result.score - a.result.score)
        .slice(0, 3)
    : [];

  const progress = levelProgress(user.profile?.xp ?? 0);

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      {/* Answer the three questions immediately: what's live, what next, where are my people. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="eyebrow mb-1">
            {followedLive.length > 0
              ? `${followedLive.length} of your channels live`
              : "Nobody you follow is live"}
          </p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">
            {user.displayName.split(" ")[0]}, hold your ground
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <p className="tabular text-right text-[0.6875rem] text-faint">
              Level {progress.level} · {progress.into}/{progress.needed} XP
            </p>
            <span className="mt-1 block h-1 w-40 bg-line">
              <span className="block h-full bg-signal" style={{ width: `${progress.percent}%` }} />
            </span>
          </div>
          <Link href="/find-players" className="btn">
            Find players
          </Link>
        </div>
      </div>

      {followedLive.length > 0 && (
        <section className="mb-8">
          <p className="eyebrow mb-2">Following, live now</p>
          <ChannelStrip
            channels={followedLive.map((stream) => ({
              slug: stream.slug,
              displayName: stream.user.displayName,
              username: stream.user.username,
              avatarUrl: avatarSrc(stream.user.profile?.avatarUrl),
              game: stream.game?.shortName ?? null,
              viewers: stream.viewerCount,
            }))}
          />
        </section>
      )}

      <section className="mb-10">
        <SectionHeader eyebrow="Live now" title="Picked for you" action={{ href: "/live", label: "All live" }} />
        {featured ? (
          <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
            <StreamCard
              size="lg"
              stream={{
                slug: featured.slug,
                title: featured.title,
                displayName: featured.user.displayName,
                username: featured.user.username,
                avatarUrl: avatarSrc(featured.user.profile?.avatarUrl),
                game: featured.game?.name ?? null,
                tags: featured.tags,
                language: featured.language,
                viewers: featured.viewerCount,
                startedAt: featured.startedAt,
                isLive: featured.isLive,
              }}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {rest.slice(0, 4).map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={{
                    slug: stream.slug,
                    title: stream.title,
                    displayName: stream.user.displayName,
                    username: stream.user.username,
                    avatarUrl: avatarSrc(stream.user.profile?.avatarUrl),
                    game: stream.game?.shortName ?? null,
                    tags: stream.tags,
                    language: stream.language,
                    viewers: stream.viewerCount,
                    startedAt: stream.startedAt,
                    isLive: stream.isLive,
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Quiet right now"
            body="No channels are live in your games. Clips and communities keep running when streams don't."
            action={{ href: "/clips", label: "Watch clips" }}
          />
        )}
      </section>

      {/* Deliberately a dense table, not another card grid. */}
      {history.length > 0 && (
        <section className="mb-10">
          <SectionHeader eyebrow="Continue watching" title="Where you left off" />
          <div className="divide-y divide-line border border-line">
            {history.map((vod) => {
              const watchHref = `/watch/${vod.streamId}?vod=${vod.id}`;
              return (
                // Two destinations live in this row (the VOD, the creator's
                // profile), so it can't be one big wrapping Link the way it
                // used to be — nesting an <a> inside an <a> is invalid HTML.
                <div key={vod.id} className="tick flex items-center gap-3 bg-surface p-2.5 hover:bg-raised">
                  <Link href={watchHref} className="shrink-0">
                    <Thumb seed={vod.id} className="aspect-video w-28" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={watchHref} className="block truncate text-sm hover:text-signal">
                      {vod.title}
                    </Link>
                    <p className="tabular truncate text-[0.75rem] text-faint">
                      <Link href={`/u/${vod.user.username}`} className="hover:text-signal">
                        {vod.user.displayName}
                      </Link>{" "}
                      · {vod.game?.shortName} · {duration(vod.durationSec)}
                    </p>
                    <span className="mt-1.5 block h-[3px] w-full max-w-xs bg-line">
                      <span
                        className="block h-full bg-signal"
                        style={{ width: `${35 + ((vod.views % 5) * 12)}%` }}
                      />
                    </span>
                  </div>
                  <Link href={watchHref} aria-label="Continue watching" className="shrink-0">
                    <ArrowRight size={15} className="text-faint" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-10 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionHeader
            eyebrow="Your communities"
            title="Rooms with people in them"
            action={{ href: "/communities", label: "All" }}
          />
          {memberships.length === 0 ? (
            <EmptyState
              title="You haven't joined a community"
              body="Communities keep running between streams — that's where teams get built and scrims get organised."
              action={{ href: "/communities", label: "Browse communities" }}
            />
          ) : (
            <ul className="space-y-3">
              {memberships.map(({ community, role, points }) => (
                <li key={community.id}>
                  <Link
                    href={`/communities/${community.slug}`}
                    className="tick flex gap-3 border border-line bg-surface p-3"
                  >
                    <Emblem seed={community.slug} tag={community.name.slice(0, 3)} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="display truncate text-sm uppercase tracking-[0.04em]">
                          {community.name}
                        </h3>
                        {role !== "MEMBER" && <Pill tone="signal">{role.toLowerCase()}</Pill>}
                      </div>
                      <p className="truncate text-[0.8125rem] text-muted">{community.tagline}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {community.channels.map((channel) => (
                          <span
                            key={channel.id}
                            className="flex items-center gap-0.5 text-[0.6875rem] text-faint"
                          >
                            {channel.kind === "ANNOUNCEMENT" ? (
                              <Megaphone size={11} />
                            ) : (
                              <Hash size={11} />
                            )}
                            {channel.name}
                          </span>
                        ))}
                        <span className="tabular text-[0.6875rem] text-faint">
                          · {compactNumber(community._count.members)} members · {points} pts
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Recommended players"
            title="Could actually queue with you"
            action={{ href: "/find-players", label: "More" }}
          />
          {recommended.length === 0 ? (
            <EmptyState
              title="Not enough to go on yet"
              body="Add a rank to one of your games and we can match you on skill, schedule and role instead of guessing."
              action={{ href: "/settings/games", label: "Add your ranks" }}
            />
          ) : (
            <div className="space-y-3">
              {recommended.map(({ candidate, result, topRank }) => (
                <PlayerCard
                  key={candidate.id}
                  managedTeams={teams}
                  player={{
                    username: candidate.username,
                    displayName: candidate.displayName,
                    avatarUrl: avatarSrc(candidate.profile?.avatarUrl),
                    presence: candidate.presence,
                    game: topRank!.game.name,
                    tier: topRank!.tier,
                    tierIdx: topRank!.tierIdx,
                    tierCount: topRank!.game.rankTiers.length,
                    role: topRank!.role,
                    region: candidate.preference!.region,
                    competitive: candidate.preference!.competitive >= 60,
                    score: result.score,
                    reasons: result.reasons,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mb-10">
        <SectionHeader
          eyebrow="Upcoming"
          title="Tournaments taking teams"
          action={{ href: "/tournaments", label: "All tournaments" }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {tournaments.map((tournament) => (
            <TournamentRow
              key={tournament.id}
              tournament={{
                slug: tournament.slug,
                name: tournament.name,
                game: tournament.game.shortName,
                format: tournament.format,
                region: tournament.region,
                teams: tournament._count.teams,
                maxTeams: tournament.maxTeams,
                startsAt: tournament.startsAt,
                prizePool: tournament.prizePool,
                status: tournament.status,
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Trending clips" title="Short and loud" action={{ href: "/clips", label: "Open feed" }} />
        {clips.length > 0 ? (
          <div className="scroll-x flex gap-3 pb-2">
            {clips.map((clip) => (
              <ClipTile
                key={clip.id}
                clip={{
                  slug: clip.slug,
                  title: clip.title,
                  displayName: clip.user.displayName,
                  username: clip.user.username,
                  game: clip.game?.shortName ?? null,
                  views: clip.views,
                  durationSec: clip.durationSec,
                  thumbnailUrl: clipPosterSrc(clip.thumbnailUrl),
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing trending yet" body="Clips will start showing up here once people start uploading them." />
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { ClipTile, StreamCard, Thumb, TournamentRow } from "@/components/cards";
import { Emblem } from "@/components/emblem";
import { EmptyState, Pill, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { compactNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { trendingClips, upcomingTournaments } from "@/lib/queries";

const TABS = ["recommended", "live", "games", "clips", "communities", "tournaments"] as const;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; game?: string }>;
}) {
  const { tab = "recommended", game } = await searchParams;

  const [games, streams, clips, communities, tournaments] = await Promise.all([
    prisma.game.findMany({
      include: { _count: { select: { streams: true, tournaments: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.stream.findMany({
      where: { isLive: true, ...(game ? { game: { slug: game } } : {}) },
      include: { user: { include: { profile: true } }, game: true },
      orderBy: { viewerCount: "desc" },
      take: 8,
    }),
    trendingClips(8),
    prisma.community.findMany({
      include: { game: true, _count: { select: { members: true } } },
      orderBy: { memberCount: "desc" },
      take: 6,
    }),
    upcomingTournaments(5),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <div className="mb-5">
        <p className="eyebrow mb-1">Discover</p>
        <h1 className="display text-xl uppercase tracking-[0.05em]">Find your next thing</h1>
      </div>

      <div className="scroll-x mb-6 flex gap-2 border-b border-line pb-3">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`/discover?tab=${item}`}
            className={`btn shrink-0 ${tab === item ? "btn-primary" : "btn-ghost"}`}
          >
            {item}
          </Link>
        ))}
      </div>

      {(tab === "recommended" || tab === "games") && (
        <section className="mb-10">
          <SectionHeader eyebrow="Games" title="Browse by game" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {games.map((entry) => (
              <Link key={entry.id} href={`/live?game=${entry.slug}`} className="tick group">
                <Thumb seed={entry.slug} className="aspect-[3/4]" />
                <p className="mt-1.5 truncate text-[0.8125rem] group-hover:text-signal">{entry.name}</p>
                <p className="tabular text-[0.6875rem] text-faint">
                  {entry._count.streams} live · {entry._count.tournaments} events
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(tab === "recommended" || tab === "live") && (
        <section className="mb-10">
          <SectionHeader eyebrow="Live" title="Streams in your games" action={{ href: "/live", label: "All" }} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {streams.map((stream) => (
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
        </section>
      )}

      {(tab === "recommended" || tab === "clips") && (
        <section className="mb-10">
          <SectionHeader eyebrow="Clips" title="Short and loud" action={{ href: "/clips", label: "Feed" }} />
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
            <EmptyState title="No clips yet" body="Uploaded clips will show up here once they exist." />
          )}
        </section>
      )}

      {(tab === "recommended" || tab === "communities") && (
        <section className="mb-10">
          <SectionHeader eyebrow="Communities" title="Rooms worth joining" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {communities.map((community) => (
              <Link
                key={community.id}
                href={`/communities/${community.slug}`}
                className="tick flex gap-3 border border-line bg-surface p-3"
              >
                <Emblem seed={community.slug} tag={community.name.slice(0, 3)} size={40} />
                <div className="min-w-0">
                  <h3 className="display truncate text-sm uppercase tracking-[0.04em]">{community.name}</h3>
                  <p className="line-clamp-2 text-[0.8125rem] text-muted">{community.tagline}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {community.game && <Pill tone="signal">{community.game.shortName}</Pill>}
                    <span className="tabular text-[0.6875rem] text-faint">
                      {compactNumber(community._count.members)} members
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(tab === "recommended" || tab === "tournaments") && (
        <section>
          <SectionHeader eyebrow="Tournaments" title="Open registration" action={{ href: "/tournaments", label: "All" }} />
          <div className="space-y-3">
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
      )}
    </div>
  );
}

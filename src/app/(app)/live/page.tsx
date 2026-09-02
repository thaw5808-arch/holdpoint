import Link from "next/link";
import { StreamCard } from "@/components/cards";
import { EmptyState, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { forYouSignals, scoreForYouStream } from "@/lib/live-feed";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type Feed = "for-you" | "following";

function liveHref(filters: { game?: string; lang?: string }, feed: Feed | null) {
  const params = new URLSearchParams();
  if (feed === "following") params.set("feed", "following");
  if (filters.game) params.set("game", filters.game);
  if (filters.lang) params.set("lang", filters.lang);
  const qs = params.toString();
  return `/live${qs ? `?${qs}` : ""}`;
}

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; lang?: string; feed?: string }>;
}) {
  const filters = await searchParams;
  const user = await getCurrentUser();
  // Signed-out visitors get the old, unpersonalized page — neither tab
  // means anything without an account to hang follows/likes/profile off of.
  const feed: Feed | null = user ? (filters.feed === "following" ? "following" : "for-you") : null;

  const where = {
    isLive: true,
    ...(filters.game ? { game: { slug: filters.game } } : {}),
    ...(filters.lang ? { language: filters.lang } : {}),
    ...(feed === "following" ? { user: { followers: { some: { followerId: user!.id } } } } : {}),
  };

  let streams = await prisma.stream.findMany({
    where,
    include: { user: { include: { profile: true } }, game: true },
    orderBy: { viewerCount: "desc" },
  });

  if (feed === "for-you") {
    const signals = await forYouSignals(user!.id, user!.profile?.region ?? null);
    const scored = (stream: (typeof streams)[number]) =>
      scoreForYouStream(
        {
          userId: stream.userId,
          gameId: stream.gameId,
          viewerCount: stream.viewerCount,
          creatorRegion: stream.user.profile?.region ?? null,
        },
        signals,
      );
    streams = [...streams].sort((a, b) => scored(b) - scored(a));
  }

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  const totalViewers = streams.reduce((sum, stream) => sum + stream.viewerCount, 0);

  const emptyState =
    feed === "following"
      ? {
          title: "Nobody you follow is live",
          body: filters.game
            ? "None of the creators you follow are streaming this game right now. Follow more creators, or see who's live on Discover."
            : "None of the creators you follow are live right now. Follow more creators, or see who's live on Discover.",
          action: { href: "/discover", label: "Browse Discover" },
        }
      : {
          title: "Nothing live in this filter",
          body: "Try another game, or drop into a community — the rooms stay busy when the channels don't.",
          action: { href: "/communities", label: "Browse communities" },
        };

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <SectionHeader
        eyebrow={`${streams.length} channels · ${totalViewers.toLocaleString()} watching`}
        title="Live right now"
      />

      {user && (
        <div className="mb-4 flex gap-2 border-b border-line pb-3">
          <Link href={liveHref(filters, "for-you")} className={`btn ${feed === "for-you" ? "btn-primary" : "btn-ghost"}`}>
            For You
          </Link>
          <Link
            href={liveHref(filters, "following")}
            className={`btn ${feed === "following" ? "btn-primary" : "btn-ghost"}`}
          >
            Following
          </Link>
        </div>
      )}

      <div className="scroll-x mb-5 flex gap-2 pb-2">
        <a href={liveHref({ lang: filters.lang }, feed)} className={`btn ${!filters.game ? "btn-primary" : ""}`}>
          All games
        </a>
        {games.map((game) => (
          <a
            key={game.id}
            href={liveHref({ game: game.slug, lang: filters.lang }, feed)}
            className={`btn shrink-0 ${filters.game === game.slug ? "btn-primary" : ""}`}
          >
            {game.shortName}
          </a>
        ))}
      </div>

      {streams.length === 0 ? (
        <EmptyState title={emptyState.title} body={emptyState.body} action={emptyState.action} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      )}
    </div>
  );
}

import { StreamCard } from "@/components/cards";
import { EmptyState, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; lang?: string }>;
}) {
  const filters = await searchParams;
  const streams = await prisma.stream.findMany({
    where: {
      isLive: true,
      ...(filters.game ? { game: { slug: filters.game } } : {}),
      ...(filters.lang ? { language: filters.lang } : {}),
    },
    include: { user: { include: { profile: true } }, game: true },
    orderBy: { viewerCount: "desc" },
  });

  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  const totalViewers = streams.reduce((sum, stream) => sum + stream.viewerCount, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <SectionHeader
        eyebrow={`${streams.length} channels · ${totalViewers.toLocaleString()} watching`}
        title="Live right now"
      />

      <div className="scroll-x mb-5 flex gap-2 pb-2">
        <a href="/live" className={`btn ${!filters.game ? "btn-primary" : ""}`}>
          All games
        </a>
        {games.map((game) => (
          <a
            key={game.id}
            href={`/live?game=${game.slug}`}
            className={`btn shrink-0 ${filters.game === game.slug ? "btn-primary" : ""}`}
          >
            {game.shortName}
          </a>
        ))}
      </div>

      {streams.length === 0 ? (
        <EmptyState
          title="Nothing live in this filter"
          body="Try another game, or drop into a community — the rooms stay busy when the channels don't."
          action={{ href: "/communities", label: "Browse communities" }}
        />
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

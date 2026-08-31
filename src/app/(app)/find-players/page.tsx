import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { CloseLFGPostButton } from "@/components/close-lfg-post-button";
import { PlayerCard } from "@/components/player-card";
import { EmptyState, Pill, SectionHeader } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { playCompatibility } from "@/lib/compatibility";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { managedTeams, playerSnapshot } from "@/lib/queries";
import { REGIONS } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";

/** Builds a /find-players href, keeping both filters unless one is overridden with undefined. */
function filterHref(filters: { game?: string; region?: string }, overrides: { game?: string; region?: string }) {
  const game = "game" in overrides ? overrides.game : filters.game;
  const region = "region" in overrides ? overrides.region : filters.region;
  const params = new URLSearchParams();
  if (game) params.set("game", game);
  if (region) params.set("region", region);
  const qs = params.toString();
  return qs ? `/find-players?${qs}` : "/find-players";
}

export default async function FindPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; region?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filters = await searchParams;

  const [games, me, posts, teams] = await Promise.all([
    prisma.game.findMany({ orderBy: { name: "asc" } }),
    playerSnapshot(user.id),
    prisma.lFGPost.findMany({
      where: { open: true, ...(filters.game ? { game: { slug: filters.game } } : {}) },
      include: { user: { include: { profile: true } }, game: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    managedTeams(user.id),
  ]);

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      // A plain field filter on an optional to-one relation already excludes
      // users with no preference record, so this satisfies "has a
      // preference" whether or not a region filter is applied.
      preference: filters.region ? { region: filters.region } : { isNot: null },
      ...(filters.game ? { ranks: { some: { game: { slug: filters.game } } } } : {}),
    },
    include: { preference: true, profile: true, ranks: { include: { game: true } } },
    take: 40,
  });

  const gameNames = Object.fromEntries(games.map((game) => [game.id, game.shortName]));
  const scored = candidates
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
      const result = me ? playCompatibility(me, snapshot, gameNames) : null;
      const rank =
        candidate.ranks.find((entry) => !filters.game || entry.game.slug === filters.game) ??
        candidate.ranks[0];
      return { candidate, result, rank };
    })
    .filter((row) => row.rank)
    .sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0));

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Find players</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Teammates, not matches</h1>
          <p className="mt-1 max-w-lg text-sm text-muted">
            Ranked by shared games, rank gap, overlapping play hours, region and role fit. Every
            score shows its reasons.
          </p>
        </div>
        <Link href="/find-players/new" className="btn btn-primary">
          Post an LFG
        </Link>
      </div>

      <div className="scroll-x mb-2 flex gap-2 pb-1">
        <Link
          href={filterHref(filters, { game: undefined })}
          className={`btn ${!filters.game ? "btn-primary" : ""}`}
        >
          All games
        </Link>
        {games.map((game) => (
          <Link
            key={game.id}
            href={filterHref(filters, { game: game.slug })}
            className={`btn shrink-0 ${filters.game === game.slug ? "btn-primary" : ""}`}
          >
            {game.shortName}
          </Link>
        ))}
      </div>

      <div className="scroll-x mb-6 flex gap-2 border-b border-line pb-3">
        <Link
          href={filterHref(filters, { region: undefined })}
          className={`btn ${!filters.region ? "btn-primary" : ""}`}
        >
          All regions
        </Link>
        {REGIONS.map((region) => (
          <Link
            key={region}
            href={filterHref(filters, { region })}
            className={`btn shrink-0 ${filters.region === region ? "btn-primary" : ""}`}
          >
            {region}
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionHeader eyebrow={`${scored.length} players`} title="Sorted by play compatibility" />
          {scored.length === 0 ? (
            <EmptyState
              title="Nobody matches that filter"
              body="Widen the game or region and we'll rank whoever is left by how well they'd actually queue with you."
              action={{ href: "/find-players", label: "Clear filters" }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {scored.slice(0, 18).map(({ candidate, result, rank }) => (
                <PlayerCard
                  key={candidate.id}
                  managedTeams={teams}
                  player={{
                    username: candidate.username,
                    displayName: candidate.displayName,
                    avatarUrl: avatarSrc(candidate.profile?.avatarUrl),
                    presence: candidate.presence,
                    game: rank!.game.name,
                    tier: rank!.tier,
                    tierIdx: rank!.tierIdx,
                    tierCount: rank!.game.rankTiers.length,
                    role: rank!.role,
                    region: candidate.preference!.region,
                    competitive: candidate.preference!.competitive >= 60,
                    score: result?.score,
                    reasons: result?.reasons,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside>
          <SectionHeader eyebrow="Open posts" title="Looking for group" />
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="tick border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Link href={`/u/${post.user.username}`} aria-label={post.user.displayName}>
                    <Avatar
                      name={post.user.displayName}
                      seed={post.user.username}
                      size={26}
                      presence={post.user.presence}
                      avatarUrl={avatarSrc(post.user.profile?.avatarUrl)}
                    />
                  </Link>
                  <Link href={`/u/${post.user.username}`} className="text-[0.8125rem] hover:text-signal">
                    {post.user.displayName}
                  </Link>
                  <span className="tabular ml-auto text-[0.625rem] text-faint">
                    {relativeTime(post.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{post.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill tone="signal">{post.game.shortName}</Pill>
                  <Pill>{post.region}</Pill>
                  {post.minTier && <Pill>{post.minTier}+</Pill>}
                  <Pill tone={post.competitive ? "signal" : "quiet"}>
                    {post.competitive ? "Competitive" : "Casual"}
                  </Pill>
                  <Pill tone="quiet">Needs {post.needed}</Pill>
                  {post.userId === user.id && (
                    <CloseLFGPostButton postId={post.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

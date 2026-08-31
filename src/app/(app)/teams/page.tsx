import Link from "next/link";
import { Emblem } from "@/components/emblem";
import { EmptyState, Pill, SectionHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const [mine, openings, all] = await Promise.all([
    user
      ? prisma.teamMember.findMany({
          where: { userId: user.id },
          include: { team: { include: { games: { include: { game: true } }, _count: { select: { members: true } } } } },
        })
      : [],
    prisma.teamOpening.findMany({
      where: { open: true },
      include: { team: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.team.findMany({
      include: { games: { include: { game: true } }, _count: { select: { members: true } } },
      orderBy: { wins: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-3 py-5 sm:px-5">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Teams</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Rosters</h1>
        </div>
        <Link href="/teams/new" className="btn btn-primary">
          Create team
        </Link>
      </div>

      <section className="mb-9">
        <SectionHeader eyebrow="Your teams" title="Where you're rostered" />
        {mine.length === 0 ? (
          <EmptyState
            title="You haven't joined a team yet"
            body="Find players around your rank and region first, then build a roster from people you've actually queued with."
            action={{ href: "/find-players", label: "Find players" }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map(({ team, role }) => (
              <Link key={team.id} href={`/teams/${team.slug}`} className="tick flex gap-3 border border-line bg-surface p-3">
                <Emblem seed={team.slug} tag={team.tag} size={44} />
                <div className="min-w-0">
                  <h3 className="display truncate text-sm uppercase tracking-[0.04em]">{team.name}</h3>
                  <p className="tabular text-[0.75rem] text-muted">
                    {team._count.members} members · {team.wins}W {team.losses}L
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Pill tone="signal">{role.toLowerCase()}</Pill>
                    {team.games[0] && <Pill>{team.games[0].game.shortName}</Pill>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-9">
        <SectionHeader eyebrow="Recruiting" title="Looking for player" />
        <div className="divide-y divide-line border border-line">
          {openings.map((opening) => (
            <Link
              key={opening.id}
              href={`/teams/${opening.team.slug}`}
              className="flex flex-wrap items-center gap-3 bg-surface px-3 py-2.5 text-sm hover:bg-raised"
            >
              <Emblem seed={opening.team.slug} tag={opening.team.tag} size={28} />
              <span className="min-w-0 flex-1 truncate">{opening.team.name}</span>
              <Pill tone="signal">{opening.position}</Pill>
              {opening.minTier && <Pill>{opening.minTier}+</Pill>}
              {opening.region && <Pill>{opening.region}</Pill>}
              <span className="text-[0.75rem] text-faint">{opening.availability}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Standings" title="Most wins this season" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {all.map((team) => (
            <Link key={team.id} href={`/teams/${team.slug}`} className="tick border border-line bg-surface p-3">
              <div className="flex items-center gap-2.5">
                <Emblem seed={team.slug} tag={team.tag} size={38} />
                <div className="min-w-0">
                  <h3 className="truncate text-[0.875rem]">{team.name}</h3>
                  <p className="tabular text-[0.6875rem] text-faint">
                    {team.region} · {team._count.members} players
                  </p>
                </div>
              </div>
              <p className="tabular display mt-2 text-sm">
                <span className="text-signal">{team.wins}W</span>{" "}
                <span className="text-faint">{team.losses}L</span>
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

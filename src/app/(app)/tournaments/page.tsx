import Link from "next/link";
import { TournamentRow } from "@/components/cards";
import { EmptyState, SectionHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const tournaments = await prisma.tournament.findMany({
    where: status ? { status: status as never } : {},
    include: { game: true, _count: { select: { teams: true } } },
    orderBy: { startsAt: "asc" },
  });

  const live = tournaments.filter((t) => t.status === "LIVE");
  const open = tournaments.filter((t) => t.status === "REGISTRATION_OPEN");
  const rest = tournaments.filter((t) => !["LIVE", "REGISTRATION_OPEN"].includes(t.status));

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-5 sm:px-5">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Tournaments</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Compete</h1>
        </div>
        <Link href="/tournaments/new" className="btn btn-primary">
          Create tournament
        </Link>
      </div>

      {live.length > 0 && (
        <section className="mb-8">
          <div className="hazard mb-3 h-[3px] w-full opacity-70" aria-hidden />
          <SectionHeader eyebrow="In progress" title="Playing now" />
          <div className="space-y-3">
            {live.map((tournament) => (
              <TournamentRow key={tournament.id} tournament={toRow(tournament)} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <SectionHeader eyebrow="Registration open" title="Enter a roster" />
        {open.length === 0 ? (
          <EmptyState
            title="No open registrations"
            body="Nothing is taking teams right now. Create your own bracket and invite the teams you already scrim."
            action={{ href: "/tournaments/new", label: "Create tournament" }}
          />
        ) : (
          <div className="space-y-3">
            {open.map((tournament) => (
              <TournamentRow key={tournament.id} tournament={toRow(tournament)} />
            ))}
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <SectionHeader eyebrow="Archive" title="Closed and completed" />
          <div className="space-y-3 opacity-75">
            {rest.map((tournament) => (
              <TournamentRow key={tournament.id} tournament={toRow(tournament)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function toRow(tournament: {
  slug: string;
  name: string;
  game: { shortName: string };
  format: string;
  region: string;
  _count: { teams: number };
  maxTeams: number;
  startsAt: Date;
  prizePool: number;
  status: string;
}) {
  return {
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
  };
}

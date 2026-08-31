import Link from "next/link";
import { notFound } from "next/navigation";
import { BracketView } from "@/components/bracket-view";
import { Emblem } from "@/components/emblem";
import { TournamentGenerateBracketAction } from "@/components/tournament-generate-bracket-action";
import { TournamentRegisterAction } from "@/components/tournament-register-action";
import { TournamentRegistrationReview } from "@/components/tournament-registration-review";
import { LiveTag, Pill, SectionHeader, StatTile } from "@/components/ui";
import { roundRobinStandings } from "@/lib/brackets";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const TABS = ["bracket", "teams", "matches", "rules"] as const;

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab = "bracket" } = await searchParams;
  const user = await getCurrentUser();

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      game: true,
      organizer: true,
      teams: { include: { team: { include: { members: { include: { user: true } } } } }, orderBy: { seed: "asc" } },
      matches: {
        include: { homeTeam: true, awayTeam: true, result: { select: { id: true, reportedById: true } } },
        orderBy: [{ side: "asc" }, { round: "asc" }, { position: "asc" }],
      },
      _count: {
        select: { registrations: { where: { status: { in: ["PENDING", "APPROVED"] } } } },
      },
    },
  });
  if (!tournament) notFound();

  const isOrganizer = user?.id === tournament.organizerId;
  const pendingRegistrations = isOrganizer
    ? await prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: "PENDING" },
        include: { team: { include: { members: { select: { id: true } } } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Teams the viewer manages (owner or captain), globally — used only to
  // gate which match-result controls render; reportMatchResultAction and
  // confirmMatchResultAction both re-derive this from the DB themselves.
  const viewerTeamIds = user
    ? (
        await prisma.teamMember.findMany({
          where: { userId: user.id, role: { in: ["OWNER", "CAPTAIN"] } },
          select: { teamId: true },
        })
      ).map((membership) => membership.teamId)
    : [];

  const live = tournament.status === "LIVE";
  const completed = tournament.matches.filter((match) => match.state === "COMPLETED");

  const hasReportedResults = tournament.matches.some((match) => match.result);
  const canGenerateBracket = tournament.teams.length >= 2 && !hasReportedResults;
  const generateBlockedReason = hasReportedResults
    ? "The bracket already has reported results, so it can't be regenerated."
    : "Needs at least 2 approved teams before a bracket can be generated.";

  const now = new Date();
  const withinWindow = now >= tournament.registrationOpensAt && now <= tournament.registrationClosesAt;
  // Registration count, not the bracket's placed-teams count — a PENDING
  // application holds a slot against the cap before it's ever approved
  // into `teams`, so gating the button on `teams.length` would let
  // registrations past the real cap through to registerTeamAction only to
  // bounce there.
  const full = tournament._count.registrations >= tournament.maxTeams;
  const registrationOpen = tournament.status === "REGISTRATION_OPEN" && withinWindow && !full;
  const closedLabel =
    tournament.status === "REGISTRATION_OPEN" && full
      ? "Tournament full"
      : tournament.status === "REGISTRATION_OPEN" && now < tournament.registrationOpensAt
        ? "Registration not open yet"
        : "Registration closed";

  const standings =
    tournament.format === "ROUND_ROBIN"
      ? roundRobinStandings(
          completed
            .filter((match) => match.homeTeamId && match.awayTeamId)
            .map((match) => ({
              homeSeed: tournament.teams.find((entry) => entry.teamId === match.homeTeamId)!.seed,
              awaySeed: tournament.teams.find((entry) => entry.teamId === match.awayTeamId)!.seed,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
            })),
          tournament.teams.length,
        )
      : [];

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <header className="mb-6 flex flex-wrap items-start gap-4 border-b border-line pb-5">
        <Emblem seed={tournament.slug} tag={tournament.game.shortName.slice(0, 3)} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {live && <LiveTag />}
            <Pill tone="signal">{tournament.game.name}</Pill>
            <Pill>{tournament.format.replace(/_/g, " ").toLowerCase()}</Pill>
            <Pill>{tournament.region}</Pill>
          </div>
          <h1 className="display mt-2 text-2xl uppercase tracking-[0.04em]">{tournament.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{tournament.description}</p>
          <p className="tabular mt-2 text-[0.75rem] text-faint">
            Organised by{" "}
            <Link href={`/u/${tournament.organizer.username}`} className="text-muted hover:text-signal">
              {tournament.organizer.displayName}
            </Link>{" "}
            · starts {tournament.startsAt.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {user ? (
            <TournamentRegisterAction
              tournamentId={tournament.id}
              canRegister={registrationOpen}
              closedLabel={closedLabel}
            />
          ) : (
            <Link href="/login" className="btn btn-primary">
              Log in to register
            </Link>
          )}
          <button className="btn">Follow</button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Prize pool" value={`$${tournament.prizePool.toLocaleString()}`} tone="gold" />
        <StatTile
          label="Teams"
          value={`${tournament.teams.length}/${tournament.maxTeams}`}
          sub={`${tournament.teamSize}v${tournament.teamSize}`}
        />
        <StatTile label="Matches played" value={`${completed.length}/${tournament.matches.length}`} />
        <StatTile
          label="Entry"
          value={tournament.entryFee === 0 ? "Free" : `$${tournament.entryFee}`}
          tone="signal"
        />
      </div>

      {isOrganizer && pendingRegistrations.length > 0 && (
        <div className="mb-8">
          <SectionHeader eyebrow="Organizer" title={`Pending applications (${pendingRegistrations.length})`} />
          <TournamentRegistrationReview
            registrations={pendingRegistrations.map((registration) => ({
              id: registration.id,
              team: { slug: registration.team.slug, name: registration.team.name, tag: registration.team.tag },
              rosterSize: registration.team.members.length,
              submittedAt: relativeTime(registration.createdAt),
            }))}
          />
        </div>
      )}

      {isOrganizer && (
        <TournamentGenerateBracketAction
          tournamentId={tournament.id}
          canGenerate={canGenerateBracket}
          blockedReason={generateBlockedReason}
        />
      )}

      <nav className="scroll-x mb-5 flex gap-2 border-b border-line pb-3">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`/tournaments/${tournament.slug}?tab=${item}`}
            className={`btn shrink-0 ${tab === item ? "btn-primary" : "btn-ghost"}`}
          >
            {item}
          </Link>
        ))}
      </nav>

      {tab === "bracket" &&
        (tournament.format === "ROUND_ROBIN" ? (
          <div className="border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="eyebrow">
                  {["#", "Team", "P", "W", "L", "Diff", "Pts"].map((head) => (
                    <th key={head} className="px-3 py-2 text-left font-normal">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => {
                  const entry = tournament.teams.find((item) => item.seed === row.seed);
                  return (
                    <tr key={row.seed} className="border-t border-line">
                      <td className="tabular px-3 py-2 text-faint">{index + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/teams/${entry?.team.slug}`} className="hover:text-signal">
                          {entry?.team.name}
                        </Link>
                      </td>
                      <td className="tabular px-3 py-2">{row.played}</td>
                      <td className="tabular px-3 py-2 text-signal">{row.wins}</td>
                      <td className="tabular px-3 py-2 text-muted">{row.losses}</td>
                      <td className="tabular px-3 py-2">{row.roundDiff > 0 ? `+${row.roundDiff}` : row.roundDiff}</td>
                      <td className="tabular display px-3 py-2">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <BracketView
            viewerId={user?.id ?? null}
            viewerTeamIds={viewerTeamIds}
            matches={tournament.matches.map((match) => ({
              id: match.id,
              side: match.side,
              round: match.round,
              position: match.position,
              state: match.state,
              bestOf: match.bestOf,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              winnerNextId: match.winnerNextId,
              scheduledAt: match.scheduledAt?.toISOString() ?? null,
              resultReportedById: match.result?.reportedById ?? null,
              home: match.homeTeam
                ? { id: match.homeTeam.id, name: match.homeTeam.name, tag: match.homeTeam.tag, slug: match.homeTeam.slug }
                : null,
              away: match.awayTeam
                ? { id: match.awayTeam.id, name: match.awayTeam.name, tag: match.awayTeam.tag, slug: match.awayTeam.slug }
                : null,
            }))}
          />
        ))}

      {tab === "teams" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tournament.teams.map((entry) => (
            <Link
              key={entry.id}
              href={`/teams/${entry.team.slug}`}
              className="tick flex gap-3 border border-line bg-surface p-3"
            >
              <Emblem seed={entry.team.slug} tag={entry.team.tag} size={42} />
              <div className="min-w-0">
                <p className="tabular text-[0.625rem] text-faint">Seed {entry.seed}</p>
                <h3 className="display truncate text-sm uppercase tracking-[0.04em]">{entry.team.name}</h3>
                <p className="tabular text-[0.75rem] text-muted">
                  {entry.team.members.length} on roster · {entry.wins}W {entry.losses}L
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "matches" && (
        <div className="divide-y divide-line border border-line">
          {tournament.matches.map((match) => (
            <div key={match.id} className="flex items-center gap-3 bg-surface px-3 py-2.5 text-sm">
              <span className="eyebrow w-28 shrink-0">
                {match.side.replace("_", " ").toLowerCase()} R{match.round}
              </span>
              <span className="min-w-0 flex-1 truncate">{match.homeTeam?.name ?? "TBD"}</span>
              <span className="tabular px-3">
                {match.homeScore} – {match.awayScore}
              </span>
              <span className="min-w-0 flex-1 truncate text-right">{match.awayTeam?.name ?? "TBD"}</span>
              <span className="w-24 shrink-0 text-right">
                {match.state === "LIVE" ? <LiveTag /> : <Pill tone="quiet">{match.state.toLowerCase()}</Pill>}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "rules" && (
        <article className="max-w-3xl whitespace-pre-line border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
          {tournament.rules}
        </article>
      )}
    </div>
  );
}

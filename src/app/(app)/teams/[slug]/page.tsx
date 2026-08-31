import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Emblem } from "@/components/emblem";
import {
  InviteToTeamForm,
  LeaveTeamButton,
  RespondToTeamInviteButtons,
} from "@/components/team-roster-actions";
import { Pill, SectionHeader, StatTile } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MANAGER_ROLES = new Set(["OWNER", "CAPTAIN"]);

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      games: { include: { game: true } },
      members: { include: { user: { include: { profile: true, ranks: true } } } },
      openings: { where: { open: true } },
      entries: { include: { tournament: { include: { game: true } } } },
      homeMatches: { include: { awayTeam: true, tournament: true }, take: 5, orderBy: { createdAt: "desc" } },
      awayMatches: { include: { homeTeam: true, tournament: true }, take: 5, orderBy: { createdAt: "desc" } },
    },
  });
  if (!team) notFound();

  const viewerMembership = user ? team.members.find((member) => member.userId === user.id) : undefined;
  const pendingInvite =
    user && !viewerMembership
      ? await prisma.teamInvite.findUnique({
          where: { teamId_userId: { teamId: team.id, userId: user.id } },
        })
      : null;

  const played = team.wins + team.losses;
  const winRate = played ? Math.round((team.wins / played) * 100) : 0;
  const history = [
    ...team.homeMatches.map((match) => ({
      id: match.id,
      opponent: match.awayTeam?.name ?? "TBD",
      score: `${match.homeScore}–${match.awayScore}`,
      won: match.homeScore > match.awayScore,
      tournament: match.tournament.name,
    })),
    ...team.awayMatches.map((match) => ({
      id: match.id,
      opponent: match.homeTeam?.name ?? "TBD",
      score: `${match.awayScore}–${match.homeScore}`,
      won: match.awayScore > match.homeScore,
      tournament: match.tournament.name,
    })),
  ].slice(0, 6);

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-5 sm:px-5">
      <header className="mb-6 flex flex-wrap items-start gap-4 border-b border-line pb-5">
        <Emblem seed={team.slug} tag={team.tag} size={72} />
        <div className="min-w-0 flex-1">
          <p className="tabular eyebrow mb-1">{team.tag}</p>
          <h1 className="display text-2xl uppercase tracking-[0.04em]">{team.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{team.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>{team.region}</Pill>
            {team.games.map((entry) => (
              <Pill key={entry.id} tone="signal">
                {entry.game.shortName}
              </Pill>
            ))}
          </div>
        </div>
        {viewerMembership && MANAGER_ROLES.has(viewerMembership.role) ? (
          <InviteToTeamForm teamId={team.id} />
        ) : viewerMembership ? (
          <LeaveTeamButton teamId={team.id} />
        ) : pendingInvite ? (
          <RespondToTeamInviteButtons inviteId={pendingInvite.id} />
        ) : (
          <button className="btn btn-primary">Apply to roster</button>
        )}
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Record" value={`${team.wins}–${team.losses}`} tone="signal" />
        <StatTile label="Win rate" value={`${winRate}%`} sub={`${played} matches`} />
        <StatTile label="Roster" value={String(team.members.length)} />
        <StatTile label="Events entered" value={String(team.entries.length)} tone="gold" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <SectionHeader eyebrow="Roster" title="Who plays" />
          <div className="divide-y divide-line border border-line">
            {team.members.map((member) => (
              <Link
                key={member.id}
                href={`/u/${member.user.username}`}
                className="flex items-center gap-3 bg-surface px-3 py-2.5 hover:bg-raised"
              >
                <Avatar
                  name={member.user.displayName}
                  seed={member.user.username}
                  size={34}
                  presence={member.user.presence}
                  avatarUrl={avatarSrc(member.user.profile?.avatarUrl)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{member.user.displayName}</p>
                  <p className="tabular text-[0.6875rem] text-faint">
                    Level {member.user.profile?.level ?? 1} · @{member.user.username}
                  </p>
                </div>
                <Pill tone={member.role === "OWNER" || member.role === "CAPTAIN" ? "signal" : "neutral"}>
                  {member.role.toLowerCase()}
                </Pill>
                {member.position && <Pill tone="quiet">{member.position}</Pill>}
              </Link>
            ))}
          </div>

          {team.openings.length > 0 && (
            <div className="mt-5 border border-signal/40 bg-signal/6 p-4">
              <p className="eyebrow mb-2">Looking for player</p>
              <ul className="space-y-2">
                {team.openings.map((opening) => (
                  <li key={opening.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="display uppercase tracking-[0.04em]">{opening.position}</span>
                    {opening.minTier && <Pill>{opening.minTier}+</Pill>}
                    {opening.region && <Pill>{opening.region}</Pill>}
                    <span className="text-[0.75rem] text-muted">{opening.availability}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside>
          <SectionHeader eyebrow="Match history" title="Recent results" />
          <ul className="divide-y divide-line border border-line">
            {history.length === 0 && (
              <li className="bg-surface px-3 py-4 text-sm text-muted">
                No matches played yet. Enter a tournament and this fills up.
              </li>
            )}
            {history.map((match) => (
              <li key={match.id} className="flex items-center gap-2 bg-surface px-3 py-2.5 text-sm">
                <span className={`h-1.5 w-1.5 ${match.won ? "bg-signal" : "bg-line-strong"}`} />
                <span className="min-w-0 flex-1 truncate">{match.opponent}</span>
                <span className="tabular">{match.score}</span>
              </li>
            ))}
          </ul>

          <SectionHeader eyebrow="Tournaments" title="Entered" />
          <ul className="space-y-2">
            {team.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/tournaments/${entry.tournament.slug}`}
                  className="tick block border border-line bg-surface p-2.5 text-sm"
                >
                  <span className="block truncate">{entry.tournament.name}</span>
                  <span className="tabular text-[0.6875rem] text-faint">
                    Seed {entry.seed} · {entry.tournament.game.shortName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

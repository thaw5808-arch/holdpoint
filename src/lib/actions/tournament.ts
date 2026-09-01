"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { generateBracket } from "@/lib/brackets";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { REGIONS } from "@/lib/regions";
import { getCurrentUser } from "@/lib/session";

const MANAGER_ROLES = new Set(["OWNER", "CAPTAIN"]);

/** Internal control-flow error for actions below — caught and turned into
 * a `{ error }` result, never left to surface a raw/leaky message. */
class ActionError extends Error {}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "tournament";
}

/** Appends -2, -3, … until it finds a slug nothing else is using — same
 * pattern as uniqueSlug in actions/team.ts and uniqueCommunitySlug in
 * actions/community.ts. */
async function uniqueTournamentSlug(base: string) {
  let slug = base;
  for (let suffix = 2; await prisma.tournament.findUnique({ where: { slug }, select: { id: true } }); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

const FORMATS = ["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN"] as const;

const createTournamentSchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters").max(60, "Keep it under 60 characters"),
  game: z.string().trim().min(1, "Pick a game"),
  format: z.enum(FORMATS),
  region: z.string().refine((value) => (REGIONS as readonly string[]).includes(value), "Pick a region"),
  teamSize: z.coerce.number().int().min(1, "At least 1 player per team").max(10, "10 players per team, max"),
  maxTeams: z.coerce.number().int().min(2, "At least 2 teams").max(64, "64 teams, max"),
  // Left as the raw datetime-local string here and parsed into a Date below
  // (rather than z.coerce.date in the schema) so an empty/invalid value
  // fails with this field's own message instead of zod's generic one.
  // datetime-local has no timezone of its own — new Date() parses it in
  // the server's own local time, same as every other plain date input in
  // this codebase (there's no per-user timezone stored to do better with).
  startsAt: z.string().min(1, "Pick a start time"),
  description: z
    .string()
    .trim()
    .min(10, "Say a bit more about the tournament")
    .max(500, "Keep it under 500 characters"),
  rules: z
    .string()
    .trim()
    .min(10, "Add at least a few rules")
    .max(2000, "Keep it under 2000 characters"),
});

type CreateTournamentField = keyof z.infer<typeof createTournamentSchema>;

export type CreateTournamentFormState =
  | { error?: string; fieldErrors?: Partial<Record<CreateTournamentField, string>> }
  | undefined;

/**
 * Creates a tournament with its creator as organizer — every organizer-only
 * control on the tournament page (approving registrations, generating the
 * bracket, confirming results) already checks `organizerId === caller`, so
 * that's the one relationship this has to get right.
 *
 * Fields not exposed on the form get sensible fixed values rather than more
 * inputs:
 *   - status starts REGISTRATION_OPEN (the schema's own default) — a
 *     freshly created tournament should be immediately joinable, not sit in
 *     DRAFT with no way to leave it (nothing in this codebase transitions a
 *     tournament out of DRAFT).
 *   - registrationOpensAt is `now`; registrationClosesAt is `startsAt` —
 *     registration simply stays open until the event starts, rather than
 *     asking the organizer to pick two more dates up front. There's no
 *     tournament-edit action yet, so this can't be tightened later, but
 *     "open until it starts" is the one default that never needs tuning.
 *   - prizePool/entryFee are the schema's own 0 defaults, prizeCurrency
 *     "USD" — this app has no payment flow, so a nonzero entry fee or prize
 *     would be a promise nothing here can actually collect or pay out.
 *   - bannerUrl stays null — no image upload wired up for tournaments.
 */
export async function createTournamentAction(
  _state: CreateTournamentFormState,
  formData: FormData,
): Promise<CreateTournamentFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createTournamentSchema.safeParse({
    name: formData.get("name"),
    game: formData.get("game"),
    format: formData.get("format"),
    region: formData.get("region"),
    teamSize: formData.get("teamSize"),
    maxTeams: formData.get("maxTeams"),
    startsAt: formData.get("startsAt"),
    description: formData.get("description"),
    rules: formData.get("rules"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (typeof field === "string") {
      return { fieldErrors: { [field as CreateTournamentField]: issue.message } };
    }
    return { error: "Check the form and try again." };
  }
  const { name, game, format, region, teamSize, maxTeams, description, rules } = parsed.data;

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { fieldErrors: { startsAt: "Pick a valid start time" } };
  }
  if (startsAt.getTime() <= Date.now()) {
    return { fieldErrors: { startsAt: "Start time can't be in the past" } };
  }

  const gameRow = await prisma.game.findUnique({ where: { slug: game }, select: { id: true } });
  if (!gameRow) return { fieldErrors: { game: "Pick a game" } };

  const slug = await uniqueTournamentSlug(slugify(name));
  const now = new Date();

  const tournament = await prisma.tournament.create({
    data: {
      slug,
      name,
      organizerId: user.id,
      gameId: gameRow.id,
      description,
      region,
      format,
      teamSize,
      maxTeams,
      registrationOpensAt: now,
      registrationClosesAt: startsAt,
      startsAt,
      rules,
    },
  });

  revalidatePath("/", "layout");
  redirect(`/tournaments/${tournament.slug}`);
}

/** A score is valid for a best-of-N match when one side reaches exactly
 * ceil(N/2) wins and the other falls short of it — no ties, no reporting a
 * series that isn't actually decided yet. */
function isValidMatchScore(bestOf: number, home: number, away: number) {
  if (!Number.isInteger(home) || !Number.isInteger(away)) return false;
  if (home < 0 || away < 0) return false;
  if (home === away) return false;
  const winsNeeded = Math.ceil(bestOf / 2);
  return Math.max(home, away) === winsNeeded && Math.min(home, away) < winsNeeded;
}

/** SINGLE_ELIMINATION: any loss is out. DOUBLE_ELIMINATION: only a loss
 * outside the winners bracket (a second loss, or the grand final) is out —
 * a winners-bracket loss just drops the team to the losers bracket via
 * loserNextId. ROUND_ROBIN has no elimination concept at all. */
function isEliminatingLoss(format: string, side: string) {
  if (format === "SINGLE_ELIMINATION") return true;
  if (format === "DOUBLE_ELIMINATION") return side !== "WINNERS";
  return false;
}

/** Advances a team into the next match's first open slot. There's no
 * stored home/away "slot" per source match — just a pointer to the target
 * — so whichever of homeTeamId/awayTeamId is still null is the one that
 * gets filled; the two matches that feed a given target will always fill
 * it in some order, and which one lands home vs away isn't meaningful. */
async function fillNextSlot(tx: Prisma.TransactionClient, targetMatchId: string | null, teamId: string) {
  if (!targetMatchId) return;
  const target = await tx.tournamentMatch.findUnique({ where: { id: targetMatchId } });
  if (!target) return;
  if (target.homeTeamId === null) {
    await tx.tournamentMatch.update({ where: { id: target.id }, data: { homeTeamId: teamId } });
  } else if (target.awayTeamId === null) {
    await tx.tournamentMatch.update({ where: { id: target.id }, data: { awayTeamId: teamId } });
  }
}

const registerableInput = z.object({ tournamentId: z.string().min(1) });

export type RegisterableTeam = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  memberCount: number;
};

/**
 * Backs the "Register a team" picker: teams the caller manages (owner or
 * captain) that are actually eligible to enter this tournament — plays the
 * tournament's game, meets the roster minimum, and isn't already
 * registered. Like searchInvitableUsersAction, this is a convenience for
 * the picker's contents, not a trust boundary — registerTeamAction
 * re-derives and re-checks every one of these from the DB on submit.
 */
export async function registerableTeamsAction(tournamentId: string): Promise<RegisterableTeam[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const parsed = registerableInput.safeParse({ tournamentId });
  if (!parsed.success) return [];

  const tournament = await prisma.tournament.findUnique({
    where: { id: parsed.data.tournamentId },
    select: { gameId: true, teamSize: true },
  });
  if (!tournament) return [];

  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "CAPTAIN"] } },
    include: {
      team: {
        include: {
          games: { where: { gameId: tournament.gameId } },
          members: { select: { id: true } },
          registrations: { where: { tournamentId: parsed.data.tournamentId }, select: { id: true } },
        },
      },
    },
  });

  return memberships
    .map((membership) => membership.team)
    .filter(
      (team) =>
        team.games.length > 0 &&
        team.members.length >= tournament.teamSize &&
        team.registrations.length === 0,
    )
    .map((team) => ({ id: team.id, slug: team.slug, name: team.name, tag: team.tag, memberCount: team.members.length }));
}

const registerInput = z.object({
  tournamentId: z.string().min(1),
  teamId: z.string().min(1),
});

export type RegisterTeamResult = { registered: true } | { error: string };

/**
 * Registers a team for a tournament. The caller's standing (owner/captain
 * of the team being registered) and every eligibility rule are re-checked
 * against the DB here — the picker only ever shows teams that should
 * already pass these, but a request straight to this action is validated
 * exactly the same regardless of what the client claims.
 */
export async function registerTeamAction(tournamentId: string, teamId: string): Promise<RegisterTeamResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = registerInput.safeParse({ tournamentId, teamId });
  if (!parsed.success) return { error: "Invalid registration." };

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: parsed.data.teamId, userId: user.id } },
    include: {
      team: {
        include: {
          games: true,
          members: { select: { userId: true } },
        },
      },
    },
  });
  if (!membership || !MANAGER_ROLES.has(membership.role)) {
    return { error: "Only the team's owner or captain can register it." };
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: parsed.data.tournamentId } });
  if (!tournament) return { error: "That tournament no longer exists." };

  if (tournament.status !== "REGISTRATION_OPEN") {
    return { error: "Registration isn't open for this tournament." };
  }
  const now = new Date();
  if (now < tournament.registrationOpensAt || now > tournament.registrationClosesAt) {
    return { error: "Registration isn't open right now." };
  }

  const playsGame = membership.team.games.some((game) => game.gameId === tournament.gameId);
  if (!playsGame) return { error: `${membership.team.name} doesn't play this tournament's game.` };

  if (membership.team.members.length < tournament.teamSize) {
    return {
      error: `${membership.team.name} needs at least ${tournament.teamSize} players on the roster to register.`,
    };
  }

  // Checked explicitly (rather than letting the @@unique([tournamentId,
  // teamId]) constraint reject the insert) so a repeat click surfaces a
  // clear message instead of an unhandled Prisma error.
  const existingRegistration = await prisma.tournamentRegistration.findUnique({
    where: { tournamentId_teamId: { tournamentId: parsed.data.tournamentId, teamId: parsed.data.teamId } },
  });
  if (existingRegistration) {
    return { error: `${membership.team.name} has already registered for this tournament.` };
  }

  // WITHDRAWN/REJECTED registrations still exist as rows (the duplicate
  // check above catches them via the unique constraint) but shouldn't hold
  // a slot, so only PENDING/APPROVED count against the cap.
  const registeredCount = await prisma.tournamentRegistration.count({
    where: { tournamentId: parsed.data.tournamentId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (registeredCount >= tournament.maxTeams) {
    return { error: "This tournament is full." };
  }

  const roster = membership.team.members.map((member) => member.userId);

  // The registration and the organizer's notification are created in one
  // transaction, same as team invites — an application can't exist without
  // the organizer having a way to find out about it.
  await prisma.$transaction([
    prisma.tournamentRegistration.create({
      data: { tournamentId: parsed.data.tournamentId, teamId: parsed.data.teamId, roster },
    }),
    prisma.notification.create({
      data: {
        userId: tournament.organizerId,
        kind: "TOURNAMENT_APPLICATION",
        title: `${membership.team.name} applied to ${tournament.name}`,
        body: `They're requesting a spot in the ${tournament.teamSize}v${tournament.teamSize} bracket.`,
        href: `/tournaments/${tournament.slug}`,
      },
    }),
  ]);

  revalidatePath("/", "layout");
  return { registered: true };
}

const respondInput = z.object({
  registrationId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});

export type RespondToRegistrationResult = { status: "approved" | "rejected" } | { error: string };

/**
 * Approves or rejects a pending registration. The caller's standing (must
 * be the tournament's organizer, re-checked against the DB) and the
 * registration's own status are the authorization boundary here, not
 * whether the review UI happens to be rendered for them.
 */
export async function respondToRegistrationAction(
  registrationId: string,
  accept: boolean,
  reason?: string,
): Promise<RespondToRegistrationResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = respondInput.safeParse({ registrationId, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid response." };

  const registration = await prisma.tournamentRegistration.findUnique({
    where: { id: parsed.data.registrationId },
    include: { tournament: true, team: true },
  });
  if (!registration) return { error: "That registration no longer exists." };
  if (registration.tournament.organizerId !== user.id) {
    return { error: "Only the tournament's organizer can respond to registrations." };
  }
  if (registration.status !== "PENDING") {
    return { error: "That registration has already been decided." };
  }

  if (!accept) {
    // Rejection and its notification happen together — same reasoning as
    // approval below, just without the capacity race to guard against.
    await prisma.$transaction([
      prisma.tournamentRegistration.update({
        where: { id: registration.id },
        data: { status: "REJECTED", note: parsed.data.reason || null },
      }),
      prisma.notification.create({
        data: {
          userId: registration.team.ownerId,
          kind: "TOURNAMENT_APPLICATION",
          title: `${registration.tournament.name} declined ${registration.team.name}`,
          body: parsed.data.reason
            ? `Organizer's note: "${parsed.data.reason}"`
            : "No reason was given.",
          href: `/tournaments/${registration.tournament.slug}`,
        },
      }),
    ]);
    revalidatePath("/", "layout");
    return { status: "rejected" };
  }

  // Approve: the maxTeams recheck, the seed lookup, the TournamentTeam
  // insert, the registration update, and the notification all run inside
  // one interactive transaction — reading the current count outside a
  // transaction would leave a window where two approvals racing each
  // other both pass the capacity check before either commits.
  try {
    await prisma.$transaction(async (tx) => {
      const approvedCount = await tx.tournamentTeam.count({
        where: { tournamentId: registration.tournamentId },
      });
      if (approvedCount >= registration.tournament.maxTeams) {
        throw new ActionError("This tournament has filled up since the application was submitted.");
      }

      const highestSeed = await tx.tournamentTeam.aggregate({
        where: { tournamentId: registration.tournamentId },
        _max: { seed: true },
      });
      const nextSeed = (highestSeed._max.seed ?? 0) + 1;

      await tx.tournamentTeam.create({
        data: { tournamentId: registration.tournamentId, teamId: registration.teamId, seed: nextSeed },
      });
      await tx.tournamentRegistration.update({
        where: { id: registration.id },
        data: { status: "APPROVED" },
      });
      await tx.notification.create({
        data: {
          userId: registration.team.ownerId,
          kind: "TOURNAMENT_APPLICATION",
          title: `${registration.tournament.name} approved ${registration.team.name}`,
          body: `You're in — seed ${nextSeed} in the ${registration.tournament.teamSize}v${registration.tournament.teamSize} bracket.`,
          href: `/tournaments/${registration.tournament.slug}`,
        },
      });
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }

  revalidatePath("/", "layout");
  return { status: "approved" };
}

const generateBracketInput = z.object({ tournamentId: z.string().min(1) });

export type GenerateBracketResult = { generated: true; matchCount: number } | { error: string };

/**
 * Closes registration and (re)generates the bracket from the tournament's
 * current TournamentTeam seeds — the fix for a bracket that was only ever
 * built once by the seed script and never updated as later registrations
 * got approved. The organizer check, the min-teams and no-results guards,
 * the wipe, and the fresh insert all run inside one interactive
 * transaction: the guards have to be re-read inside it (not just before
 * it) or a result could get reported in the gap between checking and
 * deleting, and the whole thing has to succeed or fail together so a
 * bracket is never left half-wiped.
 */
export async function generateBracketAction(tournamentId: string): Promise<GenerateBracketResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = generateBracketInput.safeParse({ tournamentId });
  if (!parsed.success) return { error: "Invalid tournament." };

  try {
    const matchCount = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: parsed.data.tournamentId },
        include: { teams: { orderBy: { seed: "asc" } } },
      });
      if (!tournament) throw new ActionError("That tournament no longer exists.");
      if (tournament.organizerId !== user.id) {
        throw new ActionError("Only the tournament's organizer can generate the bracket.");
      }
      if (tournament.teams.length < 2) {
        throw new ActionError("At least 2 approved teams are needed to generate a bracket.");
      }

      const existingMatches = await tx.tournamentMatch.findMany({
        where: { tournamentId: tournament.id },
        include: { result: true },
      });
      if (existingMatches.some((match) => match.result)) {
        throw new ActionError(
          "This bracket already has reported results and can't be regenerated without wiping them.",
        );
      }

      await tx.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id } });

      // Seed → teamId comes from the tournament's current TournamentTeam
      // rows, not from re-deriving anything — those seeds are the
      // authoritative record of who's actually approved in, including
      // anyone approved after the last bracket generation.
      const seedToTeam = new Map(tournament.teams.map((entry) => [entry.seed, entry.teamId]));
      const specs = generateBracket(tournament.format, tournament.teams.length);

      // Two passes, same as the seed script: match ids are DB-generated,
      // so winnerNext/loserNext routing can only be wired up once every
      // match in the spec has been created.
      const idByKey = new Map<string, string>();
      for (const spec of specs) {
        const created = await tx.tournamentMatch.create({
          data: {
            tournamentId: tournament.id,
            side: spec.side,
            round: spec.round,
            position: spec.position,
            homeTeamId: spec.homeSeed ? (seedToTeam.get(spec.homeSeed) ?? null) : null,
            awayTeamId: spec.awaySeed ? (seedToTeam.get(spec.awaySeed) ?? null) : null,
            state: spec.isBye ? "BYE" : "PENDING",
          },
        });
        idByKey.set(spec.key, created.id);
      }
      for (const spec of specs) {
        if (!spec.winnerNext && !spec.loserNext) continue;
        await tx.tournamentMatch.update({
          where: { id: idByKey.get(spec.key)! },
          data: {
            winnerNextId: spec.winnerNext ? idByKey.get(spec.winnerNext) : null,
            loserNextId: spec.loserNext ? idByKey.get(spec.loserNext) : null,
          },
        });
      }

      await tx.tournament.update({
        where: { id: tournament.id },
        data: { status: "REGISTRATION_CLOSED" },
      });

      return specs.length;
    });

    revalidatePath("/", "layout");
    return { generated: true, matchCount };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

const REPORTABLE_STATES = new Set(["PENDING", "READY", "LIVE"]);

const reportResultInput = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

export type ReportMatchResultResult = { reported: true } | { error: string };

/**
 * Reports a score for a match. The caller's standing (owner/captain of one
 * of the two teams actually in the match) is re-derived from the DB, not
 * trusted from whichever detail panel happened to render the form.
 */
export async function reportMatchResultAction(
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<ReportMatchResultResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = reportResultInput.safeParse({ matchId, homeScore, awayScore });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid score." };

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: parsed.data.matchId },
    include: { tournament: true, homeTeam: true, awayTeam: true },
  });
  if (!match) return { error: "That match no longer exists." };
  if (!match.homeTeamId || !match.awayTeamId || !match.homeTeam || !match.awayTeam) {
    return { error: "Both teams for this match aren't set yet." };
  }
  if (!REPORTABLE_STATES.has(match.state)) {
    return { error: "This match isn't in a state that can be reported." };
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      userId: user.id,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
      role: { in: ["OWNER", "CAPTAIN"] },
    },
  });
  if (!membership) {
    return { error: "Only a captain or owner of one of the two teams can report this result." };
  }

  if (!isValidMatchScore(match.bestOf, parsed.data.homeScore, parsed.data.awayScore)) {
    return { error: `That score isn't valid for a best-of-${match.bestOf}.` };
  }

  const winnerTeamId = parsed.data.homeScore > parsed.data.awayScore ? match.homeTeamId : match.awayTeamId;
  const reportingTeam = membership.teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
  const opposingTeam = membership.teamId === match.homeTeamId ? match.awayTeam : match.homeTeam;

  // The result, the match's AWAITING_CONFIRMATION flip, and the opposing
  // team's notification happen together — same reasoning as every other
  // notified action in this file: the notification can't exist without
  // the write it's about, and vice versa.
  await prisma.$transaction([
    prisma.matchResult.create({
      data: {
        matchId: match.id,
        winnerTeamId,
        homeScore: parsed.data.homeScore,
        awayScore: parsed.data.awayScore,
        reportedById: user.id,
      },
    }),
    prisma.tournamentMatch.update({
      where: { id: match.id },
      data: {
        state: "AWAITING_CONFIRMATION",
        homeScore: parsed.data.homeScore,
        awayScore: parsed.data.awayScore,
      },
    }),
    prisma.notification.create({
      data: {
        userId: opposingTeam.ownerId,
        kind: "MATCH_RESULT_REPORTED",
        title: `${reportingTeam.name} reported a score against ${opposingTeam.name}`,
        body: `${parsed.data.homeScore}–${parsed.data.awayScore} in ${match.tournament.name}. Confirm or dispute from the bracket.`,
        href: `/tournaments/${match.tournament.slug}?tab=bracket`,
      },
    }),
  ]);

  revalidatePath("/", "layout");
  return { reported: true };
}

const confirmResultInput = z.object({
  matchId: z.string().min(1),
  disputeNote: z.string().trim().max(300).optional(),
});

export type ConfirmMatchResultResult = { status: "completed" | "disputed" } | { error: string };

/**
 * Confirms or disputes a reported result. Confirming is the last step of
 * the tournament loop: it locks the match, updates both the tournament
 * standing (TournamentTeam) and the team's career record (Team), marks the
 * loser eliminated where the format calls for it, and advances both teams
 * along the routing generateBracketAction already wired up. Everything —
 * the re-checked guards, the counters, the elimination flag, and the
 * advancement — runs inside one interactive transaction.
 *
 * Confirming also notifies whoever reported the result (MATCH_CONFIRMED)
 * that it's final — previously this branch told nobody, so the only way
 * the reporter found out was noticing the bracket had moved on. That
 * notification is written after the transaction commits, not inside it
 * (see the details it needs collected into `pendingNotification` below),
 * same "don't let a side effect fail the actual action" reasoning as
 * notify() itself.
 */
export async function confirmMatchResultAction(
  matchId: string,
  accept: boolean,
  disputeNote?: string,
): Promise<ConfirmMatchResultResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = confirmResultInput.safeParse({ matchId, disputeNote });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid response." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const match = await tx.tournamentMatch.findUnique({
        where: { id: parsed.data.matchId },
        include: { tournament: true, homeTeam: true, awayTeam: true, result: true },
      });
      if (!match) throw new ActionError("That match no longer exists.");
      if (!match.homeTeamId || !match.awayTeamId || !match.homeTeam || !match.awayTeam) {
        throw new ActionError("Both teams for this match aren't set.");
      }
      if (match.state !== "AWAITING_CONFIRMATION" || !match.result || !match.result.winnerTeamId) {
        throw new ActionError("This match doesn't have a result awaiting confirmation.");
      }

      const membership = await tx.teamMember.findFirst({
        where: {
          userId: user.id,
          teamId: { in: [match.homeTeamId, match.awayTeamId] },
          role: { in: ["OWNER", "CAPTAIN"] },
        },
      });
      if (!membership) {
        throw new ActionError("Only a captain or owner of one of the two teams can respond to this result.");
      }
      // Belt and suspenders: the literal reporter is always blocked, and —
      // when the reporter's own team membership can still be resolved —
      // so is anyone else on that same team. (If the reporter has since
      // left both teams, that second check can't be made; the identity
      // check still holds regardless.)
      if (user.id === match.result.reportedById) {
        throw new ActionError("You can't confirm your own report.");
      }
      const reporterMembership = await tx.teamMember.findFirst({
        where: { userId: match.result.reportedById, teamId: { in: [match.homeTeamId, match.awayTeamId] } },
      });
      if (reporterMembership && reporterMembership.teamId === membership.teamId) {
        throw new ActionError("Only the other team can confirm this result.");
      }

      if (!accept) {
        await tx.matchResult.update({
          where: { matchId: match.id },
          data: { disputed: true, disputeNote: parsed.data.disputeNote || null },
        });
        await tx.tournamentMatch.update({ where: { id: match.id }, data: { state: "DISPUTED" } });
        await tx.notification.create({
          data: {
            userId: match.tournament.organizerId,
            kind: "MATCH_DISPUTED",
            title: `Disputed result in ${match.tournament.name}`,
            body: `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}${
              parsed.data.disputeNote ? ` — "${parsed.data.disputeNote}"` : ""
            }`,
            href: `/tournaments/${match.tournament.slug}?tab=bracket`,
          },
        });
        return { status: "disputed" as const };
      }

      const winnerTeamId = match.result.winnerTeamId;
      const loserTeamId = winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

      await tx.matchResult.update({ where: { matchId: match.id }, data: { confirmedById: user.id } });
      await tx.tournamentMatch.update({ where: { id: match.id }, data: { state: "COMPLETED" } });

      const eliminated = isEliminatingLoss(match.tournament.format, match.side);
      await tx.tournamentTeam.update({
        where: { tournamentId_teamId: { tournamentId: match.tournamentId, teamId: winnerTeamId } },
        data: { wins: { increment: 1 } },
      });
      await tx.tournamentTeam.update({
        where: { tournamentId_teamId: { tournamentId: match.tournamentId, teamId: loserTeamId } },
        data: { losses: { increment: 1 }, ...(eliminated ? { eliminated: true } : {}) },
      });
      await tx.team.update({ where: { id: winnerTeamId }, data: { wins: { increment: 1 } } });
      await tx.team.update({ where: { id: loserTeamId }, data: { losses: { increment: 1 } } });

      await fillNextSlot(tx, match.winnerNextId, winnerTeamId);
      await fillNextSlot(tx, match.loserNextId, loserTeamId);

      return {
        status: "completed" as const,
        pendingNotification: {
          reportedById: match.result.reportedById,
          tournamentName: match.tournament.name,
          tournamentSlug: match.tournament.slug,
          winnerName: winnerTeamId === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name,
          loserName: winnerTeamId === match.homeTeamId ? match.awayTeam.name : match.homeTeam.name,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        },
      };
    });

    if (result.status === "completed") {
      const { pendingNotification: n } = result;
      await notify({
        userId: n.reportedById,
        kind: "MATCH_CONFIRMED",
        title: "Your reported result is final",
        body: `${n.winnerName} beat ${n.loserName} ${n.homeScore}–${n.awayScore} in ${n.tournamentName}. The match is now confirmed.`,
        href: `/tournaments/${n.tournamentSlug}?tab=bracket`,
      });
    }

    revalidatePath("/", "layout");
    return { status: result.status };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

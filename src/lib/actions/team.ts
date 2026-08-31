"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { avatarSrc } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MANAGER_ROLES = new Set(["OWNER", "CAPTAIN"]);

const schema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters").max(40, "Keep it under 40 characters"),
  tag: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9]{3,4}$/.test(value), "3–4 letters or numbers"),
  region: z.string().trim().min(2, "Pick a region"),
  description: z.string().trim().max(500, "Keep it under 500 characters"),
  games: z.array(z.string()).min(1, "Pick at least one game"),
});

type TeamField = "name" | "tag" | "region" | "description" | "games";

export type TeamFormState =
  | { error?: string; fieldErrors?: Partial<Record<TeamField, string>> }
  | undefined;

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "team";
}

/** Appends -2, -3, … until it finds a slug nothing else is using. */
async function uniqueSlug(base: string) {
  let slug = base;
  for (let suffix = 2; await prisma.team.findUnique({ where: { slug }, select: { id: true } }); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function createTeamAction(
  _state: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    name: formData.get("name"),
    tag: formData.get("tag"),
    region: formData.get("region"),
    description: formData.get("description") ?? "",
    games: formData.getAll("games").map(String),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (typeof field === "string") {
      return { fieldErrors: { [field as TeamField]: issue.message } };
    }
    return { error: "Check the form and try again." };
  }
  const { name, tag, region, description, games } = parsed.data;

  // Name and tag aren't DB-unique-constrained (only slug is), so a
  // collision here would otherwise fall through as a confusing duplicate
  // team rather than a clear field error.
  const existing = await prisma.team.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: "insensitive" } }, { tag: { equals: tag, mode: "insensitive" } }],
    },
    select: { name: true, tag: true },
  });
  if (existing) {
    return existing.name.toLowerCase() === name.toLowerCase()
      ? { fieldErrors: { name: "That team name is taken." } }
      : { fieldErrors: { tag: "That tag is taken." } };
  }

  const gameRows = await prisma.game.findMany({ where: { slug: { in: games } } });
  if (gameRows.length === 0) {
    return { fieldErrors: { games: "Pick at least one game." } };
  }

  const slug = await uniqueSlug(slugify(name));

  // A single nested-write create — Team, its TeamGame rows, and the
  // creator's TeamMember row — runs as one atomic operation, so there's no
  // window where a Team exists without its games or its owner.
  const team = await prisma.team.create({
    data: {
      slug,
      name,
      tag,
      region,
      ownerId: user.id,
      description: description || null,
      logoSeed: slug,
      games: { create: gameRows.map((game) => ({ gameId: game.id })) },
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  redirect(`/teams/${team.slug}`);
}

export type LeaveTeamResult = { left: boolean } | { error: string };

/**
 * Leaves a team on behalf of the signed-in user. Refuses for the owner —
 * that's surfaced as a plain error the caller must show, not a button that
 * silently does nothing, since disbanding or transferring ownership isn't
 * something this action can decide on the owner's behalf.
 */
export async function leaveTeamAction(teamId: string): Promise<LeaveTeamResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
  });
  if (!membership) return { error: "You're not on this team." };
  if (membership.role === "OWNER") {
    return { error: "Owners can't leave their own team. Transfer ownership or disband the team first." };
  }

  await prisma.teamMember.delete({ where: { id: membership.id } });
  revalidatePath("/", "layout");
  return { left: true };
}

const searchInput = z.object({
  teamId: z.string().min(1),
  query: z.string().trim().min(1).max(40),
});

export type InvitableUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | undefined;
};

/**
 * Backs the invite typeahead. Deliberately not gated to owner/captain —
 * it's a convenience for finding a username to invite, not a mutation, and
 * inviteToTeamAction re-checks manager permission and every other
 * invariant (self-invite, already a member, already invited) from
 * scratch regardless of what this returned. On bad input or no session it
 * just returns no matches rather than an error — there's nothing
 * meaningful to show partway through typing.
 */
export async function searchInvitableUsersAction(teamId: string, query: string): Promise<InvitableUser[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const parsed = searchInput.safeParse({ teamId, query });
  if (!parsed.success) return [];

  const [members, invites] = await Promise.all([
    prisma.teamMember.findMany({ where: { teamId: parsed.data.teamId }, select: { userId: true } }),
    prisma.teamInvite.findMany({ where: { teamId: parsed.data.teamId }, select: { userId: true } }),
  ]);
  const excluded = [
    user.id,
    ...members.map((member) => member.userId),
    ...invites.map((invite) => invite.userId),
  ];

  const matches = await prisma.user.findMany({
    where: {
      id: { notIn: excluded },
      OR: [
        { username: { contains: parsed.data.query, mode: "insensitive" } },
        { displayName: { contains: parsed.data.query, mode: "insensitive" } },
      ],
    },
    select: { id: true, username: true, displayName: true, profile: { select: { avatarUrl: true } } },
    orderBy: { username: "asc" },
    take: 8,
  });
  return matches.map(({ profile, ...match }) => ({ ...match, avatarUrl: avatarSrc(profile?.avatarUrl) }));
}

const inviteInput = z.object({
  teamId: z.string().min(1),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Enter a username"),
});

export type InviteToTeamResult = { invited: boolean } | { error: string };

/**
 * Invites a player to a team by username. Permission (owner/captain) is
 * checked here against the DB, not left to the UI hiding the invite form —
 * a request straight to this action from a non-manager is rejected the
 * same way a manager's would succeed.
 */
export async function inviteToTeamAction(teamId: string, username: string): Promise<InviteToTeamResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = inviteInput.safeParse({ teamId, username });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid invite." };

  const inviter = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: parsed.data.teamId, userId: user.id } },
    include: { team: { select: { slug: true, name: true } } },
  });
  if (!inviter || !MANAGER_ROLES.has(inviter.role)) {
    return { error: "Only the owner or a captain can invite players." };
  }

  const target = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!target) return { error: "No player with that username." };
  if (target.id === user.id) return { error: "You can't invite yourself." };

  const [alreadyMember, existingInvite] = await Promise.all([
    prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parsed.data.teamId, userId: target.id } },
    }),
    prisma.teamInvite.findUnique({
      where: { teamId_userId: { teamId: parsed.data.teamId, userId: target.id } },
    }),
  ]);
  if (alreadyMember) return { error: "That player is already on the roster." };
  if (existingInvite) return { error: "That player already has a pending invite." };

  // The invite and its notification are created in one transaction so an
  // invite can never exist without the recipient having some way to find
  // out about it — otherwise it's only discoverable by guessing the team's
  // URL (see the module comment above).
  await prisma.$transaction([
    prisma.teamInvite.create({
      data: { teamId: parsed.data.teamId, userId: target.id, invitedById: user.id },
    }),
    prisma.notification.create({
      data: {
        userId: target.id,
        kind: "TEAM_INVITE",
        title: `${user.displayName} invited you to join ${inviter.team.name}`,
        body: `You've been invited to play for ${inviter.team.name}. Accept or decline from the team page.`,
        href: `/teams/${inviter.team.slug}`,
      },
    }),
  ]);
  revalidatePath("/", "layout");
  return { invited: true };
}

export type RespondToTeamInviteResult = { status: "accepted" | "declined" } | { error: string };

/**
 * Accepts or declines an invite. The invite's recipient is re-checked
 * against the session here — this is the actual authorization boundary,
 * not whichever page happens to render the Accept/Decline buttons.
 */
export async function respondToTeamInviteAction(
  inviteId: string,
  accept: boolean,
): Promise<RespondToTeamInviteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const invite = await prisma.teamInvite.findUnique({
    where: { id: inviteId },
    include: { team: { select: { slug: true } } },
  });
  if (!invite) return { error: "That invite no longer exists." };
  if (invite.userId !== user.id) return { error: "That invite isn't yours." };

  // The invite notification's href points at the invite action (accept/
  // decline from the team page) — once the invite is resolved that action
  // no longer applies, so the notification is deleted alongside it rather
  // than left pointing at a stale prompt. Matched by href since the
  // notification row isn't linked to the invite by id.
  const notificationFilter = {
    userId: user.id,
    kind: "TEAM_INVITE" as const,
    href: `/teams/${invite.team.slug}`,
  };

  if (accept) {
    await prisma.$transaction([
      prisma.teamMember.create({
        data: { teamId: invite.teamId, userId: user.id, role: invite.role },
      }),
      prisma.teamInvite.delete({ where: { id: invite.id } }),
      prisma.notification.deleteMany({ where: notificationFilter }),
    ]);
  } else {
    // Deleting rather than marking DECLINED means nothing stops the same
    // person being re-invited immediately, and immediately again — no
    // record of a decline survives to rate-limit or warn against it. Known
    // gap, not solved here (see the TeamInvite model comment in schema.prisma).
    await prisma.$transaction([
      prisma.teamInvite.delete({ where: { id: invite.id } }),
      prisma.notification.deleteMany({ where: notificationFilter }),
    ]);
  }

  revalidatePath("/", "layout");
  return { status: accept ? "accepted" : "declined" };
}

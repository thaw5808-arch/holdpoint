"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MOD_ROLES = new Set(["MODERATOR", "ADMIN", "OWNER"]);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "community";
}

/** Appends -2, -3, … until it finds a slug nothing else is using — same
 * pattern as uniqueSlug in actions/team.ts and uniqueClipSlug in
 * actions/clip.ts. */
async function uniqueCommunitySlug(base: string) {
  let slug = base;
  for (let suffix = 2; await prisma.community.findUnique({ where: { slug }, select: { id: true } }); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

const createCommunitySchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters").max(40, "Keep it under 40 characters"),
  tagline: z.string().trim().min(3, "Use at least 3 characters").max(80, "Keep it under 80 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Say a bit more about the community")
    .max(500, "Keep it under 500 characters"),
  // A game slug, or "" for no specific game — Community.gameId is
  // optional in the schema, same as it is on Profile.
  game: z.string().trim(),
  visibility: z.enum(["public", "private"]),
});

type CreateCommunityField = "name" | "tagline" | "description" | "game" | "visibility";

export type CreateCommunityFormState =
  | { error?: string; fieldErrors?: Partial<Record<CreateCommunityField, string>> }
  | undefined;

/**
 * The three default channels every new community starts with, so it isn't
 * empty the moment its owner lands on it. Deliberately a smaller set than
 * the seeded demo communities' six (which also have looking-for-team,
 * ranked and tournament-talk) — those assume an established, game-focused
 * community with real traffic, and there's no in-app way yet to rename or
 * remove a channel (see actions/community.ts's other exports — channel
 * management isn't built), so seeding niche channels a brand-new owner is
 * stuck with would be worse than a small, generally-useful default:
 *   - announcements: read-only-by-convention (see the ANNOUNCEMENT-kind
 *     check in createCommunityPostAction below) space for the owner to
 *     post updates from day one.
 *   - general: the obvious catch-all.
 *   - clips: ties into the site's clip-sharing identity regardless of
 *     which game (or no game) the community is about.
 */
const DEFAULT_CHANNELS = [
  { name: "announcements", kind: "ANNOUNCEMENT" as const, position: 0, topic: "Read-only. Events and rule changes." },
  { name: "general", kind: "TEXT" as const, position: 1, topic: "Anything goes, keep it civil." },
  { name: "clips", kind: "CLIPS" as const, position: 2 },
];

/**
 * Creates a community with its creator as OWNER and memberCount starting
 * at 1 — Community, its default channels, and the owner's CommunityMember
 * row all go in as one nested-write create, the same "no window where the
 * owner-less/channel-less thing exists" reasoning as createTeamAction in
 * actions/team.ts.
 */
export async function createCommunityAction(
  _state: CreateCommunityFormState,
  formData: FormData,
): Promise<CreateCommunityFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = createCommunitySchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline"),
    description: formData.get("description"),
    game: formData.get("game") ?? "",
    visibility: formData.get("visibility"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (typeof field === "string") {
      return { fieldErrors: { [field as CreateCommunityField]: issue.message } };
    }
    return { error: "Check the form and try again." };
  }
  const { name, tagline, description, game, visibility } = parsed.data;

  // Name isn't DB-unique-constrained (only slug is) — same reasoning as
  // createTeamAction: check it explicitly so a collision surfaces as a
  // clear field error instead of silently minting a second, confusingly
  // similarly-named community.
  const existing = await prisma.community.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { fieldErrors: { name: "That community name is taken." } };

  let gameId: string | null = null;
  if (game) {
    const gameRow = await prisma.game.findUnique({ where: { slug: game }, select: { id: true } });
    if (!gameRow) return { fieldErrors: { game: "Pick a valid game." } };
    gameId = gameRow.id;
  }

  const slug = await uniqueCommunitySlug(slugify(name));

  const community = await prisma.community.create({
    data: {
      slug,
      name,
      tagline,
      description,
      gameId,
      isPublic: visibility === "public",
      memberCount: 1,
      channels: { create: DEFAULT_CHANNELS },
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  redirect(`/communities/${community.slug}`);
}

const input = z.object({ communityId: z.string().min(1) });

export type ToggleCommunityMembershipResult = { joined: boolean } | { error: string };

/**
 * Joins or leaves `communityId` on behalf of the signed-in user. The member
 * is always resolved from the session, never from a client-supplied id.
 * Community.memberCount is a denormalised counter (used for sort order on
 * the discover/communities listings) — it's updated in the same transaction
 * as the CommunityMember row so the two can never drift apart.
 */
export async function toggleCommunityMembershipAction(
  communityId: string,
): Promise<ToggleCommunityMembershipResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to join." };

  const parsed = input.safeParse({ communityId });
  if (!parsed.success) return { error: "Invalid community." };

  const community = await prisma.community.findUnique({
    where: { id: parsed.data.communityId },
    select: { id: true },
  });
  if (!community) return { error: "That community doesn't exist." };

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId: user.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.communityMember.delete({ where: { id: existing.id } }),
      prisma.community.update({
        where: { id: community.id },
        data: { memberCount: { decrement: 1 } },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.communityMember.create({ data: { communityId: community.id, userId: user.id } }),
      prisma.community.update({
        where: { id: community.id },
        data: { memberCount: { increment: 1 } },
      }),
    ]);
  }

  // Member counts and this membership also show up on the discover and
  // communities listing pages, not just the community page itself.
  revalidatePath("/", "layout");

  return { joined: !existing };
}

const createPostInput = z.object({
  channelId: z.string().min(1),
  body: z.string().trim().min(1, "Say something first.").max(2000, "Keep it under 2000 characters."),
});

export type CreateCommunityPostResult = { created: true } | { error: string };

/**
 * Posts to a channel. Membership (and, for an announcement channel,
 * moderator standing) is re-derived from the DB here — the composer only
 * renders for members in the first place, but that's a display
 * convenience, not the authorization boundary.
 */
export async function createCommunityPostAction(
  channelId: string,
  body: string,
): Promise<CreateCommunityPostResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to post." };

  const parsed = createPostInput.safeParse({ channelId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid post." };

  const channel = await prisma.communityChannel.findUnique({
    where: { id: parsed.data.channelId },
    select: { id: true, communityId: true, kind: true },
  });
  if (!channel) return { error: "That channel no longer exists." };

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId: user.id } },
  });
  if (!membership) return { error: "You need to join this community to post." };

  if (channel.kind === "ANNOUNCEMENT" && !MOD_ROLES.has(membership.role)) {
    return { error: "Only moderators can post in an announcement channel." };
  }

  await prisma.communityPost.create({
    data: { channelId: channel.id, authorId: user.id, body: parsed.data.body },
  });

  revalidatePath("/", "layout");
  return { created: true };
}

const deletePostInput = z.object({ postId: z.string().min(1) });

export type DeleteCommunityPostResult = { deleted: true } | { error: string };

/**
 * Deletes (soft) a post. Allowed for the post's own author, or for a
 * moderator (MODERATOR/ADMIN/OWNER) of the community the post's channel
 * belongs to — both re-checked against the DB, not trusted from which
 * delete button happened to render.
 *
 * An author can delete their own post in any channel, including one they
 * couldn't currently post in themselves (e.g. an announcement channel
 * they're not a moderator of) — this isn't a hole in the announcement
 * restriction, it's a separate rule: that restriction governs who can add
 * new posts to the channel, not who can retract their own words from it.
 * Retracting your own post has to stay available even after a demotion or
 * a role change, so authorship is checked first and short-circuits the
 * channel-kind/moderator check entirely.
 */
export async function deleteCommunityPostAction(postId: string): Promise<DeleteCommunityPostResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = deletePostInput.safeParse({ postId });
  if (!parsed.success) return { error: "Invalid post." };

  const post = await prisma.communityPost.findUnique({
    where: { id: parsed.data.postId },
    include: { channel: { select: { communityId: true } } },
  });
  if (!post) return { error: "That post no longer exists." };
  if (post.deletedAt) return { error: "That post has already been deleted." };

  const isAuthor = post.authorId === user.id;
  if (!isAuthor) {
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: post.channel.communityId, userId: user.id } },
    });
    if (!membership || !MOD_ROLES.has(membership.role)) {
      return { error: "You can't delete this post." };
    }
  }

  // Soft-deleted rather than removed: a moderator deleting someone else's
  // post is a moderation action, and hard-deleting it would leave no
  // record of who did it or that it happened at all. The row (and
  // deletedById) survives, hidden from channel queries — see
  // CommunityPost.deletedAt in schema.prisma.
  await prisma.communityPost.update({
    where: { id: post.id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });

  revalidatePath("/", "layout");
  return { deleted: true };
}

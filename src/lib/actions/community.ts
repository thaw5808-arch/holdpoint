"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHANNEL_KINDS } from "@/lib/channel-kinds";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MOD_ROLES = new Set(["MODERATOR", "ADMIN", "OWNER"]);

/** Re-checks `userId`'s standing in `communityId` from the DB — shared by
 * every channel-management action below, the same "the page only hiding a
 * control isn't the authorization boundary" stance as the post actions
 * already take on MOD_ROLES. */
async function requireCommunityModerator(
  communityId: string,
  userId: string,
): Promise<{ error: string } | { ok: true }> {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership || !MOD_ROLES.has(membership.role)) {
    return { error: "You don't have permission to do that." };
  }
  return { ok: true };
}

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
    select: { id: true, communityId: true, kind: true, deletedAt: true },
  });
  if (!channel || channel.deletedAt) return { error: "That channel no longer exists." };

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId: user.id } },
  });
  if (!membership) return { error: "You need to join this community to post." };

  if (channel.kind === "ANNOUNCEMENT" && !MOD_ROLES.has(membership.role)) {
    return { error: "Only moderators can post in an announcement channel." };
  }
  // VOICE channels have no text UI at all — see VoiceChannelView in
  // [slug]/page.tsx — so this can't just be a client-side omission of the
  // composer; a direct call has to be rejected here too.
  if (channel.kind === "VOICE") {
    return { error: "You can't post text messages in a voice channel." };
  }
  // Same reasoning as VOICE above: a CLIPS channel renders a clip picker
  // in place of the plain-text composer (see ClipsChannelComposer in
  // [slug]/page.tsx), so a direct call has to be rejected here too rather
  // than accepting a body-only post with no clip attached. Posting there
  // goes through shareClipToChannelAction or finalizeChannelClipUploadAction
  // instead, both of which require a real clipId.
  if (channel.kind === "CLIPS") {
    return { error: "Share a clip to post in a clips channel." };
  }

  await prisma.communityPost.create({
    data: { channelId: channel.id, authorId: user.id, body: parsed.data.body },
  });

  revalidatePath("/", "layout");
  return { created: true };
}

const shareClipInput = z.object({
  channelId: z.string().min(1),
  clipId: z.string().min(1),
  caption: z.string().trim().max(280, "Keep it under 280 characters").optional(),
});

export type ShareClipToChannelResult = { created: true } | { error: string };

/**
 * Posts one of the caller's own clips into a CLIPS-kind channel — the
 * "pick an existing clip" half of sharing a clip (see
 * finalizeChannelClipUploadAction in actions/clip.ts for the "upload a new
 * one" half, which reuses the presigned R2 upload + server-side poster
 * extraction rather than this action touching R2 at all). Scoped to the
 * caller's own clips: sharing into a channel is "post from your library",
 * not "post any clip on the site", the same ownership check
 * deleteClipAction applies to deleting one.
 */
export async function shareClipToChannelAction(
  channelId: string,
  clipId: string,
  caption: string,
): Promise<ShareClipToChannelResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to post." };

  const parsed = shareClipInput.safeParse({ channelId, clipId, caption });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const channel = await prisma.communityChannel.findUnique({
    where: { id: parsed.data.channelId },
    select: { id: true, communityId: true, kind: true, deletedAt: true },
  });
  if (!channel || channel.deletedAt) return { error: "That channel no longer exists." };
  if (channel.kind !== "CLIPS") return { error: "That's not a clips channel." };

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId: user.id } },
  });
  if (!membership) return { error: "You need to join this community to post." };

  const clip = await prisma.clip.findUnique({
    where: { id: parsed.data.clipId },
    select: { id: true, userId: true },
  });
  if (!clip) return { error: "That clip no longer exists." };
  if (clip.userId !== user.id) return { error: "You can only share your own clips." };

  await prisma.communityPost.create({
    data: { channelId: channel.id, authorId: user.id, body: parsed.data.caption ?? "", clipId: clip.id },
  });

  revalidatePath("/", "layout");
  return { created: true };
}

export type ShareableClip = {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | undefined;
  durationSec: number;
};

/**
 * Backs the clip-share composer's "pick one of your clips" list — the
 * caller's own clips, newest first. Same role as clipShareCandidatesAction
 * in actions/clip.ts, but listing clips to choose from rather than people
 * to send one to.
 */
export async function myClipsForChannelAction(): Promise<ShareableClip[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const clips = await prisma.clip.findMany({
    where: { userId: user.id },
    select: { id: true, slug: true, title: true, thumbnailUrl: true, durationSec: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return clips.map(({ thumbnailUrl, ...clip }) => ({ ...clip, thumbnailUrl: clipPosterSrc(thumbnailUrl) }));
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

// ---------------------------------------------------------- channels
// Create/rename/delete/reorder — every one of these re-derives the
// caller's CommunityMember role from the DB via requireCommunityModerator
// above, never from a client-supplied flag, since the sidebar only
// hiding these controls for a non-moderator is a display nicety.

const channelNameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters")
  .max(30, "Keep it under 30 characters");

// Channel names double as their URL identifier (see the `?channel=`
// query param on the community page), the same reason team/community
// names get turned into slugs — so a channel is named the same way, with
// its own local slugify rather than importing the other actions files'
// (each of Team/Community/Clip already keeps its own copy of this exact
// shape, not a shared helper).
function slugifyChannelName(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "channel";
}

/** Appends -2, -3, … until it finds a name nothing else in the community
 * is using — scoped to communityId since @@unique([communityId, name]) is
 * per-community, not global. Considers soft-deleted channels too (their
 * rows, and the unique constraint on their name, still exist), and can
 * exclude a channel's own id so renaming it to a name it already has —
 * or a name only it was using — doesn't get suffixed against itself. */
async function uniqueChannelName(communityId: string, base: string, excludeChannelId?: string) {
  let name = base;
  for (
    let suffix = 2;
    await prisma.communityChannel.findFirst({
      where: { communityId, name, ...(excludeChannelId ? { id: { not: excludeChannelId } } : {}) },
      select: { id: true },
    });
    suffix++
  ) {
    name = `${base}-${suffix}`;
  }
  return name;
}

const createChannelSchema = z.object({
  communityId: z.string().min(1),
  name: channelNameSchema,
  kind: z.enum(CHANNEL_KINDS),
});

export type CreateCommunityChannelResult =
  | { created: true; channel: { id: string; name: string; kind: string } }
  | { error: string };

/** Adds a channel to the end of the sidebar (highest position + 1). */
export async function createCommunityChannelAction(
  communityId: string,
  name: string,
  kind: string,
): Promise<CreateCommunityChannelResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = createChannelSchema.safeParse({ communityId, name, kind });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid channel." };

  const auth = await requireCommunityModerator(parsed.data.communityId, user.id);
  if ("error" in auth) return auth;

  const channelName = await uniqueChannelName(parsed.data.communityId, slugifyChannelName(parsed.data.name));
  const highest = await prisma.communityChannel.aggregate({
    where: { communityId: parsed.data.communityId },
    _max: { position: true },
  });

  const channel = await prisma.communityChannel.create({
    data: {
      communityId: parsed.data.communityId,
      name: channelName,
      kind: parsed.data.kind,
      position: (highest._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/", "layout");
  return { created: true, channel: { id: channel.id, name: channel.name, kind: channel.kind } };
}

const renameChannelSchema = z.object({ channelId: z.string().min(1), name: channelNameSchema });

export type RenameCommunityChannelResult = { renamed: true; name: string } | { error: string };

export async function renameCommunityChannelAction(
  channelId: string,
  name: string,
): Promise<RenameCommunityChannelResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = renameChannelSchema.safeParse({ channelId, name });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name." };

  const channel = await prisma.communityChannel.findUnique({
    where: { id: parsed.data.channelId },
    select: { id: true, communityId: true, deletedAt: true },
  });
  if (!channel || channel.deletedAt) return { error: "That channel no longer exists." };

  const auth = await requireCommunityModerator(channel.communityId, user.id);
  if ("error" in auth) return auth;

  const newName = await uniqueChannelName(channel.communityId, slugifyChannelName(parsed.data.name), channel.id);

  await prisma.communityChannel.update({ where: { id: channel.id }, data: { name: newName } });

  revalidatePath("/", "layout");
  return { renamed: true, name: newName };
}

const channelIdInput = z.object({ channelId: z.string().min(1) });

export type DeleteCommunityChannelResult = { deleted: true } | { error: string };

/**
 * Soft-deletes a channel — see the schema comment on
 * CommunityChannel.deletedAt for why this doesn't touch its posts. Blocked
 * when it's the last channel standing: a community with zero channels has
 * nowhere for [slug]/page.tsx's `active` channel resolution to fall back
 * to, and nowhere left to post.
 */
export async function deleteCommunityChannelAction(channelId: string): Promise<DeleteCommunityChannelResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = channelIdInput.safeParse({ channelId });
  if (!parsed.success) return { error: "Invalid channel." };

  const channel = await prisma.communityChannel.findUnique({
    where: { id: parsed.data.channelId },
    select: { id: true, communityId: true, deletedAt: true },
  });
  if (!channel || channel.deletedAt) return { error: "That channel no longer exists." };

  const auth = await requireCommunityModerator(channel.communityId, user.id);
  if ("error" in auth) return auth;

  const remaining = await prisma.communityChannel.count({
    where: { communityId: channel.communityId, deletedAt: null },
  });
  if (remaining <= 1) return { error: "A community needs at least one channel." };

  await prisma.communityChannel.update({
    where: { id: channel.id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });

  revalidatePath("/", "layout");
  return { deleted: true };
}

const reorderChannelsSchema = z.object({
  communityId: z.string().min(1),
  channelIds: z.array(z.string().min(1)).min(1),
});

export type ReorderCommunityChannelsResult = { reordered: true } | { error: string };

/**
 * Persists a full drag-and-drop reorder in one go: `channelIds` is the
 * complete list of a community's visible channels in their new order, and
 * every channel in it gets re-numbered to its index in that array. Simpler
 * and more robust than a series of pairwise neighbor-swaps (what this
 * replaced) for an arbitrary drag distance — dragging a channel from the
 * top to the bottom is one call instead of N.
 *
 * Any id in `channelIds` that isn't actually a live channel of this
 * community any more (deleted, or from a stale/tampered payload) is
 * silently dropped rather than trusted — a concurrent delete mid-drag
 * shouldn't be able to reposition something else by proxy.
 */
export async function reorderCommunityChannelsAction(
  communityId: string,
  channelIds: string[],
): Promise<ReorderCommunityChannelsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = reorderChannelsSchema.safeParse({ communityId, channelIds });
  if (!parsed.success) return { error: "Invalid request." };

  const auth = await requireCommunityModerator(parsed.data.communityId, user.id);
  if ("error" in auth) return auth;

  const existing = await prisma.communityChannel.findMany({
    where: {
      communityId: parsed.data.communityId,
      deletedAt: null,
      id: { in: parsed.data.channelIds },
    },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row) => row.id));
  const orderedIds = parsed.data.channelIds.filter((id) => existingIds.has(id));
  if (orderedIds.length === 0) return { error: "Invalid channel order." };

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.communityChannel.update({ where: { id }, data: { position: index } })),
  );

  revalidatePath("/", "layout");
  return { reordered: true };
}

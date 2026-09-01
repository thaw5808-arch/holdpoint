"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { avatarSrc } from "@/lib/avatar-url";
import type { ClipMessagePayload } from "@/lib/clip-message";
import { clipPosterSrc, clipVideoSrc } from "@/lib/clip-video-url";
import { fetchClipFeedPage, type ClipFeedCursor, type FeedClip } from "@/lib/clips";
import { compactNumber, duration as formatDuration } from "@/lib/format";
import { notify } from "@/lib/notify";
import { extractPosterFrame } from "@/lib/poster";
import { MAX_CLIP_BYTES, MAX_CLIP_DURATION_SEC, extensionFor, sniffVideoType } from "@/lib/video-sniff";
import { probeVideoDurationSec } from "@/lib/video-probe";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionId, getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";

// How many leading bytes of an uploaded object get read back for the
// post-upload sniff. Every signature sniffVideoType checks for lives
// within the first 12 bytes; 64 leaves comfortable room without pulling
// back any more of a (possibly 600MB) object than necessary.
const SNIFF_PREFIX_BYTES = 64;

function slugifyClipTitle(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "clip";
}

/** Appends -2, -3, … until it finds a slug nothing else is using. */
async function uniqueClipSlug(base: string) {
  let slug = base;
  for (let suffix = 2; await prisma.clip.findUnique({ where: { slug }, select: { id: true } }); suffix++) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

/**
 * Reads back the first `byteCount` bytes of an object that's supposedly
 * already in the bucket, via a signed GET + Range request — the same
 * "sign a URL, fetch it, forward what R2 says" shape as the clip-serving
 * route. Returns null if the object doesn't exist or the request
 * otherwise fails, which callers treat as "the upload never landed."
 *
 * Also reports the object's real total size, off the `Content-Range`
 * header a satisfied Range request comes back with (`bytes 0-63/<total>`)
 * — the size cap's own server-side re-check reads this rather than
 * trusting the `fileSize` the client claimed back when it requested the
 * upload URL, same "trust the bytes, not the request" stance as the
 * sniff below. Null if that header is missing for some reason (an
 * unexpected 200 instead of 206, say) — callers skip the re-check rather
 * than fail an upload over a header they can't read.
 */
async function readObjectPrefix(
  key: string,
  byteCount: number,
): Promise<{ bytes: Buffer; totalSize: number | null } | null> {
  const url = await storage.getUrl(key);
  const response = await fetch(url, { headers: { range: `bytes=0-${byteCount - 1}` } });
  if (!response.ok) return null;
  const contentRange = response.headers.get("content-range"); // "bytes 0-63/1234567"
  const totalSize = contentRange ? Number(contentRange.split("/")[1]) : NaN;
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    totalSize: Number.isFinite(totalSize) ? totalSize : null,
  };
}

const UPLOADABLE_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"] as const;

const requestClipUploadSchema = z.object({
  fileSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_CLIP_BYTES, `Keep it under ${Math.floor(MAX_CLIP_BYTES / (1024 * 1024))}MB.`),
  contentType: z.enum(UPLOADABLE_VIDEO_TYPES),
});

export type RequestClipUploadResult = { uploadUrl: string; key: string } | { error: string };

/**
 * Step 1 of the clip upload flow: authorizes a direct-to-R2 upload and
 * hands back a presigned PUT URL plus the key it's for. None of the
 * video's bytes pass through this process — Server Actions cap request
 * bodies at 1MB, far below what a clip needs, so the browser has to talk
 * to R2 directly instead of routing the file through an action.
 *
 * `contentType` is only the client's own pre-upload guess (it picks the
 * object's file extension and gets attached to the PUT) — it is never
 * trusted for anything security-relevant. `fileSize` is trusted only as
 * far as R2 itself will hold the client to: it's baked into the presigned
 * URL's signature, so a PUT with a different Content-Length fails outright
 * rather than silently landing more than what was authorized here.
 */
export async function requestClipUploadAction(
  fileSize: number,
  contentType: string,
): Promise<RequestClipUploadResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = requestClipUploadSchema.safeParse({ fileSize, contentType });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid upload request." };

  const key = `clips/${user.id}/${randomUUID()}.${extensionFor(parsed.data.contentType)}`;
  const uploadUrl = await storage.putUrl(key, parsed.data.contentType, parsed.data.fileSize);

  return { uploadUrl, key };
}

const finalizeClipUploadSchema = z
  .object({
    title: z.string().trim().min(3, "Use at least 3 characters").max(80, "Keep it under 80 characters"),
    caption: z.string().trim().max(280, "Keep it under 280 characters").optional(),
    game: z.string().trim().optional(),
    key: z.string().trim().min(1),
  })
  .transform((value) => ({
    ...value,
    caption: value.caption || undefined,
    game: value.game || undefined,
  }));

type FinalizeClipUploadField = "title" | "caption" | "game" | "file";

export type FinalizeClipUploadFormState =
  | { error?: string; fieldErrors?: Partial<Record<FinalizeClipUploadField, string>> }
  | undefined;

type PreparedClipUpload = {
  slug: string;
  title: string;
  caption?: string;
  gameId: string | null;
  durationSec: number;
  playbackKey: string;
  thumbnailKey: string | null;
};

type PrepareClipUploadResult =
  | { prepared: PreparedClipUpload }
  | { fieldErrors: Partial<Record<FinalizeClipUploadField, string>> }
  | { error: string };

/**
 * The shared core of "finalize a presigned clip upload" — this is the
 * actual "is this really a video" security boundary — everything upstream
 * of it (the client's pre-upload sniff, the contentType it asked
 * requestClipUploadAction to authorize, the Content-Type header it put on
 * the PUT itself) is either a UX nicety or unenforceable, so none of it is
 * trusted here. Instead this reads a small range straight back off the
 * object R2 now holds and sniffs those bytes, re-derives duration and size
 * from the real object, and extracts a poster from it — a client that
 * skipped the pre-upload check, or swapped the file after it passed, gets
 * caught here, before anything ever gets persisted.
 *
 * Used by both finalizeClipUploadAction (the standalone /clips/new flow)
 * and finalizeChannelClipUploadAction (sharing a fresh upload straight
 * into a CLIPS channel) — they diverge only in what gets created once this
 * returns (a bare Clip vs. a Clip + CommunityPost in one transaction), so
 * this deliberately stops short of any prisma.clip.create call and just
 * hands back the data for the caller to persist.
 */
async function prepareClipUpload({
  userId,
  title,
  caption,
  gameSlug,
  key,
  clientDurationSec,
}: {
  userId: string;
  title: string;
  caption?: string;
  gameSlug?: string;
  key: string;
  clientDurationSec: number;
}): Promise<PrepareClipUploadResult> {
  // Every key requestClipUploadAction hands out is scoped under the
  // requester's own id — rejects a key that's been tampered with to point
  // at (or guess at) some other user's object.
  if (!key.startsWith(`clips/${userId}/`)) {
    return { error: "That upload doesn't belong to this session. Try uploading again." };
  }

  // Just validates the form actually carried a number — the client reads
  // this off its own <video> element before ever starting the upload, but
  // it's only ever a courtesy (a poster-seek hint below, until the real
  // probe replaces it) and trivial to fake for anyone calling this action
  // directly. The clip's actual persisted durationSec, and the duration
  // cap enforced against it, both come from probeVideoDurationSec further
  // down, not this.
  if (!Number.isFinite(clientDurationSec) || clientDurationSec <= 0) {
    return { error: "Couldn't read that clip's length. Try a different file." };
  }

  const objectPrefix = await readObjectPrefix(key, SNIFF_PREFIX_BYTES);
  if (!objectPrefix) return { error: "That upload didn't finish. Try again." };
  const { bytes: prefix, totalSize } = objectPrefix;

  // Only the actual bytes decide what this is — see the function comment.
  if (!sniffVideoType(prefix)) {
    await storage.delete(key).catch(() => {
      // Best-effort — an orphaned non-video object in the bucket never
      // gets served (the clips route only ever fronts objects a Clip row
      // points at), so leaving it behind on a delete failure is harmless.
    });
    return { fieldErrors: { file: "That doesn't look like a video file." } };
  }

  // Re-checks the size cap against the object R2 actually ended up with.
  // The presigned PUT's Content-Length signature already stops a bigger
  // file from landing in the first place (see requestClipUploadAction),
  // but that's enforced back at request-URL time; this re-derives it from
  // the upload itself, the same "don't just trust the earlier request"
  // stance the duration probe below takes.
  if (totalSize !== null && totalSize > MAX_CLIP_BYTES) {
    await storage.delete(key).catch(() => {});
    return { fieldErrors: { file: `Keep it under ${Math.floor(MAX_CLIP_BYTES / (1024 * 1024))}MB.` } };
  }

  const videoUrl = await storage.getUrl(key);

  // The duration cap's actual enforcement: reads the real container
  // duration off the uploaded object rather than trusting
  // clientDurationSec above. A failed probe is treated the same as an
  // over-cap one — "couldn't verify it's short enough" isn't grounds to
  // let it through.
  let durationSec: number | null = null;
  try {
    durationSec = await probeVideoDurationSec(videoUrl);
  } catch (error) {
    // Only a genuinely broken ffmpeg install throws (see video-probe.ts's
    // module comment) — an environment problem worth logging loudly.
    console.error("[prepareClipUpload] duration probe failed to run:", error);
  }
  if (durationSec === null || durationSec > MAX_CLIP_DURATION_SEC) {
    await storage.delete(key).catch(() => {});
    return {
      fieldErrors: {
        file:
          durationSec === null
            ? "Couldn't verify that clip's length. Try a different file."
            : `Keep it under ${formatDuration(MAX_CLIP_DURATION_SEC)} long.`,
      },
    };
  }

  let gameId: string | null = null;
  if (gameSlug) {
    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) return { fieldErrors: { game: "Pick a game." } };
    gameId = game.id;
  }

  // The poster is a nice-to-have, not a requirement: unlike the checks
  // above, nothing here ever fails the whole submission. ffmpeg seeks
  // straight into the object over HTTP (the same Range-request seeking
  // the clip-serving route relies on), so this doesn't need to download
  // the video itself — see extractPosterFrame. A failed extraction (every
  // candidate timestamp blank, or ffmpeg itself unavailable) just means
  // thumbnailUrl stays null and the client falls back to generated art.
  let thumbnailKey: string | null = null;
  try {
    const posterBuffer = await extractPosterFrame({ videoUrl, durationSec });
    if (posterBuffer) {
      thumbnailKey = `clips/${userId}/${randomUUID()}.jpg`;
      await storage.put(thumbnailKey, posterBuffer, "image/jpeg");
    }
  } catch (error) {
    // Only a genuinely broken ffmpeg install throws out of
    // extractPosterFrame (see its module comment) — an environment
    // problem worth logging loudly, not a reason to fail this upload.
    console.error("[prepareClipUpload] poster extraction failed:", error);
  }

  const slug = await uniqueClipSlug(slugifyClipTitle(title));

  return {
    prepared: { slug, title, caption, gameId, durationSec: Math.round(durationSec), playbackKey: key, thumbnailKey },
  };
}

/**
 * Step 2 of the standalone /clips/new flow, submitted once the browser's
 * direct PUT to R2 has finished. See prepareClipUpload above for the
 * actual validation/extraction work — this just persists the bare Clip
 * row once that's done.
 */
export async function finalizeClipUploadAction(
  _state: FinalizeClipUploadFormState,
  formData: FormData,
): Promise<FinalizeClipUploadFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = finalizeClipUploadSchema.safeParse({
    title: formData.get("title"),
    caption: formData.get("caption"),
    game: formData.get("game"),
    key: formData.get("key"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (field === "title" || field === "caption" || field === "game") {
      return { fieldErrors: { [field]: issue.message } };
    }
    return { error: "That upload is missing its file. Try again." };
  }
  const { title, caption, game: gameSlug, key } = parsed.data;
  const clientDurationSec = Math.round(Number(formData.get("durationSec")));

  const result = await prepareClipUpload({ userId: user.id, title, caption, gameSlug, key, clientDurationSec });
  if ("error" in result) return { error: result.error };
  if ("fieldErrors" in result) return { fieldErrors: result.fieldErrors };
  const { prepared } = result;

  const clip = await prisma.clip.create({
    data: {
      slug: prepared.slug,
      userId: user.id,
      gameId: prepared.gameId,
      title: prepared.title,
      caption: prepared.caption ?? null,
      durationSec: prepared.durationSec,
      playbackUrl: prepared.playbackKey,
      thumbnailUrl: prepared.thumbnailKey,
    },
  });

  revalidatePath("/clips");
  redirect(`/clips/${clip.slug}`);
}

const finalizeChannelClipUploadSchema = finalizeClipUploadSchema.and(z.object({ channelId: z.string().min(1) }));

export type FinalizeChannelClipUploadFormState =
  | { error?: string; fieldErrors?: Partial<Record<FinalizeClipUploadField, string>> }
  | undefined;

/**
 * Step 2 of the "upload a new clip straight into a CLIPS channel" flow —
 * the sibling of finalizeClipUploadAction above, reusing the exact same
 * presigned-upload step (requestClipUploadAction) and the exact same
 * prepareClipUpload core (sniff, size/duration re-check, poster
 * extraction), so the 600MB/2-minute limits and the "trust the bytes, not
 * the request" checks apply identically here. The only real difference is
 * what gets persisted once that's done: a Clip row exactly like the
 * standalone flow creates, plus a CommunityPost in the same channel
 * pointing at it, both in one transaction — so a caller never ends up with
 * a clip that got uploaded but never made it into the channel, or a
 * channel post pointing at a clip that doesn't exist.
 *
 * Membership and channel-kind are re-checked here, before any upload
 * processing runs — same "the composer only rendering for a CLIPS-channel
 * member is a display nicety" stance createCommunityPostAction takes for
 * text posts, and cheaper to fail on than after ffmpeg has already probed
 * and extracted a poster from an object nobody's authorized to post here.
 */
export async function finalizeChannelClipUploadAction(
  _state: FinalizeChannelClipUploadFormState,
  formData: FormData,
): Promise<FinalizeChannelClipUploadFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = finalizeChannelClipUploadSchema.safeParse({
    channelId: formData.get("channelId"),
    title: formData.get("title"),
    caption: formData.get("caption"),
    game: formData.get("game"),
    key: formData.get("key"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (field === "title" || field === "caption" || field === "game") {
      return { fieldErrors: { [field]: issue.message } };
    }
    return { error: "That upload is missing its file. Try again." };
  }
  const { channelId, title, caption, game: gameSlug, key } = parsed.data;

  const channel = await prisma.communityChannel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      communityId: true,
      kind: true,
      name: true,
      deletedAt: true,
      community: { select: { slug: true } },
    },
  });
  if (!channel || channel.deletedAt) return { error: "That channel no longer exists." };
  if (channel.kind !== "CLIPS") return { error: "That's not a clips channel." };

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: channel.communityId, userId: user.id } },
  });
  if (!membership) return { error: "You need to join this community to post." };

  const clientDurationSec = Math.round(Number(formData.get("durationSec")));
  const result = await prepareClipUpload({ userId: user.id, title, caption, gameSlug, key, clientDurationSec });
  if ("error" in result) return { error: result.error };
  if ("fieldErrors" in result) return { fieldErrors: result.fieldErrors };
  const { prepared } = result;

  await prisma.$transaction(async (tx) => {
    const clip = await tx.clip.create({
      data: {
        slug: prepared.slug,
        userId: user.id,
        gameId: prepared.gameId,
        title: prepared.title,
        caption: prepared.caption ?? null,
        durationSec: prepared.durationSec,
        playbackUrl: prepared.playbackKey,
        thumbnailUrl: prepared.thumbnailKey,
      },
    });
    await tx.communityPost.create({
      data: { channelId: channel.id, authorId: user.id, body: prepared.caption ?? "", clipId: clip.id },
    });
  });

  revalidatePath("/", "layout");
  redirect(`/communities/${channel.community.slug}?channel=${channel.name}`);
}

const deleteClipInput = z.object({ clipId: z.string().min(1) });

export type DeleteClipResult = { deleted: true } | { error: string };

/**
 * Deletes a clip — owner only. The client only ever shows this option to
 * the clip's own uploader, but that's just UI; ownership is re-checked
 * against the DB here regardless of what the request claims.
 *
 * Comments, reactions, and the view-dedup ledger all cascade at the schema
 * level (onDelete: Cascade on Clip's relations — see schema.prisma), so
 * deleting the Clip row is enough on the DB side. The video and poster
 * objects in R2 aren't referenced by any FK, so those are cleaned up here
 * explicitly, best-effort: the clip is already gone from the app the
 * moment the row is, regardless of whether the bucket cleanup succeeds, so
 * a failure here is logged rather than surfaced to the viewer — same
 * "don't fail the user-visible action over a bucket hiccup" call as the
 * orphaned-object cleanup in finalizeClipUploadAction above.
 */
export async function deleteClipAction(clipId: string): Promise<DeleteClipResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = deleteClipInput.safeParse({ clipId });
  if (!parsed.success) return { error: "Invalid clip." };

  const clip = await prisma.clip.findUnique({
    where: { id: parsed.data.clipId },
    select: { id: true, userId: true, playbackUrl: true, thumbnailUrl: true },
  });
  if (!clip) return { error: "That clip no longer exists." };
  if (clip.userId !== user.id) return { error: "You can only delete your own clips." };

  await prisma.clip.delete({ where: { id: clip.id } });

  await Promise.all(
    [clip.playbackUrl, clip.thumbnailUrl]
      .filter((key): key is string => Boolean(key))
      .map((key) =>
        storage.delete(key).catch((error) => {
          console.error(`[deleteClipAction] failed to delete ${key} from storage:`, error);
        }),
      ),
  );

  revalidatePath("/", "layout");
  return { deleted: true };
}

export type ClipDetailPayload = {
  id: string;
  userId: string;
  slug: string;
  title: string;
  caption: string | null;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  game: string | null;
  views: number;
  playbackUrl?: string | null;
  posterUrl?: string | null;
  likes: number;
  saves: number;
  comments: number;
  liked: boolean;
  saved: boolean;
};

export type GetClipDetailResult = { clip: ClipDetailPayload } | { error: string };

const getClipDetailInput = z.object({ clipId: z.string().min(1) });

/**
 * Everything ClipDetailView needs for one clip, viewer-scoped (the
 * liked/saved flags are per-caller, same reaction lookup the standalone
 * /clips/[slug] page already does). Split out of that page so a second
 * caller — the clip-viewer modal a CLIPS-channel card opens (see
 * clip-viewer-modal.tsx) — can fetch the same shape on demand instead of
 * every channel post paying for a full clip+reaction join up front just in
 * case someone opens it.
 */
export async function getClipDetailAction(clipId: string): Promise<GetClipDetailResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = getClipDetailInput.safeParse({ clipId });
  if (!parsed.success) return { error: "Invalid clip." };

  const clip = await prisma.clip.findFirst({
    where: { id: parsed.data.clipId, published: true },
    include: { user: { include: { profile: true } }, game: true, _count: { select: { comments: true } } },
  });
  if (!clip) return { error: "That clip no longer exists." };

  const reaction = await prisma.reaction.findMany({
    where: { userId: user.id, clipId: clip.id, emote: { in: ["like", "save"] } },
    select: { emote: true },
  });

  return {
    clip: {
      id: clip.id,
      userId: clip.userId,
      slug: clip.slug,
      title: clip.title,
      caption: clip.caption,
      displayName: clip.user.displayName,
      username: clip.user.username,
      avatarUrl: avatarSrc(clip.user.profile?.avatarUrl),
      game: clip.game?.shortName ?? null,
      views: clip.views,
      playbackUrl: clipVideoSrc(clip.playbackUrl),
      posterUrl: clipPosterSrc(clip.thumbnailUrl),
      likes: clip.likes,
      saves: clip.saves,
      comments: clip._count.comments,
      liked: reaction.some((entry) => entry.emote === "like"),
      saved: reaction.some((entry) => entry.emote === "save"),
    },
  };
}

// Likes and saves both reuse the generic Reaction model (clipId, userId,
// emote) rather than adding a dedicated join table for saves — the
// @@unique([clipId, userId, emote]) constraint already gives each user an
// independent like *and* save toggle on the same clip, since those are two
// separate rows with different `emote` values.
const LIKE_EMOTE = "like";
const SAVE_EMOTE = "save";

// Milestone counts that fire a CLIP_MILESTONE notification — see the doc
// comment on toggleClipReaction for why this is a threshold rather than a
// notification per like. Exact-equality is safe to check against because
// Clip.likes only ever moves by 1 per toggle, so a threshold can't be
// skipped over.
const LIKE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000];

const clipIdInput = z.object({ clipId: z.string().min(1) });

export type ToggleClipReactionResult = { active: boolean; count: number } | { error: string };

/**
 * Toggles a like or save on a clip. Clip.likes/saves are denormalised
 * counters (used for feed sort and display) — kept in sync with the
 * Reaction row in the same transaction, same approach as
 * Community.memberCount alongside CommunityMember.
 *
 * Likes deliberately don't notify per-like — on anything past a handful
 * of likes that's a firehose (a moderately popular clip would generate
 * one notification row per viewer who likes it, most of them from
 * strangers, with none of them individually worth an interruption), and
 * unlike/re-like churn would make it noisier still. A CLIP_MILESTONE
 * notification at fixed thresholds (LIKE_MILESTONES above) instead gives
 * the owner the same "people like this" signal at a rate that stays
 * meaningful regardless of how popular the clip gets — this is exactly
 * what the CLIP_MILESTONE kind already existed for. Saves never notify at
 * all; there's no equivalent "this is doing well" milestone signal for a
 * personal bookmark.
 */
async function toggleClipReaction(clipId: string, emote: string): Promise<ToggleClipReactionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = clipIdInput.safeParse({ clipId });
  if (!parsed.success) return { error: "Invalid clip." };

  const clip = await prisma.clip.findUnique({
    where: { id: parsed.data.clipId },
    select: { id: true, userId: true, title: true, slug: true },
  });
  if (!clip) return { error: "That clip no longer exists." };

  const existing = await prisma.reaction.findUnique({
    where: { clipId_userId_emote: { clipId: clip.id, userId: user.id, emote } },
  });

  const counterField = emote === LIKE_EMOTE ? "likes" : "saves";

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.reaction.delete({ where: { id: existing.id } }),
      prisma.clip.update({
        where: { id: clip.id },
        data: { [counterField]: { decrement: 1 } },
      }),
    ]);
    return { active: false, count: emote === LIKE_EMOTE ? updated.likes : updated.saves };
  }

  const [, updated] = await prisma.$transaction([
    prisma.reaction.create({ data: { clipId: clip.id, userId: user.id, emote } }),
    prisma.clip.update({
      where: { id: clip.id },
      data: { [counterField]: { increment: 1 } },
    }),
  ]);

  if (emote === LIKE_EMOTE && clip.userId !== user.id && LIKE_MILESTONES.includes(updated.likes)) {
    await notify({
      userId: clip.userId,
      kind: "CLIP_MILESTONE",
      title: `${compactNumber(updated.likes)} likes on your clip`,
      body: `"${clip.title}" just crossed ${compactNumber(updated.likes)} likes.`,
      href: `/clips/${clip.slug}`,
    });
  }

  return { active: true, count: emote === LIKE_EMOTE ? updated.likes : updated.saves };
}

export async function toggleClipLikeAction(clipId: string): Promise<ToggleClipReactionResult> {
  return toggleClipReaction(clipId, LIKE_EMOTE);
}

export async function toggleClipSaveAction(clipId: string): Promise<ToggleClipReactionResult> {
  return toggleClipReaction(clipId, SAVE_EMOTE);
}

const recordClipViewInput = z.object({ clipId: z.string().min(1) });

export type RecordClipViewResult = { recorded: boolean; views: number } | { error: string };

/**
 * The actual dedup-and-increment: a bare (clipId, sessionId) -> result
 * function with no Next.js request context of its own, so it's callable
 * directly (scripts, tests) without going through cookies()/headers(). Kept
 * separate from recordClipViewAction below, which is just this plus
 * "use server" and pulling sessionId off the request.
 *
 * Deduped against the caller's session (see ClipView in the schema), so a
 * retried/duplicate call — a second tab, a reload, a client that fires
 * again despite its own guard — is a cheap no-op rather than double
 * counting: the unique constraint on (clipId, sessionId) is what actually
 * enforces "once per session", not the client's play-timer, which is only
 * there to avoid sending the request at all for a clip nobody watched.
 *
 * Clip.views is a denormalised counter, kept in sync with the ClipView
 * ledger row in the same transaction — same pattern as the like/save
 * counters above.
 */
export async function recordClipView(clipId: string, sessionId: string): Promise<RecordClipViewResult> {
  const parsed = recordClipViewInput.safeParse({ clipId });
  if (!parsed.success) return { error: "Invalid clip." };

  try {
    const [, clip] = await prisma.$transaction([
      prisma.clipView.create({ data: { clipId: parsed.data.clipId, sessionId } }),
      prisma.clip.update({
        where: { id: parsed.data.clipId },
        data: { views: { increment: 1 } },
        select: { views: true },
      }),
    ]);
    return { recorded: true, views: clip.views };
  } catch (error) {
    // P2002: the unique(clipId, sessionId) constraint already has a row —
    // this session already counted a view for this clip, so it's not
    // recorded again. Anything else (e.g. the clip got deleted mid-watch)
    // is a genuine failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const clip = await prisma.clip.findUnique({ where: { id: parsed.data.clipId }, select: { views: true } });
      return { recorded: false, views: clip?.views ?? 0 };
    }
    return { error: "Couldn't record that view." };
  }
}

/**
 * Records a view for a clip — called once the client has actually watched
 * a couple of seconds of it, not on every scroll-past. See recordClipView
 * above for the actual dedup/increment logic; this just supplies the
 * caller's session from the request.
 */
export async function recordClipViewAction(clipId: string): Promise<RecordClipViewResult> {
  const sessionId = await getCurrentSessionId();
  if (!sessionId) return { error: "You need to be logged in." };
  return recordClipView(clipId, sessionId);
}

export type LoadMoreClipsResult = { clips: FeedClip[]; nextCursor: ClipFeedCursor | null } | { error: string };

/**
 * The feed's "load next batch" call — ClipFeed fires this once the active
 * clip gets within a few of the end of what's already loaded. All the
 * actual pagination logic (keyset, not offset — see the comment on
 * fetchClipFeedPage) lives there so this page's first batch (in
 * app/(app)/clips/page.tsx) and every batch after it come from the exact
 * same query and shaping.
 */
export async function loadMoreClipsAction(cursor: ClipFeedCursor): Promise<LoadMoreClipsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };
  return fetchClipFeedPage({ viewerId: user.id, cursor });
}

export type ClipCommentData = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; displayName: string; username: string; avatarUrl: string | undefined };
};

const clipCommentsInput = z.object({ clipId: z.string().min(1) });

/** Loads a clip's comments on demand, when the panel opens — not bundled
 * into the initial feed query, which only needs the total count. One
 * query for every comment's author (and their profile, for the avatar)
 * via `include`, not one query per comment. */
export async function clipCommentsAction(clipId: string): Promise<ClipCommentData[]> {
  const parsed = clipCommentsInput.safeParse({ clipId });
  if (!parsed.success) return [];

  const comments = await prisma.comment.findMany({
    where: { clipId: parsed.data.clipId },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
  });

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    parentId: comment.parentId,
    author: {
      id: comment.userId,
      displayName: comment.user.displayName,
      username: comment.user.username,
      avatarUrl: avatarSrc(comment.user.profile?.avatarUrl),
    },
  }));
}

const addCommentInput = z.object({
  clipId: z.string().min(1),
  body: z.string().trim().min(1, "Say something first.").max(1000, "Keep it under 1000 characters."),
  parentId: z.string().min(1).optional(),
});

export type AddClipCommentResult = { comment: ClipCommentData } | { error: string };

/**
 * Posts a comment (or, with parentId, a reply). parentId is checked
 * against the same clip — a reply pointing at a comment on a different
 * clip would silently orphan the thread otherwise.
 *
 * Notifies the clip's owner (COMMENT_REPLY) unless they're the one
 * commenting on their own clip — same "don't notify someone about their
 * own action" rule as the follow toggle.
 */
export async function addClipCommentAction(
  clipId: string,
  body: string,
  parentId?: string,
): Promise<AddClipCommentResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to comment." };

  const parsed = addCommentInput.safeParse({ clipId, body, parentId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };

  const clip = await prisma.clip.findUnique({
    where: { id: parsed.data.clipId },
    select: { id: true, userId: true, title: true, slug: true },
  });
  if (!clip) return { error: "That clip no longer exists." };

  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { clipId: true },
    });
    if (!parent || parent.clipId !== clip.id) {
      return { error: "That comment thread no longer exists." };
    }
  }

  const comment = await prisma.comment.create({
    data: { clipId: clip.id, userId: user.id, body: parsed.data.body, parentId: parsed.data.parentId ?? null },
  });

  if (clip.userId !== user.id) {
    await notify({
      userId: clip.userId,
      kind: "COMMENT_REPLY",
      title: `${user.displayName} commented on "${clip.title}"`,
      body: parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body,
      href: `/clips/${clip.slug}`,
    });
  }

  revalidatePath("/", "layout");
  return {
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      parentId: comment.parentId,
      author: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: avatarSrc(user.profile?.avatarUrl),
      },
    },
  };
}

const deleteCommentInput = z.object({ commentId: z.string().min(1) });

export type DeleteClipCommentResult = { deleted: true } | { error: string };

/**
 * Deletes a comment. Authors only — following the community post rule
 * that self-deletion is always available, but (unlike a community post)
 * there's no moderator role attached to a clip to extend deletion to
 * anyone else's comment. Deleting a comment that has replies cascades to
 * them too, per the schema's onDelete: Cascade on the thread relation.
 */
export async function deleteClipCommentAction(commentId: string): Promise<DeleteClipCommentResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = deleteCommentInput.safeParse({ commentId });
  if (!parsed.success) return { error: "Invalid comment." };

  const comment = await prisma.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: { id: true, userId: true },
  });
  if (!comment) return { error: "That comment no longer exists." };
  if (comment.userId !== user.id) return { error: "You can only delete your own comments." };

  await prisma.comment.delete({ where: { id: comment.id } });

  revalidatePath("/", "layout");
  return { deleted: true };
}

export type ShareCandidate = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | undefined;
};

/**
 * Backs the share sheet's "send to" row: people the caller follows or is
 * followed by, in either direction. A convenience for the sheet's
 * contents — sendClipToUserAction independently re-checks that the
 * recipient is actually reachable this way.
 */
export async function clipShareCandidatesAction(): Promise<ShareCandidate[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const follows = await prisma.follow.findMany({
    where: { OR: [{ followerId: user.id }, { followedId: user.id }] },
    select: { followerId: true, followedId: true },
  });
  const otherIds = new Set(
    follows.map((follow) => (follow.followerId === user.id ? follow.followedId : follow.followerId)),
  );
  if (otherIds.size === 0) return [];

  const candidates = await prisma.user.findMany({
    where: { id: { in: [...otherIds] } },
    select: { id: true, displayName: true, username: true, profile: { select: { avatarUrl: true } } },
    orderBy: { displayName: "asc" },
    take: 50,
  });
  return candidates.map(({ profile, ...candidate }) => ({
    ...candidate,
    avatarUrl: avatarSrc(profile?.avatarUrl),
  }));
}

const sendClipInput = z.object({ clipId: z.string().min(1), recipientId: z.string().min(1) });

export type SendClipToUserResult = { sent: true } | { error: string };

/**
 * Sends a clip to another user as a CLIP-kind Message, in their existing
 * 1:1 conversation or a new one. The conversation lookup/creation, the
 * message, and the recipient's notification all happen in one transaction
 * — same pattern as every other notified action in this codebase (team
 * invites, tournament applications, match results): the notification
 * can't exist without the write it's about, and the message can't exist
 * half-sent into a conversation nobody ever committed.
 */
export async function sendClipToUserAction(clipId: string, recipientId: string): Promise<SendClipToUserResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = sendClipInput.safeParse({ clipId, recipientId });
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data.recipientId === user.id) return { error: "You can't send a clip to yourself." };

  const clip = await prisma.clip.findUnique({
    where: { id: parsed.data.clipId },
    select: { id: true, slug: true, title: true, thumbnailUrl: true },
  });
  if (!clip) return { error: "That clip no longer exists." };

  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.recipientId },
    select: { id: true, displayName: true },
  });
  if (!recipient) return { error: "That player no longer exists." };

  // The sheet only ever lists people reachable this way, but that's a
  // display convenience — re-checked here so a direct call can't spam an
  // arbitrary stranger who has no relationship with the sender at all.
  const reachable = await prisma.follow.findFirst({
    where: {
      OR: [
        { followerId: user.id, followedId: recipient.id },
        { followerId: recipient.id, followedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (!reachable) return { error: "You can only send clips to people you follow or who follow you." };

  const payload: ClipMessagePayload = {
    clipId: clip.id,
    slug: clip.slug,
    title: clip.title,
    thumbnailUrl: clip.thumbnailUrl,
  };

  await prisma.$transaction(async (tx) => {
    let conversation = await tx.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [{ members: { some: { userId: user.id } } }, { members: { some: { userId: recipient.id } } }],
      },
      include: { members: true },
    });
    if (!conversation || conversation.members.length !== 2) {
      conversation = await tx.conversation.create({
        data: { isGroup: false, members: { create: [{ userId: user.id }, { userId: recipient.id }] } },
        include: { members: true },
      });
    }

    await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        kind: "CLIP",
        body: clip.title,
        payload,
      },
    });

    await tx.notification.create({
      data: {
        userId: recipient.id,
        kind: "CLIP_SHARED",
        title: `${user.displayName} sent you a clip`,
        body: clip.title,
        href: "/messages",
      },
    });
  });

  revalidatePath("/", "layout");
  return { sent: true };
}

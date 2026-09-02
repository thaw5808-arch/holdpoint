"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MessageLine } from "@/components/message-thread";
import type { AttachmentMessagePayload } from "@/lib/attachment-message";
import { MAX_ATTACHMENT_IMAGE_BYTES, MAX_ATTACHMENT_VIDEO_BYTES, MAX_ATTACHMENT_VIDEO_DURATION_SEC } from "@/lib/attachment-limits";
import { attachmentSrc } from "@/lib/attachment-url";
import { avatarSrc } from "@/lib/avatar-url";
import { findOrCreateDirectConversation, unhideConversationForRecipients, usersCanMessage } from "@/lib/conversations";
import { extensionFor as extensionForImage, sniffImageType } from "@/lib/image-sniff";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { readObjectPrefix } from "@/lib/storage-verify";
import { extensionFor as extensionForVideo, sniffVideoType } from "@/lib/video-sniff";
import { probeVideoDurationSec } from "@/lib/video-probe";

const BODY_MAX = 2000;

const sendInput = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, "Say something first.").max(BODY_MAX, `Keep it under ${BODY_MAX} characters.`),
});

export type SendMessageResult = { message: MessageLine } | { error: string };

/**
 * Posts a text message into an existing conversation. `conversationId`
 * comes straight from the client (the thread page's own URL, echoed back
 * on submit) — never trusted on its own. ConversationMember is the actual
 * membership record, so its absence covers both "no such conversation" and
 * "not a participant" with the same generic error, the same
 * doesn't-confirm-existence stance /moderation and /admin take for a
 * gated page, applied here to a single row instead of a whole page.
 */
export async function sendMessageAction(conversationId: string, body: string): Promise<SendMessageResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to send a message." };

  const parsed = sendInput.safeParse({ conversationId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId: user.id } },
  });
  if (!membership) return { error: "You don't have access to this conversation." };

  const message = await prisma.message.create({
    data: { conversationId: parsed.data.conversationId, senderId: user.id, body: parsed.data.body },
  });
  // Drives both the conversation list's own sort (messages/page.tsx) and,
  // going forward, anything else that orders by "most recently active" —
  // messages/page.tsx currently sorts by its last message's createdAt
  // instead, but keeping updatedAt honest here means that isn't the only
  // thing anyone can ever rely on.
  await prisma.conversation.update({
    where: { id: parsed.data.conversationId },
    data: { updatedAt: new Date() },
  });

  // A new message un-hides the conversation for anyone who'd previously
  // "deleted" it — see unhideConversationForRecipients's own comment.
  await unhideConversationForRecipients(parsed.data.conversationId, user.id);

  // Layout revalidation so the topbar's unread-messages badge (computed
  // fresh per request in layout.tsx) doesn't need a full reload to reflect
  // a message that just went out — same "revalidate the whole layout"
  // call every other notified action in this codebase already makes.
  revalidatePath("/", "layout");

  return {
    message: {
      id: message.id,
      senderId: user.id,
      senderDisplayName: user.displayName,
      senderUsername: user.username,
      senderAvatarUrl: avatarSrc(user.profile?.avatarUrl),
      kind: "TEXT",
      body: message.body,
      clip: null,
      attachment: null,
      createdAt: message.createdAt.toISOString(),
    },
  };
}

const startInput = z.object({ recipientId: z.string().min(1) });

export type StartConversationResult = { conversationId: string } | { error: string };

/**
 * Finds-or-creates a 1:1 conversation with `recipientId` and hands back its
 * id, so the caller (the "New message" picker on /messages) can navigate
 * straight to /messages/[id]. Reuses the exact same find-or-create
 * (findOrCreateDirectConversation) and reachability rule (usersCanMessage)
 * sendClipToUserAction has always used for clip share-to-DM, rather than
 * inventing a second definition of "how a DM conversation comes to exist"
 * — see the comments on both in lib/conversations.ts. That also means
 * starting a conversation here and then sharing a clip into it later (or
 * vice versa) always lands in the same conversation, never two.
 */
export async function startConversationAction(recipientId: string): Promise<StartConversationResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = startInput.safeParse({ recipientId });
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data.recipientId === user.id) return { error: "You can't message yourself." };

  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.recipientId },
    select: { id: true },
  });
  if (!recipient) return { error: "That player no longer exists." };

  if (!(await usersCanMessage(user.id, recipient.id))) {
    return { error: "You can only message people you follow or who follow you." };
  }

  // Wrapped in a transaction purely to close the race where two concurrent
  // calls both see "no existing conversation" and both create one —
  // findOrCreateDirectConversation's read-then-maybe-write isn't atomic on
  // its own.
  const conversation = await prisma.$transaction((tx) => findOrCreateDirectConversation(tx, user.id, recipient.id));

  return { conversationId: conversation.id };
}

// ----------------------------------------------------------- attachments
//
// Images and video, following the exact same two-step shape
// requestClipUploadAction/prepareClipUpload use in actions/clip.ts: a
// presign step that authorizes a direct-to-R2 PUT (the file itself never
// passes through a Server Action's 1MB body cap), then a finalize step
// that only trusts what it reads back off the object R2 actually ended up
// with. See attachment-limits.ts for why the caps here are much smaller
// than a clip's — this is a chat attachment, not hosted content.

const UPLOADABLE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const UPLOADABLE_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"] as const;

const requestAttachmentUploadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("IMAGE"),
    conversationId: z.string().min(1),
    fileSize: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ATTACHMENT_IMAGE_BYTES, `Keep it under ${Math.floor(MAX_ATTACHMENT_IMAGE_BYTES / (1024 * 1024))}MB.`),
    contentType: z.enum(UPLOADABLE_IMAGE_TYPES),
  }),
  z.object({
    kind: z.literal("VIDEO"),
    conversationId: z.string().min(1),
    fileSize: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ATTACHMENT_VIDEO_BYTES, `Keep it under ${Math.floor(MAX_ATTACHMENT_VIDEO_BYTES / (1024 * 1024))}MB.`),
    contentType: z.enum(UPLOADABLE_VIDEO_TYPES),
  }),
]);

export type RequestAttachmentUploadResult = { uploadUrl: string; key: string } | { error: string };

/**
 * Step 1 of the DM attachment upload flow. Membership is checked here,
 * before any upload is even authorized — not just re-checked at send
 * time in sendAttachmentMessageAction below — so a non-participant can't
 * get a write-capable URL into this conversation's attachment space at
 * all. The key is scoped `attachments/<conversationId>/<senderId>/<uuid>.<ext>`:
 * the conversationId segment is what the serving route
 * (api/attachments/[...key]) later reads back out of the path to decide
 * who's allowed to fetch the object, so it has to be right from the
 * moment the object is created, not patched in after the fact.
 */
export async function requestAttachmentUploadAction(input: {
  conversationId: string;
  kind: "IMAGE" | "VIDEO";
  fileSize: number;
  contentType: string;
}): Promise<RequestAttachmentUploadResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = requestAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid upload request." };

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: parsed.data.conversationId, userId: user.id } },
  });
  if (!membership) return { error: "You don't have access to this conversation." };

  const extension =
    parsed.data.kind === "IMAGE" ? extensionForImage(parsed.data.contentType) : extensionForVideo(parsed.data.contentType);
  const key = `attachments/${parsed.data.conversationId}/${user.id}/${randomUUID()}.${extension}`;
  const uploadUrl = await storage.putUrl(key, parsed.data.contentType, parsed.data.fileSize);

  return { uploadUrl, key };
}

const sendAttachmentInput = z.object({
  conversationId: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(["IMAGE", "VIDEO"]),
});

export type SendAttachmentMessageResult = { message: MessageLine } | { error: string };

// Every signature sniffImageType/sniffVideoType checks for lives within
// the first 12 bytes; 64 leaves comfortable room without pulling back any
// more of the object than necessary — same constant clip.ts's own sniff
// step uses.
const ATTACHMENT_SNIFF_PREFIX_BYTES = 64;

/**
 * Step 2 — called once the browser's direct PUT (authorized by
 * requestAttachmentUploadAction above) has finished. This is the actual
 * "is this really an image/video, and is this sender actually allowed to
 * post into this conversation" boundary — everything upstream of it (the
 * client's own pre-upload sniff, the contentType baked into the presigned
 * URL) is either a UX nicety or unenforceable, so none of it is trusted
 * here. Mirrors prepareClipUpload's verification shape (actions/clip.ts):
 * membership re-checked, real bytes re-read off the object R2 now holds
 * and sniffed, size re-derived from the real object, video duration
 * re-probed — a client that skipped the pre-upload check, lied about
 * `kind`, or swapped the file after it passed gets caught here, before
 * anything is persisted. A rejection at any point deletes the orphaned
 * object rather than leaving it behind, same as prepareClipUpload.
 */
export async function sendAttachmentMessageAction(input: {
  conversationId: string;
  key: string;
  kind: "IMAGE" | "VIDEO";
}): Promise<SendAttachmentMessageResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = sendAttachmentInput.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const { conversationId, key, kind } = parsed.data;

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!membership) return { error: "You don't have access to this conversation." };

  // Every key requestAttachmentUploadAction hands out is scoped under
  // this exact conversation and sender — rejects a key that's been
  // tampered with to point at (or guess at) some other conversation or
  // user's object, the same ownership check prepareClipUpload does
  // against its own `clips/<userId>/` prefix.
  if (!key.startsWith(`attachments/${conversationId}/${user.id}/`)) {
    return { error: "That upload doesn't belong to this conversation. Try again." };
  }

  const objectPrefix = await readObjectPrefix(key, ATTACHMENT_SNIFF_PREFIX_BYTES);
  if (!objectPrefix) return { error: "That upload didn't finish. Try again." };
  const { bytes: prefix, totalSize } = objectPrefix;

  const maxBytes = kind === "IMAGE" ? MAX_ATTACHMENT_IMAGE_BYTES : MAX_ATTACHMENT_VIDEO_BYTES;
  if (totalSize !== null && totalSize > maxBytes) {
    await storage.delete(key).catch(() => {});
    return { error: `Keep it under ${Math.floor(maxBytes / (1024 * 1024))}MB.` };
  }

  if (kind === "IMAGE") {
    // Only the actual bytes decide what this is — see this function's
    // own comment.
    if (!sniffImageType(prefix)) {
      await storage.delete(key).catch(() => {});
      return { error: "That doesn't look like an image file." };
    }
  } else {
    if (!sniffVideoType(prefix)) {
      await storage.delete(key).catch(() => {});
      return { error: "That doesn't look like a video file." };
    }

    // The duration cap's actual enforcement, same as prepareClipUpload's
    // own probe: reads the real container duration off the uploaded
    // object rather than trusting anything the client claimed.
    const videoUrl = await storage.getUrl(key);
    let durationSec: number | null = null;
    try {
      durationSec = await probeVideoDurationSec(videoUrl);
    } catch (error) {
      console.error("[sendAttachmentMessageAction] duration probe failed to run:", error);
    }
    if (durationSec === null || durationSec > MAX_ATTACHMENT_VIDEO_DURATION_SEC) {
      await storage.delete(key).catch(() => {});
      return {
        error:
          durationSec === null
            ? "Couldn't verify that video's length. Try a different file."
            : `Keep videos under ${MAX_ATTACHMENT_VIDEO_DURATION_SEC}s.`,
      };
    }
  }

  const payload: AttachmentMessagePayload = { key };
  const displayBody = kind === "IMAGE" ? "Photo" : "Video";

  const message = await prisma.message.create({
    data: { conversationId, senderId: user.id, kind, body: displayBody, payload },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await unhideConversationForRecipients(conversationId, user.id);

  revalidatePath("/", "layout");

  return {
    message: {
      id: message.id,
      senderId: user.id,
      senderDisplayName: user.displayName,
      senderUsername: user.username,
      senderAvatarUrl: avatarSrc(user.profile?.avatarUrl),
      kind,
      body: message.body,
      clip: null,
      attachment: { src: attachmentSrc(key) },
      createdAt: message.createdAt.toISOString(),
    },
  };
}

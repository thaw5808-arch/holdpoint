"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MessageLine } from "@/components/message-thread";
import { avatarSrc } from "@/lib/avatar-url";
import { findOrCreateDirectConversation, usersCanMessage } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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

"use server";

import { z } from "zod";
import type { ChatLine } from "@/components/live-chat";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const BODY_MAX = 500;

function badgesFor(role: string, subscribed: boolean): ChatLine["badges"] {
  const badges: ChatLine["badges"] = [];
  if (role === "MODERATOR" || role === "ADMIN") badges.push("MOD");
  if (subscribed) badges.push("SUB");
  return badges;
}

function toLine(
  message: {
    id: string;
    body: string;
    pinned: boolean;
    createdAt: Date;
    user: { username: string; displayName: string };
  },
  badges: ChatLine["badges"],
): ChatLine {
  return {
    id: message.id,
    username: message.user.username,
    displayName: message.user.displayName,
    body: message.body,
    pinned: message.pinned,
    createdAt: message.createdAt.toISOString(),
    badges,
  };
}

const sendInput = z.object({
  streamId: z.string().min(1),
  body: z.string().trim().min(1, "Say something first.").max(BODY_MAX, `Keep it under ${BODY_MAX} characters.`),
});

export type SendChatMessageResult = { message: ChatLine } | { error: string };

/**
 * Posts a chat message. Every gate the UI already reflects — followersOnly,
 * subsOnly, chatSlowMode, an active channel Ban — is re-checked here
 * against the DB, since a client that hides the input or disables slow
 * mode's cooldown is a UI nicety, not a boundary. The channel owner and
 * site MODERATOR/ADMIN roles skip the follow/sub/slow-mode gates (not the
 * ban check) — the same privilege boundary the MOD badge itself already
 * assumes when rendering existing messages.
 */
export async function sendChatMessageAction(streamId: string, body: string): Promise<SendChatMessageResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to chat." };

  const parsed = sendInput.safeParse({ streamId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const stream = await prisma.stream.findUnique({
    where: { id: parsed.data.streamId },
    select: { id: true, userId: true, followersOnly: true, subsOnly: true, chatSlowMode: true },
  });
  if (!stream) return { error: "That stream no longer exists." };

  const ban = await prisma.ban.findFirst({
    where: {
      userId: user.id,
      scope: "CHANNEL",
      scopeId: stream.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (ban) return { error: "You're banned from chatting in this channel." };

  const privileged = user.id === stream.userId || user.role === "MODERATOR" || user.role === "ADMIN";

  const subscription = await prisma.subscription.findUnique({
    where: { creatorId_viewerId: { creatorId: stream.userId, viewerId: user.id } },
    select: { id: true },
  });

  if (!privileged) {
    if (stream.subsOnly && !subscription) {
      return { error: "Subscribers-only chat. Subscribe to the channel to join in." };
    }
    if (stream.followersOnly) {
      const follow = await prisma.follow.findUnique({
        where: { followerId_followedId: { followerId: user.id, followedId: stream.userId } },
        select: { id: true },
      });
      if (!follow) return { error: "Followers-only chat. Follow the channel to join in." };
    }
    if (stream.chatSlowMode > 0) {
      const last = await prisma.chatMessage.findFirst({
        where: { streamId: stream.id, userId: user.id, deleted: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (last) {
        const elapsedSec = (Date.now() - last.createdAt.getTime()) / 1000;
        if (elapsedSec < stream.chatSlowMode) {
          return { error: `Slow mode is on — wait ${Math.ceil(stream.chatSlowMode - elapsedSec)}s.` };
        }
      }
    }
  }

  const message = await prisma.chatMessage.create({
    data: { streamId: stream.id, userId: user.id, body: parsed.data.body },
    include: { user: { select: { username: true, displayName: true, role: true } } },
  });

  return { message: toLine(message, badgesFor(message.user.role, Boolean(subscription))) };
}

/**
 * Polls for messages newer than the caller's last-seen line. No sockets in
 * this build, so LiveChat calls this on an interval instead. The cursor is
 * (createdAt, id) rather than createdAt alone so two messages landing in
 * the same millisecond can't skip or duplicate at the boundary. Best-effort
 * by design — bad input or a since-deleted stream just yields no messages,
 * there's nothing a poll tick needs to surface as an error.
 */
export async function pollChatMessagesAction(
  streamId: string,
  afterCreatedAt: string,
  afterId: string,
): Promise<ChatLine[]> {
  const since = new Date(afterCreatedAt);
  if (!streamId || Number.isNaN(since.getTime()) || !afterId) return [];

  const stream = await prisma.stream.findUnique({ where: { id: streamId }, select: { userId: true } });
  if (!stream) return [];

  const [rows, bans] = await Promise.all([
    prisma.chatMessage.findMany({
      where: {
        streamId,
        deleted: false,
        OR: [{ createdAt: { gt: since } }, { createdAt: since, id: { gt: afterId } }],
      },
      include: { user: { select: { username: true, displayName: true, role: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.ban.findMany({ where: { scope: "CHANNEL", scopeId: streamId }, select: { userId: true } }),
  ]);
  if (rows.length === 0) return [];

  const bannedIds = new Set(bans.map((row) => row.userId));
  const visible = rows.filter((row) => !bannedIds.has(row.userId));
  if (visible.length === 0) return [];

  const subs = await prisma.subscription.findMany({
    where: { creatorId: stream.userId, viewerId: { in: [...new Set(visible.map((row) => row.userId))] } },
    select: { viewerId: true },
  });
  const subscriberIds = new Set(subs.map((sub) => sub.viewerId));

  return visible.map((row) => toLine(row, badgesFor(row.user.role, subscriberIds.has(row.userId))));
}

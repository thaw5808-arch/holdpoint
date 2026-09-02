"use server";

import { revalidatePath } from "next/cache";
import { avatarSrc } from "@/lib/avatar-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export type MarkNotificationsReadResult = { marked: number } | { error: string };

/**
 * Marks every one of the signed-in user's unread notifications as read —
 * fired when they open the bell panel or the full /notifications page,
 * not per-notification-clicked. That's a deliberate choice: the bell
 * badge is a "you have unseen notifications" indicator, and opening
 * either surface is what "seen" means here, the same way Discord/GitHub's
 * bell clears on open rather than requiring each item to be clicked
 * individually (most of which just navigate away immediately anyway).
 * updateMany rather than a loop — one statement regardless of how many
 * are unread.
 */
export async function markAllNotificationsReadAction(): Promise<MarkNotificationsReadResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  // The bell badge and /notifications page are both rendered from
  // (app)/layout.tsx and the notifications page itself — revalidate the
  // whole layout the same way follow/team actions do, so the next
  // navigation anywhere picks up the cleared state even though this
  // client's own view already updated it optimistically.
  revalidatePath("/", "layout");
  return { marked: result.count };
}

export interface GoLiveToastItem {
  notificationId: string;
  /** Becomes the next poll's cursor — see GoLiveToaster. */
  createdAt: string;
  streamerName: string;
  streamerUsername: string;
  streamerAvatarUrl: string | undefined;
  href: string;
}

/**
 * Cursor-polled by GoLiveToaster (go-live-toaster.tsx) — the same
 * (createdAt, id) "everything strictly after what I've already seen"
 * shape pollChatMessagesAction (actions/chat.ts) uses for live chat, the
 * one other polling loop in this app. `afterId` empty means "first poll
 * since mount" (the toaster seeds its cursor at mount time, not the
 * epoch — see its own comment for why), so that call only compares
 * createdAt.
 *
 * Only ever returns STREAM_LIVE rows: this app has no WebSocket/SSE
 * channel, so a lightweight poll against the notifications this user was
 * going to get anyway is what stands in for a push here, rather than a
 * second bespoke "who just went live" feed.
 */
export async function pollGoLiveNotificationsAction(
  afterCreatedAt: string,
  afterId: string,
): Promise<GoLiveToastItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const since = new Date(afterCreatedAt);
  if (Number.isNaN(since.getTime())) return [];

  const rows = await prisma.notification.findMany({
    where: {
      userId: user.id,
      kind: "STREAM_LIVE",
      ...(afterId
        ? { OR: [{ createdAt: { gt: since } }, { createdAt: since, id: { gt: afterId } }] }
        : { createdAt: { gt: since } }),
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (rows.length === 0) return [];

  // goLiveAction (actions/stream.ts) — the only writer of STREAM_LIVE
  // notifications — always sets href to "/watch/<slug>". The toast needs
  // the streamer's current avatar/display name too, which the
  // notification row itself doesn't carry, so this resolves them fresh
  // off that slug rather than baking a snapshot into the notification at
  // write time (and staying correct if the avatar changes in between).
  const slugs = rows.map((row) => row.href.replace(/^\/watch\//, ""));
  const streams = await prisma.stream.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, user: { select: { displayName: true, username: true, profile: { select: { avatarUrl: true } } } } },
  });
  const streamBySlug = new Map(streams.map((stream) => [stream.slug, stream]));

  return rows.flatMap((row): GoLiveToastItem[] => {
    const slug = row.href.replace(/^\/watch\//, "");
    const stream = streamBySlug.get(slug);
    if (!stream) return [];
    return [
      {
        notificationId: row.id,
        createdAt: row.createdAt.toISOString(),
        streamerName: stream.user.displayName,
        streamerUsername: stream.user.username,
        streamerAvatarUrl: avatarSrc(stream.user.profile?.avatarUrl),
        href: row.href,
      },
    ];
  });
}

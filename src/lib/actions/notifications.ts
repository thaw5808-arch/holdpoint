"use server";

import { revalidatePath } from "next/cache";
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

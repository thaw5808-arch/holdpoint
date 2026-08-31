"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const input = z.object({ targetUserId: z.string().min(1) });

export type ToggleFollowResult = { following: boolean } | { error: string };

/**
 * Follows or unfollows `targetUserId` on behalf of the signed-in user.
 * The follower is always resolved from the session — a client can only say
 * who it wants followed, never who is doing the following.
 */
export async function toggleFollowAction(targetUserId: string): Promise<ToggleFollowResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in to follow." };

  const parsed = input.safeParse({ targetUserId });
  if (!parsed.success) return { error: "Invalid user." };

  if (parsed.data.targetUserId === user.id) {
    return { error: "You can't follow yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.targetUserId },
    select: { id: true },
  });
  if (!target) return { error: "That user doesn't exist." };

  const existing = await prisma.follow.findUnique({
    where: { followerId_followedId: { followerId: user.id, followedId: target.id } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
  } else {
    await prisma.follow.create({ data: { followerId: user.id, followedId: target.id } });
    // Only on the new-follow branch — unfollowing doesn't notify anyone.
    // Self-follow is already rejected above, so there's no "notify me
    // about my own action" case to guard against here.
    await notify({
      userId: target.id,
      kind: "FOLLOW",
      title: `${user.displayName} started following you`,
      body: `@${user.username} is now following you.`,
      href: `/u/${user.username}`,
    });
  }

  // The sidebar's followed-channels list is rendered from (app)/layout.tsx,
  // which wraps every page this action can be called from — revalidate the
  // whole layout rather than guessing the caller's specific path.
  revalidatePath("/", "layout");

  return { following: !existing };
}

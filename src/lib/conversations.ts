import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Finds the existing 1:1 (non-group) conversation between two users, or
 * creates one. The single implementation of "how a DM conversation comes
 * into existence" — shared by sendClipToUserAction (actions/clip.ts, the
 * original entry point clip share-to-DM already used) and
 * startConversationAction (actions/message.ts, the new "message this
 * person" entry point), so the two paths can't drift into disagreeing about
 * what counts as "the same conversation" between a given pair of people.
 *
 * `members.length !== 2` guards against ever treating a mismatched-member
 * conversation as this pair's DM — there's no way to reach that state today
 * (nothing adds a third member to a non-group conversation), but relying on
 * `isGroup: false` alone to mean "exactly these two people" would be
 * fragile against that ever changing.
 */
export async function findOrCreateDirectConversation(
  tx: Prisma.TransactionClient,
  userIdA: string,
  userIdB: string,
) {
  let conversation = await tx.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [{ members: { some: { userId: userIdA } } }, { members: { some: { userId: userIdB } } }],
    },
    include: { members: true },
  });
  if (!conversation || conversation.members.length !== 2) {
    conversation = await tx.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: userIdA }, { userId: userIdB }] } },
      include: { members: true },
    });
  }
  return conversation;
}

/**
 * Whether two users are allowed to DM each other — a follow relationship in
 * either direction, the same rule sendClipToUserAction has always enforced
 * ("send a clip to people you follow or who follow you"). Shared with
 * startConversationAction so starting a conversation and sharing a clip
 * into one can't disagree about who's reachable — a UI that only lists
 * reachable people (ClipShareSheet's candidate list, the new-message
 * picker) is a display convenience either way, not the boundary; this is
 * what both actions re-check server-side before creating anything.
 */
export async function usersCanMessage(userIdA: string, userIdB: string): Promise<boolean> {
  const follow = await prisma.follow.findFirst({
    where: {
      OR: [
        { followerId: userIdA, followedId: userIdB },
        { followerId: userIdB, followedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return Boolean(follow);
}

/**
 * Un-hides a conversation (ConversationMember.hiddenAt) for everyone
 * except `senderId` — called whenever a new message posts, text or
 * attachment, so a member who'd "deleted" the conversation from their own
 * inbox (ThreadMenu's Delete chat) doesn't stay cut off from messages
 * arriving after that. See hiddenAt's own comment in schema.prisma for
 * the full "not a real delete" reasoning. `hiddenAt: { not: null }` keeps
 * this a no-op write for members who never hid it, not just a
 * correctness no-op.
 */
export async function unhideConversationForRecipients(conversationId: string, senderId: string) {
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: { not: senderId }, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
}

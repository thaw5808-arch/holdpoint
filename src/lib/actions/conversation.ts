"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ConversationTheme } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * Conversation-level actions fired from the thread header's three-dot menu
 * (ThreadMenu) — mute, theme, and "delete". Message sending/starting lives
 * in lib/actions/message.ts; these are about the conversation as a whole,
 * not any one message in it.
 *
 * Every action below re-checks membership itself before touching anything,
 * the same doesn't-trust-the-client stance sendMessageAction already takes
 * for conversationId: a menu that only renders for a participant is a
 * display convenience, not the boundary.
 */

async function requireMembership(conversationId: string, userId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export type ToggleMuteResult = { muted: boolean } | { error: string };

/**
 * Flips this member's own mute state for one conversation. See
 * ConversationMember.mutedAt in schema.prisma for what muting does and
 * doesn't change.
 */
export async function toggleMuteConversationAction(conversationId: string): Promise<ToggleMuteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const membership = await requireMembership(conversationId, user.id);
  if (!membership) return { error: "You don't have access to this conversation." };

  const muted = !membership.mutedAt;
  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { mutedAt: muted ? new Date() : null },
  });

  // Layout revalidation so the topbar's unread-messages badge (computed
  // fresh per request in layout.tsx) reflects the new mute state on the
  // next navigation, same as every other badge-affecting action.
  revalidatePath("/", "layout");
  return { muted };
}

const THEME_VALUES = ["SIGNAL", "GOLD", "ICE"] as const;
const themeInput = z.enum(THEME_VALUES);

export type SetThemeResult = { theme: ConversationTheme } | { error: string };

/**
 * Sets the conversation's accent colour from ThreadMenu's fixed swatch set
 * (never a free colour picker — see THEME_OPTIONS in thread-menu.tsx).
 * Lives on Conversation, not ConversationMember: unlike mute or hide, this
 * isn't a per-viewer preference — everyone in the thread sees the same
 * tint on sent-message bubbles. Any participant can change it, not just
 * whoever started the conversation.
 */
export async function setConversationThemeAction(
  conversationId: string,
  theme: string,
): Promise<SetThemeResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const parsed = themeInput.safeParse(theme);
  if (!parsed.success) return { error: "Invalid theme." };

  const membership = await requireMembership(conversationId, user.id);
  if (!membership) return { error: "You don't have access to this conversation." };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { themeColor: parsed.data },
  });

  revalidatePath(`/messages/${conversationId}`);
  return { theme: parsed.data };
}

export type DeleteConversationResult = { ok: true } | { error: string };

/**
 * "Delete chat" — hides the conversation from this member's own inbox only
 * (ConversationMember.hiddenAt). See that field's comment in schema.prisma
 * for the full "not a real delete" reasoning; nothing here touches the
 * other participant's membership, the conversation row, or any Message.
 */
export async function deleteConversationAction(conversationId: string): Promise<DeleteConversationResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be logged in." };

  const membership = await requireMembership(conversationId, user.id);
  if (!membership) return { error: "You don't have access to this conversation." };

  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { hiddenAt: new Date() },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

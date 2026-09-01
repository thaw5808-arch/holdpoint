import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MessageThread, type MessageLine } from "@/components/message-thread";
import { Pill } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { parseClipPayload } from "@/lib/clip-message";
import { clipPosterSrc } from "@/lib/clip-video-url";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * One conversation's full history, oldest to newest, plus a composer — the
 * thing a click on a /messages row now actually opens (that row used to be
 * a plain `<li>` with no link at all; see messages/page.tsx).
 *
 * Membership is the actual boundary, re-checked here regardless of which
 * link got the viewer here: a ConversationMember row for (this
 * conversation, this viewer) has to exist or the page 404s, same
 * doesn't-confirm-existence stance /moderation and /admin take for a
 * whole page, applied here per-conversation. sendMessageAction re-checks
 * the same thing independently for the same reason a page gate alone
 * wouldn't stop a direct call to it.
 */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  });
  if (!membership) notFound();

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: { include: { user: { include: { profile: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { include: { profile: true } } },
      },
    },
  });
  if (!conversation) notFound();

  // Opening the thread is what "reading" it means — there's no per-message
  // read flag (see Message in schema.prisma), just this per-member cursor,
  // the same one unreadMessageCount (lib/queries.ts) already compares
  // every other message's createdAt against for the topbar's unread badge.
  // That query has been live since before this page existed; nothing has
  // ever advanced the cursor it reads, so every conversation with any
  // message in it has counted as permanently unread until now.
  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { lastReadAt: new Date() },
  });

  const others = conversation.members.filter((member) => member.userId !== user.id);
  // Mirrors messages/page.tsx's own title logic exactly — a group's
  // avatar/title stands for several people at once, so there's no single
  // profile to head the page with; only a 1:1's does.
  const soloOther = !conversation.isGroup ? others[0] : undefined;
  const title = conversation.title ?? others.map((member) => member.user.displayName).join(", ") ?? "Conversation";

  const lines: MessageLine[] = conversation.messages.map((message) => {
    const clip = message.kind === "CLIP" ? parseClipPayload(message.payload) : null;
    return {
      id: message.id,
      senderId: message.senderId,
      senderDisplayName: message.sender.displayName,
      senderUsername: message.sender.username,
      senderAvatarUrl: avatarSrc(message.sender.profile?.avatarUrl),
      kind: message.kind,
      body: message.body,
      clip: clip
        ? { slug: clip.slug, title: clip.title, posterUrl: clipPosterSrc(clip.thumbnailUrl) ?? null }
        : null,
      createdAt: message.createdAt.toISOString(),
    };
  });

  return (
    <div className="mx-auto flex h-[calc(100dvh_-_var(--header-h)_-_var(--mobile-nav-clearance))] max-w-3xl flex-col px-3 sm:px-5 lg:h-[calc(100dvh_-_var(--header-h))]">
      <header className="flex shrink-0 items-center gap-3 border-b border-line py-3">
        <Link href="/messages" className="btn btn-ghost px-1.5" aria-label="Back to messages">
          <ArrowLeft size={16} />
        </Link>
        {soloOther ? (
          <Link href={`/u/${soloOther.user.username}`} className="flex min-w-0 items-center gap-2.5">
            <Avatar
              name={soloOther.user.displayName}
              seed={soloOther.user.username}
              size={34}
              presence={soloOther.user.presence}
              avatarUrl={avatarSrc(soloOther.user.profile?.avatarUrl)}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="truncate text-sm hover:text-signal">{title}</span>
                {soloOther.user.profile?.verified && <BadgeCheck size={13} className="shrink-0 text-signal" />}
              </span>
              <span className="tabular block text-[0.6875rem] text-faint">@{soloOther.user.username}</span>
            </span>
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm">{title}</span>
            <Pill tone="quiet">group</Pill>
          </span>
        )}
      </header>

      <MessageThread conversationId={conversation.id} viewerId={user.id} initial={lines} />
    </div>
  );
}

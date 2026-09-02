import Link from "next/link";
import { redirect } from "next/navigation";
import { BellOff, Film, Image as ImageIcon, Video } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { NewMessageButton } from "@/components/new-message-button";
import { EmptyState, Pill } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar-url";
import { parseClipPayload } from "@/lib/clip-message";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await prisma.conversationMember.findMany({
    // hiddenAt excludes conversations this member "deleted" (ThreadMenu's
    // Delete chat) — see ConversationMember.hiddenAt in schema.prisma.
    // Only this row is filtered on it; the other participant's own
    // membership row, untouched, is what keeps the thread in their list.
    where: { userId: user.id, hiddenAt: null },
    include: {
      conversation: {
        include: {
          members: { include: { user: { include: { profile: true } } } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { include: { profile: true } } },
          },
        },
      },
    },
  });

  // Keeps each conversation paired with this viewer's own membership row
  // (not just the conversation) so the muted indicator below can read
  // mutedAt — a per-member flag, not something on Conversation itself.
  const conversations = memberships
    .map((membership) => ({ conversation: membership.conversation, muted: Boolean(membership.mutedAt) }))
    .sort(
      (a, b) =>
        (b.conversation.messages[0]?.createdAt.getTime() ?? 0) -
        (a.conversation.messages[0]?.createdAt.getTime() ?? 0),
    );

  return (
    <div className="mx-auto max-w-3xl px-3 py-5 sm:px-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Messages</p>
          <h1 className="display text-xl uppercase tracking-[0.05em]">Direct and team chats</h1>
        </div>
        <NewMessageButton />
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          body="Invite someone from Find Players, or message a teammate straight from your roster."
          action={{ href: "/find-players", label: "Find players" }}
        />
      ) : (
        // Rounded, not chamfered — deliberately breaks the app's usual
        // corner-cut convention (see globals.css's .chamfer comment), and
        // only the hover/active highlight itself is rounded, nothing else
        // on the row. Bare Discord/Slack-style rows: no border or
        // background at rest, just a small gap between them — hover and
        // press are the only things that light a row up.
        <ul className="space-y-1">
          {conversations.map(({ conversation, muted }) => {
            const others = conversation.members.filter((member) => member.userId !== user.id);
            const last = conversation.messages[0];
            const title =
              conversation.title ?? others.map((member) => member.user.displayName).join(", ");
            // A group's avatar/title stands for several people at once, so
            // there's no single profile picture to show — only a 1:1's does.
            const soloOther = !conversation.isGroup ? others[0] : undefined;
            return (
              <li key={conversation.id}>
                {/* One link for the whole row, not one per destination —
                    unlike Home's "continue watching" row (see its own
                    comment), nothing here needs a second destination: the
                    thread page itself links to the other person's profile
                    from its header, so this row's only job is "open this
                    conversation". */}
                <Link
                  href={`/messages/${conversation.id}`}
                  className="flex w-full items-center gap-3 rounded-lg p-4 transition-colors duration-150 hover:bg-raised active:bg-line"
                >
                  <Avatar
                    name={title}
                    seed={others[0]?.user.username ?? conversation.id}
                    size={44}
                    presence={others[0]?.user.presence}
                    avatarUrl={soloOther ? avatarSrc(soloOther.user.profile?.avatarUrl) : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[15px]">
                      <span className="truncate">{title}</span>
                      {conversation.isGroup && <Pill tone="quiet">group</Pill>}
                      {muted && <BellOff size={12} className="shrink-0 text-faint" aria-label="Muted" />}
                    </p>
                    {!last ? (
                      <p className="truncate text-[0.8125rem] text-muted">No messages yet</p>
                    ) : (
                      (() => {
                        const senderName = last.senderId === user.id ? "You" : last.sender.displayName;
                        const clip = last.kind === "CLIP" ? parseClipPayload(last.payload) : null;
                        if (clip) {
                          return (
                            <p className="flex items-center gap-1.5 truncate text-[0.8125rem] text-muted">
                              <Film size={13} className="shrink-0 text-signal" />
                              <span className="truncate">
                                {senderName} sent a clip: {clip.title}
                              </span>
                            </p>
                          );
                        }
                        if (last.kind === "IMAGE" || last.kind === "VIDEO") {
                          const Icon = last.kind === "IMAGE" ? ImageIcon : Video;
                          return (
                            <p className="flex items-center gap-1.5 truncate text-[0.8125rem] text-muted">
                              <Icon size={13} className="shrink-0 text-signal" />
                              <span className="truncate">
                                {senderName} sent {last.kind === "IMAGE" ? "a photo" : "a video"}
                              </span>
                            </p>
                          );
                        }
                        return (
                          <p className="truncate text-[0.8125rem] text-muted">
                            {senderName}: {last.body}
                          </p>
                        );
                      })()
                    )}
                  </div>
                  {/* Pinned to the row's far right by the name/preview
                      column's flex-1 above soaking up all the space
                      between them — this only needs shrink-0, not any
                      explicit positioning of its own. */}
                  {last && (
                    <span className="tabular shrink-0 text-[0.625rem] text-faint">
                      {relativeTime(last.createdAt)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

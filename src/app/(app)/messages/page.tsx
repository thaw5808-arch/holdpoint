import Link from "next/link";
import { redirect } from "next/navigation";
import { Film } from "lucide-react";
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
    where: { userId: user.id },
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

  const conversations = memberships
    .map((membership) => membership.conversation)
    .sort(
      (a, b) =>
        (b.messages[0]?.createdAt.getTime() ?? 0) - (a.messages[0]?.createdAt.getTime() ?? 0),
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
        <ul className="divide-y divide-line border border-line">
          {conversations.map((conversation) => {
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
                  className="flex items-center gap-3 bg-surface px-3 py-3 hover:bg-raised"
                >
                  <Avatar
                    name={title}
                    seed={others[0]?.user.username ?? conversation.id}
                    size={36}
                    presence={others[0]?.user.presence}
                    avatarUrl={soloOther ? avatarSrc(soloOther.user.profile?.avatarUrl) : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm">
                      <span className="truncate">{title}</span>
                      {conversation.isGroup && <Pill tone="quiet">group</Pill>}
                    </p>
                    {!last ? (
                      <p className="truncate text-[0.8125rem] text-muted">No messages yet</p>
                    ) : (
                      (() => {
                        const senderName = last.senderId === user.id ? "You" : last.sender.displayName;
                        const clip = last.kind === "CLIP" ? parseClipPayload(last.payload) : null;
                        return clip ? (
                          <p className="flex items-center gap-1.5 truncate text-[0.8125rem] text-muted">
                            <Film size={13} className="shrink-0 text-signal" />
                            <span className="truncate">
                              {senderName} sent a clip: {clip.title}
                            </span>
                          </p>
                        ) : (
                          <p className="truncate text-[0.8125rem] text-muted">
                            {senderName}: {last.body}
                          </p>
                        );
                      })()
                    )}
                  </div>
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

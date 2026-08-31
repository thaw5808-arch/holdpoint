import type { NotificationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Fire-and-forget notification write, used by every "nice to tell someone"
 * side effect wired up alongside this helper — a moderator hiding your
 * content, a new follower, a comment on your clip, a like milestone, a
 * match result going final, a suspension or its lift. Every one of those
 * already succeeded by the time this is called; the notification is never
 * allowed to fail that action, so this always resolves and just logs if
 * the write itself fails, the same "don't fail the user-visible action
 * over a side-effect hiccup" call as the storage cleanup in
 * deleteClipAction (clip.ts).
 *
 * Deliberately called *after* the action's own transaction commits, not
 * inside it — unlike the team-invite and tournament notifications
 * elsewhere in this codebase, where the notification is the only way the
 * recipient would ever discover the thing exists (an invite, an
 * application) and atomicity is the point, everything routed through here
 * is about something the recipient can already see some other way (their
 * content, their follower list, their bracket). Coupling those to the
 * same transaction would mean a transient notification failure silently
 * undoing a real action — hiding content, lifting a suspension — which is
 * worse than the recipient just not hearing about it promptly.
 */
export async function notify(data: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
}): Promise<void> {
  await prisma.notification.create({ data }).catch((error) => {
    console.error(`[notify:${data.kind}] failed to notify user ${data.userId}:`, error);
  });
}

"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { EmptyState } from "@/components/ui";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  href: string;
  unread: boolean;
  at: string;
}

/**
 * The full /notifications page's list. Marks everything read the moment
 * it mounts — same "opening the panel is what 'seen' means" choice as the
 * topbar bell (see markAllNotificationsReadAction) — rather than waiting
 * on each row to be clicked individually, most of which navigate away
 * immediately anyway. `items` starts already-cleared (mirroring the
 * bell's instant optimistic clear on click, rather than the real
 * server-rendered unread state that would flip a beat later once the
 * effect below fires) so visiting this page never flashes unread dots
 * that are about to disappear.
 */
export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [items] = useState(() => notifications.map((item) => ({ ...item, unread: false })));
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!notifications.some((item) => item.unread)) return;
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
    // Deliberately mount-only (see the module comment) — re-running this
    // off `notifications` would re-fire every time the server prop
    // changes, marking-as-read on every navigation back to this page
    // rather than once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Follow a few channels and join a community — you'll hear when someone goes live or your match is ready."
        action={{ href: "/discover", label: "Find channels" }}
      />
    );
  }

  return (
    <ul className="divide-y divide-line border border-line">
      {items.map((notification) => (
        <li key={notification.id}>
          <Link href={notification.href} className="flex gap-3 bg-surface px-3 py-3 hover:bg-raised">
            <span
              className={`mt-2 h-1.5 w-1.5 shrink-0 ${notification.unread ? "bg-signal" : "bg-transparent"}`}
            />
            <span className="min-w-0">
              <span className="block text-sm">{notification.title}</span>
              <span className="block text-[0.8125rem] text-muted">{notification.body}</span>
              <span className="tabular block pt-0.5 text-[0.625rem] text-faint">{notification.at}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

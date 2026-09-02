"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { pollGoLiveNotificationsAction, type GoLiveToastItem } from "@/lib/actions/notifications";

/**
 * No WebSocket/SSE channel in this app — the same constraint LiveChat
 * (live-chat.tsx) is already built around, which polls its own stream
 * every 3s. This poll is app-wide instead of per-stream (it runs once,
 * mounted in (app)/layout.tsx, for as long as any page is open) and a
 * "someone you follow went live" event is orders of magnitude rarer than
 * a chat line, so it uses a much longer interval — frequent enough that a
 * toast still feels close to real-time, not so frequent that every open
 * tab is hitting the DB every few seconds for an event this infrequent.
 */
const POLL_INTERVAL_MS = 20_000;

/** How long a toast stays up before it dismisses itself. */
const AUTO_DISMISS_MS = 15_000;

/**
 * App-wide "a followed creator just went live" toast — the surface for
 * STREAM_LIVE notifications that isn't the bell (topbar.tsx) or
 * /notifications. Mounted once in (app)/layout.tsx so it's alive on every
 * page, not just the watch page.
 *
 * The cursor is seeded at *mount time*, not the epoch: this only ever
 * shows go-lives that happen while the app is open, the same "toast vs.
 * inbox" split every notification-toast pattern makes — anything that
 * happened before this tab was open already sits in the bell/notifications
 * page, and re-surfacing that whole backlog as toasts on every page load
 * would be spam, not a notification.
 *
 * Deliberately doesn't touch read state (markAllNotificationsReadAction) —
 * dismissing a toast and reading the bell are two different things, the
 * same distinction most apps that have both draw.
 */
export function GoLiveToaster() {
  const [toasts, setToasts] = useState<GoLiveToastItem[]>([]);
  const cursor = useRef({ createdAt: new Date().toISOString(), id: "" });

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const found = await pollGoLiveNotificationsAction(cursor.current.createdAt, cursor.current.id);
      if (cancelled || found.length === 0) return;
      const last = found[found.length - 1];
      cursor.current = { createdAt: last.createdAt, id: last.notificationId };
      setToasts((current) => [...current, ...found]);
    };

    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dismiss = (notificationId: string) =>
    setToasts((current) => current.filter((toast) => toast.notificationId !== notificationId));

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(var(--mobile-nav-clearance)_+_0.75rem)] right-3 z-50 flex w-[min(320px,calc(100vw-1.5rem))] flex-col gap-2 sm:bottom-4 sm:right-4">
      {toasts.map((toast) => (
        <GoLiveToast key={toast.notificationId} toast={toast} onDismiss={() => dismiss(toast.notificationId)} />
      ))}
    </div>
  );
}

function GoLiveToast({ toast, onDismiss }: { toast: GoLiveToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // onDismiss is a fresh closure every render (it's an inline arrow in
    // the parent's .map) — keying the timer off the notification id alone
    // keeps this a mount-once timer per toast instead of restarting on
    // every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.notificationId]);

  return (
    <div className="glass-strong pointer-events-auto flex items-start gap-2.5 p-3 shadow-lg">
      <Avatar name={toast.streamerName} seed={toast.streamerUsername} size={36} live avatarUrl={toast.streamerAvatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] leading-snug">
          <span className="font-medium">{toast.streamerName}</span>{" "}
          <span className="text-muted">is live now</span>
        </p>
        <Link href={toast.href} className="btn btn-primary mt-2 w-full justify-center text-[0.6875rem]">
          Watch
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="btn btn-ghost shrink-0 px-1.5 text-faint"
      >
        <X size={13} />
      </button>
    </div>
  );
}

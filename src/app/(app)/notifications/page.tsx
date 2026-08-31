import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl px-3 py-5 sm:px-5">
      <p className="eyebrow mb-1">Notifications</p>
      <h1 className="display mb-5 text-xl uppercase tracking-[0.05em]">What you missed</h1>

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Follow a few channels and join a community — you'll hear when someone goes live or your match is ready."
          action={{ href: "/discover", label: "Find channels" }}
        />
      ) : (
        <ul className="divide-y divide-line border border-line">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link href={notification.href} className="flex gap-3 bg-surface px-3 py-3 hover:bg-raised">
                <span
                  className={`mt-2 h-1.5 w-1.5 shrink-0 ${
                    notification.readAt ? "bg-transparent" : "bg-signal"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-sm">{notification.title}</span>
                  <span className="block text-[0.8125rem] text-muted">{notification.body}</span>
                  <span className="tabular block pt-0.5 text-[0.625rem] text-faint">
                    {relativeTime(notification.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

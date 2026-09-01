import { redirect } from "next/navigation";
import { NotificationsList } from "@/components/notifications-list";
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

      <NotificationsList
        notifications={notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          href: notification.href,
          unread: notification.readAt === null,
          at: relativeTime(notification.createdAt),
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { avatarSrc } from "@/lib/avatar-url";
import { levelFromXp } from "@/lib/progression";
import {
  followedChannels,
  notificationFeed,
  searchSuggestions,
  unreadMessageCount,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [channels, notifications, suggestions, unreadMessages] = await Promise.all([
    followedChannels(user.id),
    notificationFeed(user.id),
    searchSuggestions(),
    unreadMessageCount(user.id),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        channels={channels}
        isModerator={user.role === "MODERATOR" || user.role === "ADMIN"}
        isAdmin={user.role === "ADMIN"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{
            username: user.username,
            displayName: user.displayName,
            avatarUrl: avatarSrc(user.profile?.avatarUrl),
            level: levelFromXp(user.profile?.xp ?? 0),
          }}
          suggestions={suggestions}
          notifications={notifications}
          unreadMessages={unreadMessages}
        />
        <main className="min-w-0 flex-1 pb-[var(--mobile-nav-clearance)] lg:pb-0">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}

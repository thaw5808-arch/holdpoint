"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  Compass,
  Film,
  Home,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Shield,
  ShieldAlert,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/brand";
import { compactNumber } from "@/lib/format";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/clips", label: "Clips", icon: Film },
  { href: "/communities", label: "Communities", icon: UsersRound },
  { href: "/find-players", label: "Find Players", icon: Users },
  { href: "/teams", label: "Teams", icon: Shield },
  { href: "/tournaments", label: "Tournaments", icon: CalendarClock },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

export interface FollowedChannel {
  slug: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  game: string | null;
  isLive: boolean;
  viewers: number;
}

export function Sidebar({
  channels,
  isModerator = false,
  isAdmin = false,
}: {
  channels: FollowedChannel[];
  /** Adds the Moderation link — a UI nicety only. /moderation itself
   * re-checks the role server-side regardless, so hiding this link is
   * not the actual access boundary. */
  isModerator?: boolean;
  /** Adds the Admin link — same nicety, same non-boundary: /admin/users
   * re-checks role === ADMIN server-side regardless of whether this link
   * is shown. */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const nav = [
    ...NAV,
    ...(isModerator ? [{ href: "/moderation", label: "Moderation", icon: ShieldAlert }] : []),
    ...(isAdmin ? [{ href: "/admin/users", label: "Admin", icon: UserCog }] : []),
  ];

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-ink lg:flex ${
        collapsed ? "w-[68px]" : "w-[236px]"
      }`}
    >
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <Link href="/home" aria-label="Holdpoint home">
          <Wordmark compact={collapsed} />
        </Link>
      </div>

      <nav className="px-2 py-3">
        <ul className="space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
                    active ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text"
                  }`}
                >
                  <span
                    className={`h-4 w-[2px] shrink-0 ${active ? "bg-signal" : "bg-transparent"}`}
                    aria-hidden
                  />
                  <Icon size={17} strokeWidth={1.75} className={active ? "text-signal" : ""} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-3">
        {!collapsed && <p className="eyebrow mb-2 px-2.5">Following</p>}
        <ul className="space-y-0.5">
          {channels.map((channel) => (
            <li key={channel.slug}>
              <Link
                href={`/watch/${channel.slug}`}
                className="flex items-center gap-2.5 px-2.5 py-1.5 transition-colors hover:bg-surface"
              >
                <Avatar
                  name={channel.name}
                  seed={channel.username}
                  size={26}
                  live={channel.isLive}
                  avatarUrl={channel.avatarUrl}
                />
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.8125rem] text-text">{channel.name}</span>
                      {channel.isLive ? (
                        <span className="tabular flex items-center gap-1 text-[0.6875rem] text-live">
                          <span className="live-dot h-1.5 w-1.5 bg-live" />
                          {compactNumber(channel.viewers)}
                        </span>
                      ) : (
                        <span className="text-[0.625rem] uppercase tracking-wider text-faint">Off</span>
                      )}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-faint">
                      {channel.isLive ? channel.game : "Offline"}
                    </span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex items-center gap-3 border-t border-line px-4 py-3 text-xs text-faint hover:text-text"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}

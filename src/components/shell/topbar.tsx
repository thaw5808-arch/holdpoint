"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Bell,
  Film,
  MessageSquare,
  Plus,
  Radio,
  Search,
  Shield,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/brand";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";

export interface SearchSuggestion {
  kind: "Creator" | "Game" | "Team" | "Community" | "Tournament";
  label: string;
  href: string;
  meta?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string;
  unread: boolean;
  at: string;
}

const CREATE_ACTIONS = [
  { href: "/studio/stream", label: "Go live", icon: Radio },
  { href: "/clips/new", label: "Upload clip", icon: Film },
  { href: "/communities/new", label: "Create community", icon: UsersRound },
  { href: "/teams/new", label: "Create team", icon: Shield },
  { href: "/tournaments/new", label: "Create tournament", icon: Trophy },
];

function useDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && onDismiss();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onDismiss]);
  return ref;
}

export function Topbar({
  user,
  suggestions,
  notifications,
  unreadMessages,
}: {
  user: { username: string; displayName: string; avatarUrl?: string | null; level: number };
  suggestions: SearchSuggestion[];
  notifications: NotificationItem[];
  unreadMessages: number;
}) {
  const [open, setOpen] = useState<"search" | "bell" | "create" | "me" | null>(null);
  const [query, setQuery] = useState("");
  const ref = useDismiss(() => setOpen(null));
  // Seeded once from the server prop, then owned locally — same
  // "optimistic, seed once" approach as FollowButton — so opening the
  // bell clears the badge immediately instead of waiting on the next
  // navigation to re-fetch AppLayout's notificationFeed.
  const [items, setItems] = useState(notifications);
  const [, startMarkReadTransition] = useTransition();

  const filtered = query
    ? suggestions.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 7)
    : suggestions.slice(0, 5);
  const unread = items.filter((item) => item.unread).length;

  const openBell = () => {
    const opening = open !== "bell";
    setOpen(opening ? "bell" : null);
    if (!opening || unread === 0) return;
    setItems((current) => current.map((item) => ({ ...item, unread: false })));
    startMarkReadTransition(async () => {
      await markAllNotificationsReadAction();
    });
  };

  return (
    <header
      ref={ref}
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-ink/92 px-3 backdrop-blur-md sm:px-4"
    >
      <Link href="/home" className="lg:hidden" aria-label="Holdpoint home">
        <Wordmark compact />
      </Link>

      <div className="relative mx-auto w-full max-w-xl">
        <label className="sr-only" htmlFor="global-search">
          Search Holdpoint
        </label>
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          id="global-search"
          className="input input-icon-left"
          placeholder="Search creators, games, teams, tournaments"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen("search")}
        />
        {open === "search" && (
          <div className="glass-strong absolute left-0 right-0 top-12 z-50 p-1">
            <p className="eyebrow px-3 py-2">{query ? "Results" : "Recent"}</p>
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted">
                Nothing matches “{query}”. Try a game name or a team tag.
              </p>
            )}
            <ul>
              {filtered.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(null)}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="eyebrow w-16 shrink-0">{item.kind}</span>
                      <span className="truncate text-sm">{item.label}</span>
                    </span>
                    {item.meta && <span className="text-xs text-faint">{item.meta}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            className="btn btn-ghost relative px-2"
            aria-label={`Notifications, ${unread} unread`}
            onClick={openBell}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-signal" aria-hidden />
            )}
          </button>
          {open === "bell" && (
            <div className="glass-strong absolute right-0 top-11 z-50 w-[330px] p-1">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="eyebrow">Notifications</p>
                <Link href="/notifications" className="text-xs text-muted hover:text-text">
                  See all
                </Link>
              </div>
              {items.length === 0 ? (
                <p className="px-3 pb-4 pt-1 text-sm text-muted">
                  Nothing yet. Follow a creator and you&rsquo;ll hear when they go live.
                </p>
              ) : (
                <ul className="max-h-[60vh] overflow-y-auto">
                  {items.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(null)}
                        className="flex gap-2.5 px-3 py-2.5 hover:bg-surface"
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${
                            item.unread ? "bg-signal" : "bg-transparent"
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-text">{item.title}</span>
                          <span className="block truncate text-xs text-muted">{item.body}</span>
                          <span className="tabular block pt-0.5 text-[0.625rem] text-faint">
                            {item.at}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <Link href="/messages" className="btn btn-ghost relative px-2" aria-label="Messages">
          <MessageSquare size={17} />
          {unreadMessages > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-signal" aria-hidden />
          )}
        </Link>

        <div className="relative">
          <button
            type="button"
            className="btn btn-primary px-2.5"
            aria-expanded={open === "create"}
            onClick={() => setOpen(open === "create" ? null : "create")}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Create</span>
          </button>
          {open === "create" && (
            <div className="glass-strong absolute right-0 top-11 z-50 w-56 p-1">
              <ul>
                {CREATE_ACTIONS.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(null)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-surface"
                    >
                      <Icon size={16} className="text-signal" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            onClick={() => setOpen(open === "me" ? null : "me")}
            className="ml-1 flex items-center"
          >
            <Avatar name={user.displayName} seed={user.username} size={30} avatarUrl={user.avatarUrl} />
          </button>
          {open === "me" && (
            <div className="glass-strong absolute right-0 top-11 z-50 w-56 p-1">
              <div className="border-b border-line/60 px-3 py-2.5">
                <p className="text-sm">{user.displayName}</p>
                <p className="tabular text-xs text-faint">
                  @{user.username} · Level {user.level}
                </p>
              </div>
              <ul>
                {[
                  ["/u/" + user.username, "Your profile"],
                  ["/studio", "Creator dashboard"],
                  ["/settings", "Settings"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(null)}
                      className="block px-3 py-2.5 text-sm hover:bg-surface"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                <li>
                  <form action="/api/logout" method="post">
                    <button className="w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-surface hover:text-text">
                      Log out
                    </button>
                  </form>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

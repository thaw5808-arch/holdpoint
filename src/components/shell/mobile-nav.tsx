"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Compass, Film, Home, Plus, Radio, Shield, Trophy, User, UsersRound } from "lucide-react";

const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: null, label: "Create", icon: Plus },
  { href: "/communities", label: "Communities", icon: UsersRound },
  { href: "/me", label: "Profile", icon: User },
];

const CREATE_ACTIONS = [
  { href: "/studio/stream", label: "Go live", icon: Radio },
  { href: "/clips/new", label: "Upload clip", icon: Film },
  { href: "/teams/new", label: "Create team", icon: Shield },
  { href: "/tournaments/new", label: "Create tournament", icon: Trophy },
];

export function MobileNav() {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);

  return (
    <>
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Create">
          <button
            className="absolute inset-0 bg-ink/60"
            aria-label="Close"
            onClick={() => setSheet(false)}
          />
          <div className="glass-strong absolute bottom-[68px] left-3 right-3 p-2">
            <ul>
              {CREATE_ACTIONS.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setSheet(false)}
                    className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-surface"
                  >
                    <Icon size={17} className="text-signal" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex h-[64px] items-stretch lg:hidden">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href ? pathname === href || pathname.startsWith(`${href}/`) : sheet;
          const content = (
            <>
              <Icon size={19} strokeWidth={1.75} className={active ? "text-signal" : ""} />
              {/* nav-label: same Rajdhani treatment as the sidebar (see
                  globals.css) — 0.6875rem is 0.625rem + ~1pt, kept small
                  since five labels share this bar's full width. */}
              <span className={`nav-label text-[0.6875rem] ${active ? "text-text" : "text-faint"}`}>
                {label}
              </span>
            </>
          );
          return href ? (
            <Link
              key={label}
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-1"
              aria-current={active ? "page" : undefined}
            >
              {content}
            </Link>
          ) : (
            <button
              key={label}
              type="button"
              onClick={() => setSheet((value) => !value)}
              className="flex flex-1 flex-col items-center justify-center gap-1"
              aria-expanded={sheet}
            >
              {content}
            </button>
          );
        })}
      </nav>
    </>
  );
}

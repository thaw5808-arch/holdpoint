"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/games", label: "Games" },
  { href: "/settings/preferences", label: "Preferences" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`eyebrow -mb-px border-b-2 px-3 py-2.5 ${
              active ? "border-signal text-text" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

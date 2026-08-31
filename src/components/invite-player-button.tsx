"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { inviteToTeamAction } from "@/lib/actions/team";
import type { ManagedTeam } from "@/lib/queries";

/**
 * The player card's Invite button. Owner/captain of one or more teams: a
 * popover lets them pick which team, and inviteToTeamAction + its
 * notification handle the rest — same action and delivery path the team
 * page's own invite form uses. Owner/captain of none: the popover says so
 * instead of a button that looked actionable but couldn't do anything.
 */
export function InvitePlayerButton({ username, teams }: { username: string; teams: ManagedTeam[] }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const invite = (team: ManagedTeam) => {
    setErrors((state) => ({ ...state, [team.id]: "" }));
    setPendingTeamId(team.id);
    startTransition(async () => {
      const result = await inviteToTeamAction(team.id, username);
      setPendingTeamId(null);
      if ("error" in result) {
        setErrors((state) => ({ ...state, [team.id]: result.error }));
      } else {
        setSent((state) => new Set(state).add(team.id));
      }
    });
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Invite
      </button>

      {open && (
        <div role="menu" className="glass-strong absolute bottom-full right-0 z-20 mb-1.5 w-56 overflow-hidden">
          {teams.length === 0 ? (
            <div className="p-3">
              <p className="text-[0.75rem] leading-snug text-muted">
                You don&rsquo;t manage a team, so there&rsquo;s nowhere to invite them to.
              </p>
              <Link href="/teams/new" className="btn btn-primary mt-2.5 w-full" onClick={() => setOpen(false)}>
                Create a team
              </Link>
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => invite(team)}
                    disabled={pendingTeamId === team.id || sent.has(team.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-70"
                  >
                    <span className="truncate">{team.name}</span>
                    <span className="shrink-0 text-[0.6875rem] text-faint">
                      {pendingTeamId === team.id ? "Inviting…" : sent.has(team.id) ? "Sent" : "Invite"}
                    </span>
                  </button>
                  {errors[team.id] && (
                    <p role="alert" className="px-3 pb-1.5 text-[0.6875rem] text-live">
                      {errors[team.id]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

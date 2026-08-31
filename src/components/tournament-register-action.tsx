"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Emblem } from "@/components/emblem";
import { registerableTeamsAction, registerTeamAction, type RegisterableTeam } from "@/lib/actions/tournament";

/**
 * The "Register a team" button: opens a picker of teams the caller owns or
 * captains that are actually eligible for this tournament (plays the game,
 * meets the roster minimum, not already registered). registerTeamAction
 * re-checks all of that from the DB on submit regardless of what's shown
 * here, same as the team-invite picker.
 */
export function TournamentRegisterAction({
  tournamentId,
  canRegister,
  closedLabel,
}: {
  tournamentId: string;
  canRegister: boolean;
  closedLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [teams, setTeams] = useState<RegisterableTeam[]>([]);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      startTransition(async () => {
        const result = await registerableTeamsAction(tournamentId);
        setTeams(result);
        setLoaded(true);
      });
    }
  };

  const register = (team: RegisterableTeam) => {
    setMessage(null);
    startTransition(async () => {
      const result = await registerTeamAction(tournamentId, team.id);
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
      } else {
        setTeams((current) => current.filter((entry) => entry.id !== team.id));
        setMessage({ tone: "success", text: `${team.name} is registered — pending review.` });
      }
    });
  };

  if (!canRegister) {
    return (
      <button className="btn btn-primary" disabled>
        {closedLabel}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-primary" onClick={toggle}>
        Register a team
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-11 z-50 w-72 p-1">
          <p className="eyebrow px-3 py-2">Register a team</p>

          {isPending && !loaded ? (
            <p className="px-3 pb-4 pt-1 text-sm text-muted">Loading your teams…</p>
          ) : teams.length === 0 && !message ? (
            <div className="px-3 pb-4 pt-1">
              <p className="text-sm text-muted">
                You&rsquo;re not the owner or captain of a team eligible for this tournament — it needs to
                play the right game and meet the roster minimum.
              </p>
              <Link
                href="/teams/new"
                onClick={() => setOpen(false)}
                className="btn btn-ghost mt-3 text-[0.6875rem]"
              >
                Create a team
              </Link>
            </div>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => register(team)}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface disabled:opacity-60"
                  >
                    <Emblem seed={team.slug} tag={team.tag} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{team.name}</span>
                      <span className="block truncate text-[0.6875rem] text-faint">
                        {team.tag} · {team.memberCount} on roster
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {message && (
            <p
              role="alert"
              className={`px-3 pb-2 pt-1 text-[0.75rem] ${
                message.tone === "error" ? "text-live" : "text-signal"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

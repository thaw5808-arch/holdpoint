"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import {
  inviteToTeamAction,
  leaveTeamAction,
  respondToTeamInviteAction,
  searchInvitableUsersAction,
  type InvitableUser,
} from "@/lib/actions/team";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Owner/captain view: typeahead invite. The search is a convenience for
 * finding a username — inviteToTeamAction re-validates everything
 * (permission, self-invite, already-on-roster, already-invited) itself, so
 * a stale or tampered-with dropdown selection can't invite anyone the
 * action wouldn't otherwise allow.
 */
export function InviteToTeamForm({ teamId }: { teamId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvitableUser[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef(0);

  // Debounced search — fires SEARCH_DEBOUNCE_MS after typing stops, not per
  // keystroke, and a stale response arriving after a newer query started is
  // discarded rather than clobbering fresher results.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const requestId = ++latestQuery.current;
    const timeout = setTimeout(async () => {
      const matches = await searchInvitableUsersAction(teamId, trimmed);
      if (latestQuery.current === requestId) {
        setResults(matches);
        setSearching(false);
        setHighlighted(0);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, teamId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const invite = (target: InvitableUser) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setMessage(null);
    startTransition(async () => {
      const result = await inviteToTeamAction(teamId, target.username);
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
      } else {
        setMessage({ tone: "success", text: `Invite sent to @${target.username}.` });
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[highlighted];
      if (target) invite(target);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="invite-listbox"
        aria-activedescendant={
          showDropdown && results[highlighted] ? `invite-option-${results[highlighted].id}` : undefined
        }
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Invite by username or name"
        disabled={isPending}
        className="input w-56"
      />

      {showDropdown && (
        <ul id="invite-listbox" role="listbox" className="glass-strong absolute z-20 mt-1 max-h-64 w-64 overflow-y-auto">
          {results.length === 0 && (
            <li className="px-3 py-2 text-[0.75rem] text-faint">
              {searching ? "Searching…" : "No players found."}
            </li>
          )}
          {results.map((candidate, index) => (
            <li key={candidate.id}>
              <button
                type="button"
                id={`invite-option-${candidate.id}`}
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => event.preventDefault()} // keep input focus over the click
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => invite(candidate)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  index === highlighted ? "bg-surface" : ""
                }`}
              >
                <Avatar
                  name={candidate.displayName}
                  seed={candidate.username}
                  size={24}
                  avatarUrl={candidate.avatarUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{candidate.displayName}</span>
                  <span className="block truncate text-[0.6875rem] text-faint">@{candidate.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p
          role="alert"
          className={`mt-1.5 text-[0.75rem] ${message.tone === "error" ? "text-live" : "text-signal"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Ordinary-member view: leave the team. Refused for owners, explicitly. */
export function LeaveTeamButton({ teamId }: { teamId: string }) {
  const [left, setLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await leaveTeamAction(teamId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setLeft(true);
      }
    });
  };

  if (left) return <p className="text-sm text-muted">You left this team.</p>;

  return (
    <div>
      <button className="btn" onClick={handleClick} disabled={isPending}>
        {isPending ? "Leaving…" : "Leave team"}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 max-w-[220px] text-[0.75rem] text-live">
          {error}
        </p>
      )}
    </div>
  );
}

/** Non-member-with-a-pending-invite view: accept or decline. */
export function RespondToTeamInviteButtons({ inviteId }: { inviteId: string }) {
  const [status, setStatus] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const respond = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await respondToTeamInviteAction(inviteId, accept);
      if ("error" in result) {
        setError(result.error);
      } else {
        setStatus(result.status);
      }
    });
  };

  if (status === "accepted") return <p className="text-sm text-signal">You joined the team.</p>;
  if (status === "declined") return <p className="text-sm text-muted">Invite declined.</p>;

  return (
    <div>
      <p className="mb-1.5 text-[0.75rem] text-faint">You have been invited to join this team.</p>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => respond(true)} disabled={isPending}>
          Accept
        </button>
        <button className="btn" onClick={() => respond(false)} disabled={isPending}>
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
          {error}
        </p>
      )}
    </div>
  );
}

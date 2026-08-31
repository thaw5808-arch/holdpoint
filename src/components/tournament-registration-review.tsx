"use client";

import { useState, useTransition } from "react";
import { Emblem } from "@/components/emblem";
import { respondToRegistrationAction } from "@/lib/actions/tournament";

export type PendingRegistration = {
  id: string;
  team: { slug: string; name: string; tag: string };
  rosterSize: number;
  submittedAt: string;
};

/**
 * Organizer-only review list for PENDING registrations. Only rendered by
 * the page when the viewer is the tournament's organizer — but that's a
 * display convenience, not the authorization boundary: respondToRegistrationAction
 * re-checks organizer standing against the DB regardless of who the client
 * claims to be.
 */
export function TournamentRegistrationReview({ registrations }: { registrations: PendingRegistration[] }) {
  const [entries, setEntries] = useState(registrations);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const approve = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await respondToRegistrationAction(id, true);
      if ("error" in result) {
        setError({ id, text: result.error });
      } else {
        setEntries((current) => current.filter((entry) => entry.id !== id));
      }
    });
  };

  const openReject = (id: string) => {
    setError(null);
    setReason("");
    setReasonFor(id);
  };

  const confirmReject = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await respondToRegistrationAction(id, false, reason.trim() || undefined);
      if ("error" in result) {
        setError({ id, text: result.error });
      } else {
        setEntries((current) => current.filter((entry) => entry.id !== id));
      }
      setReasonFor(null);
    });
  };

  if (entries.length === 0) return null;

  return (
    <div className="mb-8 divide-y divide-line border border-line">
      {entries.map((entry) => (
        <div key={entry.id} className="bg-surface px-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Emblem seed={entry.team.slug} tag={entry.team.tag} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{entry.team.name}</p>
              <p className="tabular text-[0.75rem] text-faint">
                {entry.rosterSize} on roster · applied {entry.submittedAt}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => approve(entry.id)}
                disabled={isPending}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => (reasonFor === entry.id ? setReasonFor(null) : openReject(entry.id))}
                disabled={isPending}
              >
                Reject
              </button>
            </div>
          </div>

          {reasonFor === entry.id && (
            <div className="mt-2.5 flex flex-wrap items-start gap-2">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (optional) — shown to the team"
                rows={2}
                maxLength={300}
                className="input min-w-0 flex-1"
              />
              <button
                type="button"
                className="btn"
                onClick={() => confirmReject(entry.id)}
                disabled={isPending}
              >
                Confirm reject
              </button>
            </div>
          )}

          {error?.id === entry.id && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {error.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

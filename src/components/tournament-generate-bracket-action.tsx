"use client";

import { useState, useTransition } from "react";
import { generateBracketAction } from "@/lib/actions/tournament";

/**
 * Organizer-only control that closes registration and (re)generates the
 * bracket from the tournament's current approved teams. Confirms inline
 * rather than with a native `confirm()` dialog — this deletes any existing
 * unplayed matches, so it shouldn't be one accidental click. Only rendered
 * for the organizer, but generateBracketAction re-checks that from the DB
 * regardless.
 */
export function TournamentGenerateBracketAction({
  tournamentId,
  canGenerate,
  blockedReason,
}: {
  tournamentId: string;
  canGenerate: boolean;
  blockedReason: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    setResult(null);
    startTransition(async () => {
      const response = await generateBracketAction(tournamentId);
      if ("error" in response) {
        setResult({ tone: "error", text: response.error });
      } else {
        setResult({
          tone: "success",
          text: `Registration closed and the bracket was regenerated — ${response.matchCount} matches.`,
        });
      }
      setConfirming(false);
    });
  };

  return (
    <div className="mb-8 border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Organizer</p>
          <p className="max-w-xl text-sm text-muted">
            {canGenerate
              ? "Closes registration and rebuilds the bracket from the currently approved teams — any existing unplayed matches are replaced."
              : blockedReason}
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={() => setConfirming(true)}
            disabled={!canGenerate || isPending}
          >
            Close registration &amp; generate bracket
          </button>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn btn-primary" onClick={generate} disabled={isPending}>
              {isPending ? "Generating…" : "Confirm"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {result && (
        <p
          role="alert"
          className={`mt-2 text-[0.75rem] ${result.tone === "error" ? "text-live" : "text-signal"}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}

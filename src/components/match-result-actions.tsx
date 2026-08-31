"use client";

import { useState, useTransition } from "react";
import { confirmMatchResultAction, reportMatchResultAction } from "@/lib/actions/tournament";

const REPORTABLE_STATES = new Set(["PENDING", "READY", "LIVE"]);

/**
 * Report / confirm / dispute controls for the bracket's match detail
 * panel. Only rendered for a viewer on one of the match's two teams — but
 * that's a display convenience, not the authorization boundary: both
 * server actions re-derive the caller's team standing from the DB.
 */
export function MatchResultActions({
  matchId,
  state,
  bestOf,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  reportedById,
  viewerId,
  viewerTeamIds,
}: {
  matchId: string;
  state: string;
  bestOf: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  reportedById: string | null;
  viewerId: string | null;
  viewerTeamIds: string[];
}) {
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!viewerId || !homeTeamId || !awayTeamId || !homeTeamName || !awayTeamName) return null;
  const onEitherTeam = viewerTeamIds.includes(homeTeamId) || viewerTeamIds.includes(awayTeamId);
  if (!onEitherTeam) return null;

  const isReporter = reportedById === viewerId;

  const submitReport = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await reportMatchResultAction(matchId, Number(homeScore), Number(awayScore));
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
      } else {
        setMessage({ tone: "success", text: "Score reported — waiting on the other team to confirm." });
      }
    });
  };

  const confirm = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmMatchResultAction(matchId, true);
      if ("error" in result) setMessage({ tone: "error", text: result.error });
    });
  };

  const submitDispute = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmMatchResultAction(matchId, false, reason.trim() || undefined);
      if ("error" in result) setMessage({ tone: "error", text: result.error });
      setDisputing(false);
    });
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      {REPORTABLE_STATES.has(state) && (
        <div>
          <p className="eyebrow mb-2">Report score · best of {bestOf}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              value={homeScore}
              onChange={(event) => setHomeScore(event.target.value)}
              aria-label={`${homeTeamName} score`}
              className="input w-16"
            />
            <span className="text-faint">–</span>
            <input
              type="number"
              min={0}
              value={awayScore}
              onChange={(event) => setAwayScore(event.target.value)}
              aria-label={`${awayTeamName} score`}
              className="input w-16"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitReport}
              disabled={isPending || homeScore === "" || awayScore === ""}
            >
              Report
            </button>
          </div>
        </div>
      )}

      {state === "AWAITING_CONFIRMATION" &&
        (isReporter ? (
          <p className="text-sm text-muted">Waiting on the other team to confirm.</p>
        ) : (
          <div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={confirm} disabled={isPending}>
                Confirm result
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setDisputing((current) => !current)}
                disabled={isPending}
              >
                Dispute
              </button>
            </div>
            {disputing && (
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason (optional) — sent to the organizer"
                  rows={2}
                  maxLength={300}
                  className="input min-w-0 flex-1"
                />
                <button type="button" className="btn" onClick={submitDispute} disabled={isPending}>
                  Submit dispute
                </button>
              </div>
            )}
          </div>
        ))}

      {state === "DISPUTED" && (
        <p className="text-sm text-live">Disputed — the organizer will review this result.</p>
      )}

      {message && (
        <p
          role="alert"
          className={`mt-2 text-[0.75rem] ${message.tone === "error" ? "text-live" : "text-signal"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

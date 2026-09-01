"use client";

import { useState, useTransition } from "react";
import { setMatchStreamUrlAction } from "@/lib/actions/tournament";

/**
 * Organizer-only control for the link "Watch this match" opens. Only ever
 * rendered when the bracket panel's caller has already confirmed the
 * viewer is the tournament's organizer — setMatchStreamUrlAction
 * re-checks that server-side regardless, same as every other
 * organizer-gated action.
 */
export function MatchStreamUrlForm({ matchId, initialUrl }: { matchId: string; initialUrl: string | null }) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setMatchStreamUrlAction(matchId, value);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setValue(result.streamUrl ?? "");
      setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-line pt-3">
      <label htmlFor={`stream-${matchId}`} className="eyebrow mb-1.5 block">
        Stream link
      </label>
      <div className="flex gap-1.5">
        <input
          id={`stream-${matchId}`}
          type="url"
          placeholder="https://twitch.tv/…"
          className="input flex-1"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
        />
        <button type="submit" className="btn shrink-0" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-1.5 text-[0.75rem] text-signal">
          Saved.
        </p>
      )}
    </form>
  );
}

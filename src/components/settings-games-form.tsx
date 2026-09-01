"use client";

import { useActionState, useState } from "react";
import { GamePicker } from "@/components/player-setup-fields";
import { updateGamesAction } from "@/lib/actions/settings";

export function GamesPickerForm({
  games,
  pickedSlugs,
}: {
  games: { slug: string; name: string; genre: string }[];
  pickedSlugs: string[];
}) {
  const [state, action, pending] = useActionState(updateGamesAction, undefined);
  const [picked, setPicked] = useState<string[]>(pickedSlugs);

  const toggle = (slug: string) =>
    setPicked((current) => (current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug]));

  return (
    <form action={action}>
      <GamePicker games={games} picked={picked} onToggle={toggle} />

      {state && "error" in state && (
        <p role="alert" className="mt-4 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      )}
      {state && "saved" in state && (
        <p role="status" className="mt-4 border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-signal">
          Saved.
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-4" disabled={pending}>
        {pending ? "Saving…" : "Save games"}
      </button>
    </form>
  );
}

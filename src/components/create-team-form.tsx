"use client";

import { useActionState, useState } from "react";
import { createTeamAction } from "@/lib/actions/team";
import { OptionPill } from "@/components/ui";
import { REGIONS } from "@/lib/regions";

export function CreateTeamForm({ games }: { games: { slug: string; name: string; shortName: string }[] }) {
  const [state, action, pending] = useActionState(createTeamAction, undefined);
  const [region, setRegion] = useState(REGIONS[0]);
  const [pickedGames, setPickedGames] = useState<string[]>([]);

  const toggleGame = (slug: string) =>
    setPickedGames((current) =>
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug],
    );

  return (
    <form action={action} className="mx-auto max-w-xl px-4 py-8">
      <p className="eyebrow mb-2">Teams</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Create a team</h1>
      <p className="mb-6 text-sm text-muted">
        You will own this team. Add players, openings and a schedule once the roster exists.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="name" className="eyebrow mb-1.5 block">
            Team name
          </label>
          <input id="name" name="name" type="text" required maxLength={40} className="input" />
          {state?.fieldErrors?.name && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="tag" className="eyebrow mb-1.5 block">
            Tag
          </label>
          <input
            id="tag"
            name="tag"
            type="text"
            required
            minLength={3}
            maxLength={4}
            placeholder="e.g. NOVA"
            className="input w-32 uppercase"
          />
          <p className="mt-1 text-[0.75rem] text-faint">3–4 letters or numbers. Shows on scoreboards.</p>
          {state?.fieldErrors?.tag && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.tag}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="eyebrow mb-2">Region</legend>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="region"
                  value={option}
                  checked={region === option}
                  onChange={() => setRegion(option)}
                  className="sr-only"
                />
                <OptionPill active={region === option} label={option} />
              </label>
            ))}
          </div>
          {state?.fieldErrors?.region && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.region}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2">Games</legend>
          <div className="flex flex-wrap gap-2">
            {games.map((game) => (
              <label key={game.slug} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="games"
                  value={game.slug}
                  checked={pickedGames.includes(game.slug)}
                  onChange={() => toggleGame(game.slug)}
                  className="sr-only"
                />
                <OptionPill active={pickedGames.includes(game.slug)} label={game.name} />
              </label>
            ))}
          </div>
          {state?.fieldErrors?.games && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.games}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="description" className="eyebrow mb-1.5 block">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={500}
            placeholder="Who you are, when you scrim, what you're looking for."
            className="input resize-none"
          />
          {state?.fieldErrors?.description && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.description}
            </p>
          )}
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="mt-5 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-end border-t border-line pt-5">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create team"}
        </button>
      </div>
    </form>
  );
}

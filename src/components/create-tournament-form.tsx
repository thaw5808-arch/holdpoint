"use client";

import { useActionState, useState } from "react";
import { createTournamentAction } from "@/lib/actions/tournament";
import { OptionPill } from "@/components/ui";
import { REGIONS } from "@/lib/regions";

const FORMATS = [
  { value: "SINGLE_ELIMINATION", label: "Single elimination" },
  { value: "DOUBLE_ELIMINATION", label: "Double elimination" },
  { value: "ROUND_ROBIN", label: "Round robin" },
] as const;

export function CreateTournamentForm({ games }: { games: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTournamentAction, undefined);
  const [game, setGame] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["value"]>("SINGLE_ELIMINATION");
  const [region, setRegion] = useState(REGIONS[0]);

  return (
    <form action={action} className="mx-auto max-w-xl px-4 py-8">
      <p className="eyebrow mb-2">Tournaments</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Create a tournament</h1>
      <p className="mb-6 text-sm text-muted">
        You&rsquo;ll be the organizer — that&rsquo;s who reviews applications, generates the bracket
        and confirms results. Registration opens the moment this is created and stays open until it
        starts.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="name" className="eyebrow mb-1.5 block">
            Tournament name
          </label>
          <input id="name" name="name" type="text" required maxLength={60} className="input" />
          {state?.fieldErrors?.name && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.name}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="eyebrow mb-2">Game</legend>
          <div className="flex flex-wrap gap-2">
            {games.map((entry) => (
              <label key={entry.slug} className="cursor-pointer">
                <input
                  type="radio"
                  name="game"
                  value={entry.slug}
                  checked={game === entry.slug}
                  onChange={() => setGame(entry.slug)}
                  required
                  className="sr-only"
                />
                <OptionPill active={game === entry.slug} label={entry.name} />
              </label>
            ))}
          </div>
          {state?.fieldErrors?.game && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.game}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2">Format</legend>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => setFormat(option.value)}
                  className="sr-only"
                />
                <OptionPill active={format === option.value} label={option.label} />
              </label>
            ))}
          </div>
          {state?.fieldErrors?.format && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.format}
            </p>
          )}
        </fieldset>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="teamSize" className="eyebrow mb-1.5 block">
              Team size
            </label>
            <input
              id="teamSize"
              name="teamSize"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={10}
              defaultValue={5}
              className="input"
            />
            <p className="mt-1 text-[0.75rem] text-faint">Players a roster needs to register.</p>
            {state?.fieldErrors?.teamSize && (
              <p role="alert" className="mt-1 text-[0.75rem] text-live">
                {state.fieldErrors.teamSize}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="maxTeams" className="eyebrow mb-1.5 block">
              Max teams
            </label>
            <input
              id="maxTeams"
              name="maxTeams"
              type="number"
              inputMode="numeric"
              required
              min={2}
              max={64}
              defaultValue={8}
              className="input"
            />
            <p className="mt-1 text-[0.75rem] text-faint">Cap on approved + pending entries.</p>
            {state?.fieldErrors?.maxTeams && (
              <p role="alert" className="mt-1 text-[0.75rem] text-live">
                {state.fieldErrors.maxTeams}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="startsAt" className="eyebrow mb-1.5 block">
            Starts
          </label>
          <input id="startsAt" name="startsAt" type="datetime-local" required className="input" />
          {state?.fieldErrors?.startsAt && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.startsAt}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="eyebrow mb-1.5 block">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            required
            placeholder="What this tournament is, and who it's for."
            className="input resize-none"
          />
          {state?.fieldErrors?.description && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.description}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="rules" className="eyebrow mb-1.5 block">
            Rules
          </label>
          <textarea
            id="rules"
            name="rules"
            rows={5}
            maxLength={2000}
            required
            placeholder="Match format (e.g. Bo3 until finals), check-in window, no-show policy, conduct — shown to entrants as-is."
            className="input resize-none"
          />
          <p className="mt-1 text-[0.75rem] text-faint">
            There&rsquo;s no way to edit a tournament after creating it yet, so get this right now.
          </p>
          {state?.fieldErrors?.rules && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.rules}
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
          {pending ? "Creating…" : "Create tournament"}
        </button>
      </div>
    </form>
  );
}

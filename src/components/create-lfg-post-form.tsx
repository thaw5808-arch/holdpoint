"use client";

import { useActionState, useMemo, useState } from "react";
import { OptionPill } from "@/components/ui";
import { createLFGPostAction } from "@/lib/actions/lfg";
import { LANGUAGES } from "@/lib/languages";
import { PLATFORMS } from "@/lib/platforms";
import { REGIONS } from "@/lib/regions";

export interface LFGGame {
  slug: string;
  name: string;
  rankTiers: string[];
  roles: string[];
}

export function CreateLFGPostForm({
  games,
  defaultRegion,
  defaultLanguage,
}: {
  games: LFGGame[];
  defaultRegion: string;
  defaultLanguage: string;
}) {
  const [state, action, pending] = useActionState(createLFGPostAction, undefined);
  const [gameSlug, setGameSlug] = useState(games[0]?.slug ?? "");
  const [region, setRegion] = useState(defaultRegion);
  const [language, setLanguage] = useState(defaultLanguage);
  const [competitive, setCompetitive] = useState(false);
  const [micRequired, setMicRequired] = useState(true);

  const selectedGame = useMemo(() => games.find((game) => game.slug === gameSlug), [games, gameSlug]);

  return (
    <form action={action} className="mx-auto max-w-xl px-4 py-8">
      <p className="eyebrow mb-2">Find players</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Post an LFG</h1>
      <p className="mb-6 text-sm text-muted">
        Say what you need. It shows up in the open-posts list until you close it.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="game" className="eyebrow mb-1.5 block">
            Game
          </label>
          <select
            id="game"
            name="game"
            value={gameSlug}
            onChange={(event) => setGameSlug(event.target.value)}
            className="input"
          >
            {games.map((game) => (
              <option key={game.slug} value={game.slug}>
                {game.name}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.game && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.game}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="body" className="eyebrow mb-1.5 block">
            What are you looking for
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={3}
            maxLength={280}
            placeholder="Need a fourth for ranked duo queue tonight, comms on."
            className="input resize-none"
          />
          {state?.fieldErrors?.body && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.body}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="needed" className="eyebrow mb-1.5 block">
            Players needed
          </label>
          <input
            id="needed"
            name="needed"
            type="number"
            min={1}
            max={9}
            defaultValue={1}
            required
            className="input w-24"
          />
          {state?.fieldErrors?.needed && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.needed}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="minTier" className="eyebrow mb-1.5 block">
              Min rank
            </label>
            <select id="minTier" name="minTier" defaultValue="" className="input">
              <option value="">Any</option>
              {selectedGame?.rankTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
            {state?.fieldErrors?.minTier && (
              <p role="alert" className="mt-1 text-[0.75rem] text-live">
                {state.fieldErrors.minTier}
              </p>
            )}
          </div>
          <div className="flex-1">
            <label htmlFor="maxTier" className="eyebrow mb-1.5 block">
              Max rank
            </label>
            <select id="maxTier" name="maxTier" defaultValue="" className="input">
              <option value="">Any</option>
              {selectedGame?.rankTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
            {state?.fieldErrors?.maxTier && (
              <p role="alert" className="mt-1 text-[0.75rem] text-live">
                {state.fieldErrors.maxTier}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="role" className="eyebrow mb-1.5 block">
            Role
          </label>
          <select id="role" name="role" defaultValue="" className="input">
            <option value="">Any</option>
            {selectedGame?.roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.role && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.role}
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
          <legend className="eyebrow mb-2">Language</legend>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="language"
                  value={option}
                  checked={language === option}
                  onChange={() => setLanguage(option)}
                  className="sr-only"
                />
                <OptionPill active={language === option} label={option.toUpperCase()} />
              </label>
            ))}
          </div>
          {state?.fieldErrors?.language && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.language}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="platform" className="eyebrow mb-1.5 block">
            Platform
          </label>
          <select id="platform" name="platform" defaultValue="" className="input">
            <option value="">Any</option>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.platform && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.platform}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="playsAt" className="eyebrow mb-1.5 block">
            Play time <span className="text-faint normal-case">(optional)</span>
          </label>
          <input id="playsAt" name="playsAt" type="datetime-local" className="input" />
          {state?.fieldErrors?.playsAt && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.playsAt}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <input
              type="checkbox"
              name="competitive"
              checked={competitive}
              onChange={(event) => setCompetitive(event.target.checked)}
              className="sr-only"
            />
            <OptionPill active={competitive} label="Competitive" />
          </label>
          <label className="cursor-pointer">
            <input
              type="checkbox"
              name="micRequired"
              checked={micRequired}
              onChange={(event) => setMicRequired(event.target.checked)}
              className="sr-only"
            />
            <OptionPill active={micRequired} label="Mic required" />
          </label>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="mt-5 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-end border-t border-line pt-5">
        <button className="btn btn-primary" disabled={pending || games.length === 0}>
          {pending ? "Posting…" : "Post LFG"}
        </button>
      </div>
    </form>
  );
}

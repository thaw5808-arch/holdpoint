"use client";

import { Check } from "lucide-react";
import { Thumb } from "@/components/cards";
import { OptionPill } from "@/components/ui";
import { LANGUAGES } from "@/lib/languages";
import { PLATFORMS } from "@/lib/platforms";
import { REGIONS } from "@/lib/regions";

export const GOALS: [string, string][] = [
  ["WATCH", "Watch streams"],
  ["TEAMMATES", "Find teammates"],
  ["STREAM", "Stream myself"],
  ["TOURNAMENTS", "Join tournaments"],
  ["COMMUNITY", "Build a community"],
];

/**
 * The game-tile grid — shared by onboarding's "what do you play" step and
 * settings' game picker. `name` is the checkbox's form field name so both
 * callers can read the picked set with `formData.getAll(name)`.
 */
export function GamePicker({
  games,
  picked,
  onToggle,
  name = "games",
}: {
  games: { slug: string; name: string; genre: string }[];
  picked: string[];
  onToggle: (slug: string) => void;
  name?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {games.map((game) => {
        const active = picked.includes(game.slug);
        return (
          <label key={game.slug} className={`tick block cursor-pointer ${active ? "tick-active" : ""}`}>
            <input
              type="checkbox"
              name={name}
              value={game.slug}
              checked={active}
              onChange={() => onToggle(game.slug)}
              className="sr-only"
            />
            <span className={`card-select relative block ${active ? "card-select-active" : ""}`}>
              <Thumb seed={game.slug} className="aspect-[3/4]" />
              {active && (
                <span
                  className="chamfer-sm absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-signal text-ink"
                  aria-hidden
                >
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={`mt-1.5 block truncate text-[0.8125rem] ${active ? "text-signal" : ""}`}>
              {game.name}
            </span>
            <span className="block text-[0.625rem] text-faint">{game.genre}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Region / languages / platforms — onboarding's "Your setup" step, reused
 * as-is by settings/preferences so there's one copy of this fieldset.
 */
export function RegionLanguagePlatformFields({
  region,
  setRegion,
  languages,
  setLanguages,
  platforms,
  setPlatforms,
}: {
  region: string;
  setRegion: (value: string) => void;
  languages: string[];
  setLanguages: (value: string[]) => void;
  platforms: string[];
  setPlatforms: (value: string[]) => void;
}) {
  const toggle = (list: string[], setList: (value: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <>
      <fieldset className="mb-5">
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
      </fieldset>
      <fieldset className="mb-5">
        <legend className="eyebrow mb-2">Languages</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((language) => (
            <label key={language} className="cursor-pointer">
              <input
                type="checkbox"
                name="languages"
                value={language}
                checked={languages.includes(language)}
                onChange={() => toggle(languages, setLanguages, language)}
                className="sr-only"
              />
              <OptionPill active={languages.includes(language)} label={language.toUpperCase()} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow mb-2">Platforms</legend>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => (
            <label key={platform} className="cursor-pointer">
              <input
                type="checkbox"
                name="platforms"
                value={platform}
                checked={platforms.includes(platform)}
                onChange={() => toggle(platforms, setPlatforms, platform)}
                className="sr-only"
              />
              <OptionPill active={platforms.includes(platform)} label={platform} />
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** Goal checkboxes — onboarding's "What are you here for?" step. */
export function GoalsField({
  goals,
  onToggle,
}: {
  goals: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {GOALS.map(([value, label]) => {
        const active = goals.includes(value);
        return (
          <label
            key={value}
            className={`tick card-select flex cursor-pointer items-center gap-3 p-3 ${
              active ? "card-select-active tick-active" : ""
            }`}
          >
            <input
              type="checkbox"
              name="goals"
              value={value}
              checked={active}
              onChange={() => onToggle(value)}
              className="sr-only"
            />
            <span className={`h-2 w-2 shrink-0 ${active ? "bg-signal" : "bg-line-strong"}`} />
            <span className={`text-sm ${active ? "text-signal" : ""}`}>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

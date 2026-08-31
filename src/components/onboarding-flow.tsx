"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Thumb } from "@/components/cards";
import { OptionPill } from "@/components/ui";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { LANGUAGES } from "@/lib/languages";
import { PLATFORMS } from "@/lib/platforms";
import { REGIONS } from "@/lib/regions";

const GOALS = [
  ["WATCH", "Watch streams"],
  ["TEAMMATES", "Find teammates"],
  ["STREAM", "Stream myself"],
  ["TOURNAMENTS", "Join tournaments"],
  ["COMMUNITY", "Build a community"],
];

const STEPS = ["Games", "Setup", "Goals"];

export function OnboardingFlow({
  name,
  games,
}: {
  name: string;
  games: { slug: string; name: string; genre: string }[];
}) {
  const [state, action, pending] = useActionState(completeOnboarding, undefined);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [region, setRegion] = useState(REGIONS[0]);
  const [languages, setLanguages] = useState<string[]>([LANGUAGES[0]]);
  const [platforms, setPlatforms] = useState<string[]>([PLATFORMS[0]]);
  const [goals, setGoals] = useState<string[]>([]);

  const toggle = (list: string[], setList: (value: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-2">
          {STEPS.map((label, index) => (
            <span key={label} className="flex items-center gap-2">
              <span
                className={`h-1 w-10 ${index <= step ? "bg-signal" : "bg-line"}`}
                aria-hidden
              />
              <span className={`eyebrow ${index === step ? "text-text" : ""}`}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      <form action={action} className="flex-1">
        {/* Every step's inputs stay mounted so one submit carries the whole form. */}
        <div className={step === 0 ? "" : "hidden"}>
          <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">
            {name.split(" ")[0]}, what do you play?
          </h1>
          <p className="mb-5 text-sm text-muted">
            Pick your games. This decides what shows up first and who we suggest you queue with.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {games.map((game) => {
              const active = picked.includes(game.slug);
              return (
                <label
                  key={game.slug}
                  className={`tick block cursor-pointer ${active ? "tick-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="games"
                    value={game.slug}
                    checked={active}
                    onChange={() => toggle(picked, setPicked, game.slug)}
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
        </div>

        <div className={step === 1 ? "" : "hidden"}>
          <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Your setup</h1>
          <p className="mb-5 text-sm text-muted">
            Region and language decide who you can actually play with, not just who we show you.
          </p>
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
        </div>

        <div className={step === 2 ? "" : "hidden"}>
          <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">What are you here for?</h1>
          <p className="mb-5 text-sm text-muted">
            Pick as many as apply. You can change all of this later in settings.
          </p>
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
                    onChange={() => toggle(goals, setGoals, value)}
                    className="sr-only"
                  />
                  <span className={`h-2 w-2 shrink-0 ${active ? "bg-signal" : "bg-line-strong"}`} />
                  <span className={`text-sm ${active ? "text-signal" : ""}`}>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {state?.error && (
          <p role="alert" className="mt-5 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
            {state.error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((value) => value + 1)}
              disabled={step === 0 && picked.length === 0}
            >
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" disabled={pending || goals.length === 0}>
              {pending ? "Setting up…" : "Enter Holdpoint"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

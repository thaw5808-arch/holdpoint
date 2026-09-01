"use client";

import { useActionState, useState } from "react";
import { Wordmark } from "@/components/brand";
import { GamePicker, GoalsField, RegionLanguagePlatformFields } from "@/components/player-setup-fields";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { LANGUAGES } from "@/lib/languages";
import { PLATFORMS } from "@/lib/platforms";
import { REGIONS } from "@/lib/regions";

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
          <GamePicker games={games} picked={picked} onToggle={(slug) => toggle(picked, setPicked, slug)} />
        </div>

        <div className={step === 1 ? "" : "hidden"}>
          <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Your setup</h1>
          <p className="mb-5 text-sm text-muted">
            Region and language decide who you can actually play with, not just who we show you.
          </p>
          <RegionLanguagePlatformFields
            region={region}
            setRegion={setRegion}
            languages={languages}
            setLanguages={setLanguages}
            platforms={platforms}
            setPlatforms={setPlatforms}
          />
        </div>

        <div className={step === 2 ? "" : "hidden"}>
          <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">What are you here for?</h1>
          <p className="mb-5 text-sm text-muted">
            Pick as many as apply. You can change all of this later in settings.
          </p>
          <GoalsField goals={goals} onToggle={(value) => toggle(goals, setGoals, value)} />
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

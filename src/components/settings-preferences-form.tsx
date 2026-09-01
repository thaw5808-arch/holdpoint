"use client";

import { useActionState, useState } from "react";
import { GoalsField, RegionLanguagePlatformFields } from "@/components/player-setup-fields";
import { updatePreferencesAction } from "@/lib/actions/settings";
import { LANGUAGES } from "@/lib/languages";
import { PLATFORMS } from "@/lib/platforms";
import { REGIONS } from "@/lib/regions";

export function SettingsPreferencesForm({
  initialRegion,
  initialLanguages,
  initialPlatforms,
  initialGoals,
}: {
  initialRegion?: string;
  initialLanguages?: string[];
  initialPlatforms?: string[];
  initialGoals?: string[];
}) {
  const [state, action, pending] = useActionState(updatePreferencesAction, undefined);
  const [region, setRegion] = useState(initialRegion ?? REGIONS[0]);
  const [languages, setLanguages] = useState<string[]>(initialLanguages?.length ? initialLanguages : [LANGUAGES[0]]);
  const [platforms, setPlatforms] = useState<string[]>(initialPlatforms?.length ? initialPlatforms : [PLATFORMS[0]]);
  const [goals, setGoals] = useState<string[]>(initialGoals ?? []);

  const toggleGoal = (value: string) =>
    setGoals((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));

  return (
    <form action={action}>
      <RegionLanguagePlatformFields
        region={region}
        setRegion={setRegion}
        languages={languages}
        setLanguages={setLanguages}
        platforms={platforms}
        setPlatforms={setPlatforms}
      />

      <div className="mt-5 border-t border-line pt-5">
        <p className="eyebrow mb-2">Goals</p>
        <GoalsField goals={goals} onToggle={toggleGoal} />
      </div>

      {state && "error" in state && (
        <p role="alert" className="mt-5 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      )}
      {state && "saved" in state && (
        <p role="status" className="mt-5 border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-signal">
          Saved.
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-5" disabled={pending || goals.length === 0}>
        {pending ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}

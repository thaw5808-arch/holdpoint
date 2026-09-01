"use client";

import { useState, useTransition } from "react";
import { updateProfileBasicsAction } from "@/lib/actions/settings";

export function SettingsProfileForm({
  initialDisplayName,
  initialBio,
}: {
  initialDisplayName: string;
  initialBio: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfileBasicsAction(displayName, bio);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="displayName" className="eyebrow mb-1.5 block">
          Display name
        </label>
        <input
          id="displayName"
          type="text"
          required
          minLength={2}
          maxLength={32}
          className="input"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div>
        <label htmlFor="bio" className="eyebrow mb-1.5 block">
          Bio
        </label>
        <textarea
          id="bio"
          rows={3}
          maxLength={300}
          placeholder="Who you are, when you play, what you're looking for."
          className="input resize-none"
          value={bio}
          onChange={(event) => {
            setBio(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="border border-signal/50 bg-signal/10 px-3 py-2 text-sm text-signal">
          Saved.
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateStreamDetailsAction } from "@/lib/actions/stream";

/**
 * Studio's title/category/tags fields — previously plain
 * `<input defaultValue=…>`s with no `<form>`, no action, and nothing
 * wiring them to updateStreamDetailsAction, so anything typed there was
 * silently discarded on refresh. Category is a `<select>` of real games
 * rather than the old free-text input (see updateStreamDetailsAction's own
 * comment for why); title and tags stay plain text, same as before.
 */
export function StreamDetailsForm({
  initialTitle,
  initialGameSlug,
  initialTags,
  games,
}: {
  initialTitle: string;
  initialGameSlug: string;
  initialTags: string;
  games: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [gameSlug, setGameSlug] = useState(initialGameSlug);
  const [tags, setTags] = useState(initialTags);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStreamDetailsAction(title, gameSlug, tags);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="title" className="eyebrow mb-1.5 block">
          Stream title
        </label>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setSaved(false);
          }}
          maxLength={140}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="eyebrow mb-1.5 block">
            Category
          </label>
          <select
            id="category"
            className="input"
            value={gameSlug}
            onChange={(event) => {
              setGameSlug(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">No game</option>
            {games.map((game) => (
              <option key={game.slug} value={game.slug}>
                {game.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tags" className="eyebrow mb-1.5 block">
            Tags
          </label>
          <input
            id="tags"
            className="input"
            value={tags}
            onChange={(event) => {
              setTags(event.target.value);
              setSaved(false);
            }}
            placeholder="Ranked, English"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p role="alert" className="text-[0.75rem] text-live">
            {error}
          </p>
        ) : saved ? (
          <p role="status" className="text-[0.75rem] text-signal">
            Saved.
          </p>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

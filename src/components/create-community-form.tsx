"use client";

import { useActionState, useState } from "react";
import { createCommunityAction } from "@/lib/actions/community";
import { OptionPill } from "@/components/ui";

export function CreateCommunityForm({ games }: { games: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createCommunityAction, undefined);
  const [game, setGame] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  return (
    <form action={action} className="mx-auto max-w-xl px-4 py-8">
      <p className="eyebrow mb-2">Communities</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Create a community</h1>
      <p className="mb-6 text-sm text-muted">
        You will own this community. It starts with announcements, general and clips channels —
        add more once people show up.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="name" className="eyebrow mb-1.5 block">
            Community name
          </label>
          <input id="name" name="name" type="text" required maxLength={40} className="input" />
          {state?.fieldErrors?.name && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="tagline" className="eyebrow mb-1.5 block">
            Tagline
          </label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            required
            maxLength={80}
            placeholder="A one-line hook — shows on cards and the header."
            className="input"
          />
          {state?.fieldErrors?.tagline && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.tagline}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="eyebrow mb-2">Game (optional)</legend>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <input
                type="radio"
                name="game"
                value=""
                checked={game === ""}
                onChange={() => setGame("")}
                className="sr-only"
              />
              <OptionPill active={game === ""} label="General" />
            </label>
            {games.map((g) => (
              <label key={g.slug} className="cursor-pointer">
                <input
                  type="radio"
                  name="game"
                  value={g.slug}
                  checked={game === g.slug}
                  onChange={() => setGame(g.slug)}
                  className="sr-only"
                />
                <OptionPill active={game === g.slug} label={g.name} />
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
          <legend className="eyebrow mb-2">Visibility</legend>
          <div className="flex flex-wrap gap-2">
            {(["public", "private"] as const).map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value={option}
                  checked={visibility === option}
                  onChange={() => setVisibility(option)}
                  className="sr-only"
                />
                <OptionPill active={visibility === option} label={option === "public" ? "Public" : "Private"} />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[0.75rem] text-faint">
            {visibility === "public"
              ? "Listed on /communities for anyone to find and join."
              : "Not listed on /communities — people need a direct link."}
          </p>
          {state?.fieldErrors?.visibility && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-live">
              {state.fieldErrors.visibility}
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
            required
            placeholder="What this community is for, and who it's for."
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
          {pending ? "Creating…" : "Create community"}
        </button>
      </div>
    </form>
  );
}

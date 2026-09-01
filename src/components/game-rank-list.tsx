"use client";

import { useState, useTransition } from "react";
import { OptionPill, RankChip } from "@/components/ui";
import { updateGameRankAction } from "@/lib/actions/settings";

type RankRow = {
  gameSlug: string;
  gameName: string;
  tier: string;
  role: string | null;
  rankTiers: string[];
  roles: string[];
};

export function GameRankList({ ranks }: { ranks: RankRow[] }) {
  if (ranks.length === 0) {
    return <p className="border border-dashed border-line p-5 text-sm text-muted">Add a game above first.</p>;
  }
  return (
    <div className="divide-y divide-line border border-line">
      {ranks.map((rank) => (
        <GameRankRow key={rank.gameSlug} rank={rank} />
      ))}
    </div>
  );
}

function GameRankRow({ rank }: { rank: RankRow }) {
  const [tier, setTier] = useState(rank.tier);
  const [role, setRole] = useState<string | null>(rank.role);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = (nextTier: string, nextRole: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await updateGameRankAction(rank.gameSlug, nextTier, nextRole);
      if ("error" in result) setError(result.error);
    });
  };

  const tierIdx = rank.rankTiers.indexOf(tier);

  return (
    <div className="bg-surface px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="display min-w-32 flex-1 text-sm uppercase tracking-[0.04em]">{rank.gameName}</span>
        <RankChip tier={tier} tierIdx={Math.max(tierIdx, 0)} tierCount={rank.rankTiers.length} role={role} />
        {isPending && <span className="text-[0.6875rem] text-faint">Saving…</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rank.rankTiers.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setTier(option);
              save(option, role);
            }}
            disabled={isPending}
          >
            <OptionPill active={tier === option} label={option} />
          </button>
        ))}
      </div>

      {rank.roles.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {rank.roles.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                const next = role === option ? null : option;
                setRole(next);
                save(tier, next);
              }}
              disabled={isPending}
            >
              <OptionPill active={role === option} label={option} />
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-1.5 text-[0.75rem] text-live">{error}</p>}
    </div>
  );
}

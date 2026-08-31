import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { InvitePlayerButton } from "@/components/invite-player-button";
import { Pill, RankChip } from "@/components/ui";
import type { ManagedTeam } from "@/lib/queries";

// Kept out of cards.tsx deliberately: InvitePlayerButton is a client
// component, and a Server Component file that imports one pulls its JS
// into the client bundle of every page that imports anything else from
// that file too — StreamCard, ClipTile, TournamentRow's pages included.
// Isolating PlayerCard here means only pages that actually render a
// player card pay for the invite popover.
export interface PlayerCardData {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  presence: "ONLINE" | "IN_GAME" | "STREAMING" | "AWAY" | "OFFLINE";
  game: string;
  tier: string;
  tierIdx: number;
  tierCount: number;
  role: string | null;
  region: string;
  competitive: boolean;
  score?: number;
  reasons?: string[];
}

export function PlayerCard({ player, managedTeams }: { player: PlayerCardData; managedTeams: ManagedTeam[] }) {
  return (
    <article className="tick border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <Avatar
          name={player.displayName}
          seed={player.username}
          size={40}
          presence={player.presence}
          avatarUrl={player.avatarUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/u/${player.username}`} className="display truncate text-sm uppercase tracking-[0.04em] hover:text-signal">
              {player.displayName}
            </Link>
            {player.score !== undefined && (
              <span className="tabular shrink-0 text-sm text-signal">{player.score}%</span>
            )}
          </div>
          <p className="truncate text-[0.8125rem] text-muted">{player.game}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <RankChip tier={player.tier} tierIdx={player.tierIdx} tierCount={player.tierCount} role={player.role} />
        <Pill>{player.region}</Pill>
        <Pill tone={player.competitive ? "signal" : "quiet"}>
          {player.competitive ? "Competitive" : "Casual"}
        </Pill>
      </div>

      {player.reasons && player.reasons.length > 0 && (
        <p className="mt-2.5 border-t border-line pt-2 text-[0.75rem] leading-relaxed text-faint">
          {player.reasons.join(" · ")}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Link href={`/u/${player.username}`} className="btn flex-1">
          Profile
        </Link>
        <InvitePlayerButton username={player.username} teams={managedTeams} />
      </div>
    </article>
  );
}

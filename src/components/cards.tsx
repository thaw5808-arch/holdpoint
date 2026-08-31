import Link from "next/link";
import { Eye, Radio, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Emblem } from "@/components/emblem";
import { LiveTag, Pill } from "@/components/ui";
import { coverGradient, hash } from "@/lib/art";
import { compactNumber, duration, uptime } from "@/lib/format";

/** Generated stream thumbnail: no borrowed frames, still reads as a scene. */
export function Thumb({
  seed,
  className = "",
  label,
}: {
  seed: string;
  className?: string;
  label?: string;
}) {
  const h = hash(seed);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: coverGradient(seed) }}>
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at ${20 + (h % 60)}% ${25 + (h % 40)}%, rgba(255,255,255,0.22), transparent 55%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)",
        }}
      />
      {label && (
        <span className="display absolute bottom-2 left-2 text-[0.625rem] uppercase tracking-[0.2em] text-white/70">
          {label}
        </span>
      )}
    </div>
  );
}

export interface StreamCardData {
  slug: string;
  title: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  game: string | null;
  tags: string[];
  language: string;
  viewers: number;
  startedAt: Date | null;
  isLive: boolean;
}

export function StreamCard({ stream, size = "md" }: { stream: StreamCardData; size?: "md" | "lg" }) {
  return (
    <article className="tick group">
      <Link href={`/watch/${stream.slug}`} className="block">
        <div className="relative">
          <Thumb
            seed={stream.slug}
            label={stream.game ?? undefined}
            className={size === "lg" ? "aspect-[21/9]" : "aspect-video"}
          />
          <div className="absolute left-2 top-2 flex items-center gap-1.5">
            {stream.isLive ? <LiveTag /> : <Pill tone="quiet">Rerun</Pill>}
            {stream.isLive && stream.startedAt && (
              <span className="tabular glass px-1.5 py-0.5 text-[0.6875rem] text-muted">
                {uptime(stream.startedAt)}
              </span>
            )}
          </div>
          <div className="glass absolute bottom-2 right-2 flex items-center gap-1.5 px-1.5 py-0.5">
            <Eye size={12} className="text-muted" />
            <span className="tabular text-[0.6875rem]">{compactNumber(stream.viewers)}</span>
          </div>
        </div>
      </Link>
      <div className="mt-2.5 flex gap-2.5">
        <Link href={`/u/${stream.username}`} aria-label={stream.displayName}>
          <Avatar
            name={stream.displayName}
            seed={stream.username}
            size={34}
            live={stream.isLive}
            avatarUrl={stream.avatarUrl}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/watch/${stream.slug}`}>
            <h3
              className={`truncate text-[0.9rem] text-text group-hover:text-signal ${
                size === "lg" ? "display text-base uppercase tracking-[0.03em]" : ""
              }`}
            >
              {stream.title}
            </h3>
          </Link>
          <Link href={`/u/${stream.username}`} className="block truncate text-[0.8125rem] text-muted hover:text-signal">
            {stream.displayName}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {stream.game && <Pill tone="signal">{stream.game}</Pill>}
            {stream.tags.slice(0, size === "lg" ? 4 : 2).map((tag) => (
              <Pill key={tag}>{tag}</Pill>
            ))}
            <Pill tone="quiet">{stream.language.toUpperCase()}</Pill>
          </div>
        </div>
      </div>
    </article>
  );
}

export interface ClipTileData {
  slug: string;
  title: string;
  displayName: string;
  username: string;
  game: string | null;
  views: number;
  durationSec: number;
  thumbnailUrl?: string | null;
}

export function ClipTile({
  clip,
  onDeleteClick,
}: {
  clip: ClipTileData;
  /** Shown only to the clip's own uploader (the profile-clips grid is the
   * only caller that ever passes this) — a corner delete button, revealed
   * on hover/focus same as the stream player's control bar. A plain
   * sibling of the tile's Links rather than nested inside one, so there's
   * no nested-interactive-element problem to route around. */
  onDeleteClick?: () => void;
}) {
  return (
    // The creator byline is a separate link (to their profile) from the
    // rest of the tile (to the clip) — nesting an <a> inside an <a> is
    // invalid HTML and unreliable to click, so this can't be one big Link
    // the way it used to be.
    <article className="tick group relative w-[168px] shrink-0">
      {onDeleteClick && (
        <button
          type="button"
          onClick={onDeleteClick}
          aria-label="Delete clip"
          className="glass absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      )}
      <Link href={`/clips/${clip.slug}`} className="block">
        <div className="relative">
          {clip.thumbnailUrl ? (
            // Same reasoning as Avatar: served through a redirecting app
            // route in front of a private bucket, and this codebase has
            // no next/image usage elsewhere.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.thumbnailUrl} alt="" className="aspect-[9/16] w-full bg-ink object-cover" />
          ) : (
            // No poster — either a seeded clip with no real video, or a
            // real upload whose client-side frame capture didn't land.
            // Either way this reads as a clip instead of a broken image.
            <Thumb seed={clip.slug} className="aspect-[9/16]" />
          )}
          <span className="tabular glass absolute bottom-1.5 right-1.5 px-1 py-0.5 text-[0.625rem]">
            {duration(clip.durationSec)}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-snug group-hover:text-signal">
          {clip.title}
        </p>
      </Link>
      <p className="tabular mt-0.5 text-[0.6875rem] text-faint">
        <Link href={`/u/${clip.username}`} className="hover:text-signal">
          {clip.displayName}
        </Link>{" "}
        · {compactNumber(clip.views)} views
      </p>
    </article>
  );
}

export interface TournamentRowData {
  slug: string;
  name: string;
  game: string;
  format: string;
  region: string;
  teams: number;
  maxTeams: number;
  startsAt: Date;
  prizePool: number;
  status: string;
}

export function TournamentRow({ tournament }: { tournament: TournamentRowData }) {
  const filled = Math.round((tournament.teams / tournament.maxTeams) * 100);
  const live = tournament.status === "LIVE";
  return (
    <Link
      href={`/tournaments/${tournament.slug}`}
      className="tick group grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-line bg-surface p-3 sm:gap-4"
    >
      <Emblem seed={tournament.slug} tag={tournament.game.slice(0, 3)} size={40} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {live && <LiveTag />}
          <h3 className="display truncate text-sm uppercase tracking-[0.04em] group-hover:text-signal">
            {tournament.name}
          </h3>
        </div>
        <p className="tabular mt-0.5 truncate text-[0.75rem] text-faint">
          {tournament.game} · {tournament.format.replace(/_/g, " ").toLowerCase()} · {tournament.region}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1 w-24 bg-line">
            <span className="block h-full bg-signal" style={{ width: `${filled}%` }} />
          </span>
          <span className="tabular text-[0.6875rem] text-muted">
            {tournament.teams}/{tournament.maxTeams} teams
          </span>
        </div>
      </div>
      <div className="text-right">
        {tournament.prizePool > 0 && (
          <p className="tabular display text-sm text-gold">
            ${tournament.prizePool.toLocaleString()}
          </p>
        )}
        <p className="tabular text-[0.6875rem] text-faint">
          {tournament.startsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
      </div>
    </Link>
  );
}

export function ChannelStrip({
  channels,
}: {
  channels: {
    slug: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
    game: string | null;
    viewers: number;
  }[];
}) {
  return (
    <div className="scroll-x flex gap-3 pb-2">
      {channels.map((channel) => (
        <Link
          key={channel.slug}
          href={`/watch/${channel.slug}`}
          className="tick flex w-[190px] shrink-0 items-center gap-2.5 border border-line bg-surface px-2.5 py-2"
        >
          <Avatar
            name={channel.displayName}
            seed={channel.username}
            size={32}
            live
            avatarUrl={channel.avatarUrl}
          />
          <span className="min-w-0">
            <span className="block truncate text-[0.8125rem]">{channel.displayName}</span>
            <span className="tabular flex items-center gap-1 text-[0.6875rem] text-live">
              <Radio size={10} /> {compactNumber(channel.viewers)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

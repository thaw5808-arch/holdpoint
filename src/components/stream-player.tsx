"use client";

import { useState } from "react";
import {
  Gauge,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Scissors,
  Settings,
  Tv,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Thumb } from "@/components/cards";
import { LiveTag } from "@/components/ui";

const QUALITIES = ["Source", "1080p60", "720p60", "480p", "160p"];

/**
 * WatchView's video surface — deliberately still a shell: a generated
 * thumbnail plus a fully cosmetic controls bar (play/pause, volume,
 * quality, latency, theater, fullscreen all just flip local state, none
 * of it wired to an actual `<video>` element or an ingest pipeline). Kept
 * that way rather than ripped out, since the rest of the watch page
 * already assumes a player-shaped element sits here — but a genuinely
 * live stream now says as much in the middle of the frame (see the `live`
 * block below) instead of silently pretending the controls play something
 * real.
 */
export function StreamPlayer({
  seed,
  game,
  live,
  theater,
  onToggleTheater,
}: {
  seed: string;
  game: string | null;
  live: boolean;
  theater: boolean;
  onToggleTheater: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [quality, setQuality] = useState("Source");
  const [lowLatency, setLowLatency] = useState(true);
  const [menu, setMenu] = useState(false);

  return (
    <div className="group relative bg-ink">
      <Thumb seed={seed} label={game ?? undefined} className="aspect-video w-full" />

      {live && (
        <div className="absolute left-3 top-3">
          <LiveTag />
        </div>
      )}

      {/* This is a cosmetic shell — there's no ingest/playback pipeline
          behind it (see the module comment below), so a genuinely live
          stream has to say that plainly rather than let the play/pause
          controls imply real video is actually rolling. Not gated behind
          hover like the controls bar: this is the one honest thing about
          the player, so it stays visible the whole time. */}
      {live && (
        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-center">
          <span className="glass flex items-center gap-1.5 px-3 py-1.5 text-center text-[0.75rem] text-muted">
            <VideoOff size={13} className="shrink-0" />
            No live video yet — this is a preview player, not a real feed
          </span>
        </div>
      )}

      {/* Controls fade out until the player is hovered or focused. */}
      <div className="glass absolute inset-x-3 bottom-3 flex items-center gap-1.5 px-2 py-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          className="btn btn-ghost px-1.5"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="btn btn-ghost px-1.5"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={70}
          aria-label="Volume"
          className="h-1 w-20 accent-[var(--color-signal)]"
        />

        <span className="tabular ml-2 flex items-center gap-1.5 text-[0.6875rem] text-muted">
          <Gauge size={12} />
          {lowLatency ? "Low latency" : "Normal"}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost px-1.5" aria-label="Clip that">
            <Scissors size={15} />
          </button>
          <div className="relative">
            <button
              className="btn btn-ghost px-1.5"
              aria-label="Quality and latency"
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              <Settings size={15} />
            </button>
            {menu && (
              <div className="glass-strong absolute bottom-10 right-0 w-44 p-1">
                <p className="eyebrow px-3 py-1.5">Quality</p>
                {QUALITIES.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setQuality(option);
                      setMenu(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-surface ${
                      quality === option ? "text-signal" : "text-muted"
                    }`}
                  >
                    {option}
                    {quality === option && <span className="h-1.5 w-1.5 bg-signal" />}
                  </button>
                ))}
                <p className="eyebrow border-t border-line/60 px-3 py-1.5">Latency</p>
                <button
                  onClick={() => setLowLatency((value) => !value)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-muted hover:bg-surface"
                >
                  Low latency
                  <span className={`h-1.5 w-1.5 ${lowLatency ? "bg-signal" : "bg-line-strong"}`} />
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-ghost px-1.5" aria-label="Picture in picture">
            <PictureInPicture2 size={15} />
          </button>
          <button
            className="btn btn-ghost px-1.5"
            onClick={onToggleTheater}
            aria-label="Theater mode"
            aria-pressed={theater}
          >
            <Tv size={15} />
          </button>
          <button className="btn btn-ghost px-1.5" aria-label="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

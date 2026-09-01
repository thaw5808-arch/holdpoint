"use client";

import { Volume2, VolumeX } from "lucide-react";
import { setClipMuted, useClipMuted } from "@/lib/clip-mute-store";

/**
 * Visible mute/unmute toggle shared by every place a clip's own audio
 * plays — the feed and single-clip page (both via ClipStage) and the
 * CLIPS-channel lightbox (ClipViewerModal). Toggling it flips the shared,
 * session-persisted preference (see useClipMuted) rather than a local
 * flag, so unmuting once carries into the next clip — and every other
 * clip already on screen — the same way TikTok remembers "I turned sound
 * on" instead of resetting to muted every time.
 */
export function ClipMuteButton({ className = "" }: { className?: string }) {
  const isMuted = useClipMuted();
  return (
    <button
      type="button"
      onClick={(event) => {
        // Every caller places this over (or beside) a video that has its
        // own click handling — ClipStage's full-cover play/pause button,
        // ClipViewerModal's click-backdrop-to-close — so this always needs
        // to keep its own click from also triggering one of those.
        event.stopPropagation();
        setClipMuted(!isMuted);
      }}
      aria-label={isMuted ? "Unmute" : "Mute"}
      aria-pressed={!isMuted}
      className={`glass flex h-9 w-9 items-center justify-center ${className}`}
    >
      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}

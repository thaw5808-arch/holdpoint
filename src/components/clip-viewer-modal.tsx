"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { ClipMuteButton } from "@/components/clip-mute-button";
import { getClipDetailAction } from "@/lib/actions/clip";
import { setClipMuted, useClipMuted } from "@/lib/clip-mute-store";

/**
 * What a CLIPS-channel card opens instead of navigating to /clips/[slug]
 * (see PostClipCard in community-post-row.tsx): a plain lightbox — dark
 * overlay, the video played as large as the viewport allows at its own
 * aspect ratio, and a close button. Deliberately *not* ClipDetailView's
 * full layout (comments panel, action rail, caption) — that's the same
 * busy page just boxed, not what a click-to-preview should open. Think of
 * how clicking a video in Discord or a photo in a gallery works: the video
 * is the only thing on screen. A small "Open full page" link in the corner
 * covers anyone who does want comments/likes/etc, one click away at
 * /clips/[slug].
 *
 * Data isn't passed down from the channel's server-rendered post list:
 * that list can hold dozens of clip posts, and fetching every one's full
 * clip detail up front just in case someone opens it would be wasted work
 * for the (typical) case where they don't — this fetches only the one the
 * viewer actually clicked, the same lazy-on-open pattern ClipShareSheet
 * already uses for its own candidate list. Reuses getClipDetailAction
 * (built for ClipDetailView) rather than a narrower endpoint of its own —
 * it already returns everything this needs (playbackUrl, posterUrl, slug,
 * title) plus a bit it doesn't (likes/comments), which isn't worth a
 * second server action just to trim.
 *
 * Autoplay and one-at-a-time playback fall out of this for free: the
 * <video> below autoplays (muted, unless the viewer has already unmuted a
 * clip this session — see clip-mute-store.ts) as soon as it mounts, and
 * since this modal
 * is the only place a clip ever plays from a channel, and only one can
 * ever be mounted at a time (opening one visually blocks the rest of the
 * page, and each post row owns its own independent open/closed state — see
 * CommunityPostRow), there's never a second video to be "the other one"
 * playing. Playback stops on close for the same reason: closing unmounts
 * this component, which tears down the <video> element along with it.
 */
export function ClipViewerModal({ clipId, onClose }: { clipId: string; onClose: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getClipDetailAction>> | null>(null);
  // Same shared, session-persisted flag ClipStage's feed/detail-page videos
  // use (see clip-mute-store.ts) — unmuting a clip here carries into
  // whatever plays next, in the feed or another lightbox, instead of this
  // modal keeping its own separate on/off switch.
  const isMuted = useClipMuted();

  useEffect(() => {
    let cancelled = false;
    getClipDetailAction(clipId).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [clipId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clip = result && "clip" in result ? result.clip : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={clip?.title ?? "Clip"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      {/* Corner controls sit against the viewport, not the video — a
          landscape clip's box can end far short of the screen edge, and
          pinning these to the video itself would leave them stranded
          somewhere in the middle instead of in a predictable corner. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-3 z-10 flex h-9 w-9 items-center justify-center text-white/70 hover:text-white"
      >
        <X size={20} />
      </button>

      {clip && (
        <Link
          href={`/clips/${clip.slug}`}
          onClick={(event) => event.stopPropagation()}
          className="fixed left-3 top-3 z-10 flex items-center gap-1 text-[0.75rem] text-white/60 hover:text-white"
        >
          <ArrowUpRight size={13} /> Open full page
        </Link>
      )}

      {clip?.playbackUrl && <ClipMuteButton className="fixed bottom-3 right-3 z-10" />}

      {clip?.playbackUrl ? (
        <video
          key={clip.id}
          src={clip.playbackUrl}
          poster={clip.posterUrl ?? undefined}
          autoPlay
          muted={isMuted}
          controls
          playsInline
          aria-label={clip.title}
          onClick={(event) => event.stopPropagation()}
          // Native controls (kept for their seek bar) include their own
          // mute/volume button — this keeps that path in sync with the
          // shared flag too, same as ClipStage's onVolumeChange.
          onVolumeChange={(event) => setClipMuted(event.currentTarget.muted)}
          // width/height "auto" plus both max- constraints is the same
          // replaced-element trick ClipStage uses to grow a video to fill
          // whatever room it has without distorting it: the browser picks
          // the largest size fitting inside both bounds while keeping the
          // real aspect ratio, so a landscape clip goes wide and a
          // portrait one goes tall, each as large as the viewport allows.
          style={{ maxHeight: "90vh", maxWidth: "90vw", width: "auto", height: "auto" }}
          className="bg-black"
        />
      ) : (
        <p className="text-sm text-white/70">
          {!result ? "Loading clip…" : "error" in result ? result.error : "This clip has no video."}
        </p>
      )}
    </div>
  );
}

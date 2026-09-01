"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Flag, Heart, MessageCircle, Pause, Play, Share2, Trash2, UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Thumb } from "@/components/cards";
import { ClipMuteButton } from "@/components/clip-mute-button";
import { Pill } from "@/components/ui";
import { recordClipViewAction } from "@/lib/actions/clip";
import { setClipMuted, useClipMuted } from "@/lib/clip-mute-store";
import { compactNumber } from "@/lib/format";

// How long a clip has to play, continuously, before it counts as a view —
// long enough that a fast scroll through the feed (isPlaying flips true
// then false again well under this) never fires the request at all; the
// timer resets on every pause, so a clip has to actually hold this long in
// one uninterrupted stretch, not accumulate it in bits.
const VIEW_THRESHOLD_MS = 2000;

export interface ClipStageClip {
  id: string;
  slug: string;
  title: string;
  caption: string | null;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  game: string | null;
  views: number;
  playbackUrl?: string | null;
  posterUrl?: string | null;
}

export interface ClipStageReaction {
  liked: boolean;
  likes: number;
  saved: boolean;
  saves: number;
}

const DEFAULT_ASPECT_RATIO = 9 / 16;
// Kept as named numbers (rather than only Tailwind classes) because the
// video box's width is computed from them directly — see the `calc()`
// below. RAIL_WIDTH_PX must stay in sync with the rail's own `w-12`
// class; VIDEO_RAIL_GAP_PX is just the horizontal gap between the video
// and the rail column (unrelated to the rail's internal `gap-3`, which
// spaces its icons vertically).
const RAIL_WIDTH_PX = 48; // w-12
const VIDEO_RAIL_GAP_PX = 12;

// Same "named number kept in sync with a Tailwind class" reasoning as
// RAIL_WIDTH_PX above, for the rail's *vertical* sizing this time. Each
// stacked rail button is a fixed height regardless of which icon or label
// it holds: a 40px glass icon chip (h-10) + 2px gap (gap-0.5) + one line
// of tabular count text (~15px) — confirmed against a rendered button's
// own getBoundingClientRect(), which comes out to exactly this. Buttons
// are spaced by the rail's own `gap-3`.
const RAIL_ITEM_HEIGHT_PX = 57;
const RAIL_ITEM_GAP_PX = 12; // gap-3

// How tall a clip is allowed to get: the viewport's height minus the app
// chrome around it. Declared as a custom property (rather than used
// directly) so both branches below can reference the same `var(--clip-h)`
// while still getting the right value per breakpoint — the mobile nav bar
// only reserves space on mobile, hence the `lg:` override. This has to
// stay in sync with the feed's own per-clip <section>, which reserves the
// exact same amount (a `h-full` slice of the same `100dvh` formula, minus
// this element's own 24px of padding) for that clip — see clip-feed.tsx.
// Without this, a clip's frame can render taller than its snap section,
// overflowing into the next one.
const HEIGHT_BUDGET_VARS =
  "[--clip-h:calc(100dvh_-_var(--header-h)_-_var(--mobile-nav-clearance)_-_24px)] lg:[--clip-h:calc(100dvh_-_var(--header-h)_-_24px)]";

// What to size against before the ResizeObserver below has reported the
// real number — one frame of "guess" at mount, same idea as
// DEFAULT_ASPECT_RATIO. Only matters when maxWidthPx isn't given (the
// measured-width path); when it is, that's the fallback instead (see
// availableWidthPx).
const DEFAULT_MEASURED_WIDTH_PX = 900;

// How long the "you just paused this" icon stays up before fading back to
// the plain play-to-resume affordance.
const PAUSE_FLASH_MS = 700;

/**
 * A real clip's video (or, for seeded clips with no real video, the
 * generated-art fallback), creator row, caption, game/views, and the
 * like/comment/save/share action rail. Shared by the scrolling feed (one
 * per clip, with `isActive` telling it whether the scroll position has
 * put it in view) and the single-clip page (one instance, always active
 * — there's nothing else to switch to).
 *
 * A real video keeps its own aspect ratio and drives the frame's height
 * directly — there's no fixed 9:16 box to fill, so a landscape clip's
 * frame is exactly as tall as the video and nothing more, the way a
 * short-video feed handles landscape gameplay footage. Creator/caption
 * overlay right on the video with a gradient scrim, and the action rail
 * sits outside the video as its own column rather than floating on top
 * of it. The generated-art fallback has no meaningful aspect ratio of its
 * own, so it keeps the older fixed 9:16, full-bleed treatment with the
 * caption glass-panel and rail both floating over it.
 */
export function ClipStage({
  clip,
  maxWidthPx,
  isActive = true,
  reaction,
  commentCount,
  onToggleLike,
  onToggleSave,
  onShare,
  onCommentsClick,
  commentsActive = false,
  shareActive = false,
  onActivate,
  isOwnClip = false,
  onDelete,
  deleteActive = false,
  onReport,
  reportActive = false,
}: {
  clip: ClipStageClip;
  /** An explicit ceiling on how wide a clip is allowed to grow, in px —
   * for callers with a genuinely fixed column to share, like the detail
   * page's comments sidebar. Omit it to let the clip grow to fill
   * whatever width its own container actually renders at (measured live,
   * so it tracks window resizes) — that's what the feed wants, so a
   * maximized window doesn't leave the extra width as empty background.
   * When both a ceiling and a measured width apply, the smaller one wins,
   * so an explicit cap also correctly gives way on a narrower viewport
   * than the cap itself. Used by both branches: a real video grows into
   * it along with the viewport-height budget; the generated-art fallback
   * (always 9:16) uses it to bound its width directly, since its ratio is
   * fixed. */
  maxWidthPx?: number;
  /** Whether the caller's scroll position (or, on the single-clip page,
   * just always) currently has this clip in view. Tapping the video
   * toggles a separate, purely-internal pause on top of this — scrolling
   * away and back always forgets it and autoplays fresh, the same way
   * every other short-video feed behaves, rather than leaving a clip you
   * paused three scrolls ago stuck paused when you return to it. */
  isActive?: boolean;
  reaction: ClipStageReaction;
  commentCount: number;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onShare: () => void;
  onCommentsClick?: () => void;
  commentsActive?: boolean;
  shareActive?: boolean;
  /** Only used by the generated-art fallback below, whose tap target
   * selects this clip as the feed's active one rather than toggling a
   * local pause (there's no video to pause). Omitted by callers with
   * nothing else to switch to, like the single-clip page. */
  onActivate?: () => void;
  /** True when the signed-in viewer is this clip's own creator — hides
   * the "Follow creator" button below the same way a profile hides its
   * own follow button, since following yourself isn't a real action. */
  isOwnClip?: boolean;
  /** Opens the delete-confirm dialog. Only ever passed by a caller when
   * isOwnClip is true — the rail's delete icon is omitted entirely
   * otherwise, and deleteClipAction re-checks ownership regardless. */
  onDelete?: () => void;
  /** Whether the delete-confirm dialog this clip's onDelete opens is
   * currently up — same "active" treatment as shareActive, so the rail
   * icon reads as pressed while its dialog is open. */
  deleteActive?: boolean;
  /** Opens the report dialog. Only ever passed by a caller when
   * !isOwnClip — the rail's report icon is omitted for a clip's own
   * uploader (nothing to report about your own upload; that's what
   * onDelete is for), and reportContentAction blocks a self-report
   * regardless. */
  onReport?: () => void;
  /** Same "active while its own dialog is up" treatment as deleteActive. */
  reportActive?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Shared across every mounted clip and remembered for the session — see
  // clip-mute-store.ts. Autoplay only works muted at all, so this starts
  // true; ClipMuteButton below is the only thing that flips it.
  const isMuted = useClipMuted();
  // Read off the video's own intrinsic size once metadata loads, so the
  // frame can size the video box to its real aspect ratio instead of
  // guessing. Defaults to a portrait guess until then, which is the
  // common case and keeps the initial layout close to its final one.
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  // How wide containerRef's box actually renders — a plain w-full block,
  // so this tracks the real available width (sidebar, comments column,
  // whatever else is competing for space, all already accounted for by
  // ordinary layout) without needing to approximate it via viewport units.
  // Only used when the caller didn't pass an explicit maxWidthPx; kept
  // live via ResizeObserver so dragging the window wider/narrower (or
  // toggling the sidebar) reflows the clip instead of leaving it at
  // whatever size it first rendered at.
  const [measuredWidthPx, setMeasuredWidthPx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setMeasuredWidthPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // An explicit cap always wins if it's the tighter constraint (the
  // detail page's fixed comments-sidebar column shouldn't grow past its
  // own width just because the window is wide) — but it also has to give
  // way on a narrower viewport than the cap itself, which is exactly what
  // taking the smaller of the two does.
  const availableWidthPx = measuredWidthPx ?? maxWidthPx ?? DEFAULT_MEASURED_WIDTH_PX;
  const effectiveMaxWidthPx = maxWidthPx === undefined ? availableWidthPx : Math.min(maxWidthPx, availableWidthPx);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // A tap on the video pauses/resumes it — purely local, independent of
  // why isActive is what it is. Forgotten whenever this clip transitions
  // from not-active to active again (see the effect below), so scrolling
  // away and back always autoplays fresh rather than staying stuck on a
  // pause from a previous visit.
  const [userPaused, setUserPaused] = useState(false);
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) setUserPaused(false);
    wasActiveRef.current = isActive;
  }, [isActive]);

  const isPlaying = isActive && !userPaused;

  // Seeded once from the initial prop and bumped locally on a confirmed
  // view — not re-derived from `clip` afterward, same "seed once, own it
  // client-side from there" approach the feed's reactions/comment-count
  // state already uses (see clip-feed.tsx), and for the same reason: nothing
  // here ever revalidates this clip's data mid-session, so there's nothing
  // to re-sync against.
  const [views, setViews] = useState(clip.views);

  // Fires once this clip has played VIEW_THRESHOLD_MS continuously.
  // recordClipViewAction is the actual "once per session" boundary (a
  // unique constraint keyed on the caller's session) — viewSentRef here is
  // just a client-side courtesy so an already-recorded clip that's still
  // sitting active doesn't keep re-arming this timer and re-sending the
  // (harmless but wasted) request every time playback is paused/resumed
  // past the threshold again.
  const viewSentRef = useRef(false);
  useEffect(() => {
    if (!isPlaying || viewSentRef.current) return;
    const timeout = setTimeout(() => {
      viewSentRef.current = true;
      // Fire-and-forget: playback never waits on this. A failure (network
      // blip, clip deleted mid-watch) just means the view isn't counted —
      // not worth surfacing to the viewer over.
      recordClipViewAction(clip.id)
        .then((result) => {
          if ("recorded" in result && result.recorded) setViews(result.views);
        })
        .catch(() => {});
    }, VIEW_THRESHOLD_MS);
    return () => clearTimeout(timeout);
  }, [isPlaying, clip.id]);

  // Briefly shown right when a tap pauses the video, so the state change
  // is actually visible instead of just a frame quietly freezing. Fades
  // back to the plain "tap to resume" play icon on its own; a second tap
  // to resume doesn't get one (there's nothing ambiguous about a video
  // that's visibly moving again).
  const [showPauseFlash, setShowPauseFlash] = useState(false);
  const pauseFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pauseFlashTimeoutRef.current) clearTimeout(pauseFlashTimeoutRef.current);
    };
  }, []);

  const handleToggleClick = () => {
    if (isPlaying) {
      setShowPauseFlash(true);
      if (pauseFlashTimeoutRef.current) clearTimeout(pauseFlashTimeoutRef.current);
      pauseFlashTimeoutRef.current = setTimeout(() => setShowPauseFlash(false), PAUSE_FLASH_MS);
    }
    setUserPaused((paused) => !paused);
  };

  // Only the active, not-manually-paused clip actually plays — the same
  // rule every short-video feed follows, so switching clips doesn't leave
  // several playing (and making noise, if this weren't muted) at once.
  // Reduced-motion viewers get native controls and nothing that starts
  // moving on its own; this effect just never calls play() for them.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
    if (isPlaying) {
      video.play().catch(() => {
        // Autoplay can be rejected (e.g. a backgrounded tab) — the
        // play/pause affordance below still lets the viewer start it.
      });
    } else {
      video.pause();
    }
  }, [isPlaying, reducedMotion, clip.playbackUrl]);

  // onLoadedMetadata (below, on the <video>) can miss the real event: React
  // attaches that listener directly to the DOM node during hydration,
  // since loadedmetadata doesn't bubble and can't use React's usual
  // root-delegated listener — but the server-rendered <video
  // preload="metadata"> starts loading as soon as the browser parses the
  // HTML, well before hydration runs any JS. Confirmed live: on a page
  // with enough to hydrate first (the feed, with a couple dozen clips), a
  // small/fast-loading video's metadata reliably finishes and fires
  // before React's listener is even attached, so the one-shot event is
  // gone by the time anything is listening. This effect covers that by
  // checking the video's own readyState directly once mounted — if
  // metadata already arrived, the value is sitting right there on the
  // element regardless of whether the event was missed.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState >= 1 && video.videoWidth && video.videoHeight) {
      setAspectRatio(video.videoWidth / video.videoHeight);
    }
  }, [clip.playbackUrl]);

  const metaContent = (
    <>
      <div className="flex items-center gap-2">
        <Link href={`/u/${clip.username}`} aria-label={clip.displayName} className="pointer-events-auto">
          <Avatar name={clip.displayName} seed={clip.username} size={30} avatarUrl={clip.avatarUrl} />
        </Link>
        <Link href={`/u/${clip.username}`} className="pointer-events-auto text-sm hover:text-signal">
          {clip.displayName}
        </Link>
        {!isOwnClip && (
          <button className="btn btn-ghost pointer-events-auto ml-auto px-1.5" aria-label="Follow creator">
            <UserPlus size={15} />
          </button>
        )}
      </div>
      <p className="mt-2 text-[0.8125rem] leading-snug">{clip.caption ?? clip.title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {clip.game && <Pill tone="signal">{clip.game}</Pill>}
        <span className="tabular text-[0.6875rem] text-faint">{compactNumber(views)} views</span>
      </div>
    </>
  );

  const railContent = [
    {
      icon: Heart,
      label: "Like",
      count: reaction.likes,
      active: reaction.liked,
      onClick: onToggleLike,
    },
    {
      icon: MessageCircle,
      label: "Comments",
      count: commentCount,
      active: commentsActive,
      onClick: onCommentsClick,
    },
    {
      icon: Bookmark,
      label: "Save",
      count: reaction.saves,
      active: reaction.saved,
      onClick: onToggleSave,
    },
    {
      icon: Share2,
      label: "Share",
      count: undefined,
      active: shareActive,
      onClick: onShare,
    },
    {
      icon: Trash2,
      label: "Delete",
      count: undefined,
      active: deleteActive,
      // Only the clip's own uploader ever gets an onDelete to pass —
      // undefined here (same as onCommentsClick can be) just means the
      // .map below skips rendering this slot entirely for everyone else.
      onClick: isOwnClip ? onDelete : undefined,
    },
    {
      icon: Flag,
      label: "Report",
      count: undefined,
      active: reportActive,
      // Mirror image of Delete's gate: report is for everyone *except*
      // the clip's own uploader.
      onClick: !isOwnClip ? onReport : undefined,
    },
  ].map(({ icon: Icon, label, count, active, onClick }) =>
    onClick ? (
      <button key={label} onClick={onClick} className="flex flex-col items-center gap-0.5" aria-label={label}>
        <span className="glass flex h-10 w-10 items-center justify-center">
          <Icon size={17} className={active ? "text-signal" : "text-text"} fill={active ? "currentColor" : "none"} />
        </span>
        {count !== undefined && <span className="tabular text-[0.625rem] text-muted">{compactNumber(count)}</span>}
      </button>
    ) : null,
  );

  // How tall the rail's own stack of buttons actually needs to be — not
  // every clip shows all six slots (Delete/Report are mutually exclusive,
  // onCommentsClick/onShare can be omitted by a caller), so this counts
  // what actually rendered above rather than assuming a fixed six.
  const visibleRailCount = railContent.filter(Boolean).length;
  const railMinHeightPx =
    visibleRailCount * RAIL_ITEM_HEIGHT_PX + Math.max(0, visibleRailCount - 1) * RAIL_ITEM_GAP_PX;

  if (clip.playbackUrl) {
    return (
      // containerRef is a plain w-full block purely so its rendered width
      // is something meaningful to measure (see the ResizeObserver
      // above) — ordinary block layout already accounts for the sidebar,
      // a comments column, whatever else is competing for space, so this
      // reflects the real available width without approximating it.
      //
      // The frame inside is shrink-wrapped to the video's own size rather
      // than stretched to fill that width — a landscape clip should grow
      // into whatever headroom it's given, not sit fixed-width with a
      // short video and dead space below it. That growth happens on the
      // <video> tag itself: as a replaced element, `width:auto;
      // height:auto` plus `aspect-ratio` and both `max-width` and
      // `max-height` together resolve to the largest size fitting inside
      // both while preserving the real ratio — "grow until either the
      // available width or the viewport height binds", with no
      // distortion. A plain div doesn't get that dual-constraint
      // resolution, which is why the sizing lives on the video itself and
      // everything around it just wraps to match.
      //
      // The rail stays out of flow (absolute, `h-full`) for the same
      // reason as before: a flex row's auto height is always at least as
      // tall as its tallest child, and the rail's own four-icons-with-
      // labels content is routinely taller than a landscape video —
      // confirmed live last time this was tried as a flex row. Padding
      // reserves its column so it lands immediately beside the video,
      // however wide that turns out to be.
      <div ref={containerRef} className="w-full">
        <div className={`relative mx-auto w-fit ${HEIGHT_BUDGET_VARS}`} style={{ paddingRight: RAIL_WIDTH_PX + VIDEO_RAIL_GAP_PX }}>
          <div className="relative inline-block overflow-hidden bg-ink align-top">
            <video
              ref={videoRef}
              src={clip.playbackUrl}
              className="block object-cover"
              style={{
                aspectRatio,
                width: "auto",
                height: "auto",
                // effectiveMaxWidthPx is the budget for the video *and*
                // the rail beside it — reserve the rail's column here so
                // the video itself never grows wide enough to push the
                // frame (video + reserved padding) past what's actually
                // available. Miss this and the frame overflows by exactly
                // the rail's width — harmless on the feed, where there's
                // empty space to spill into, but on the detail page
                // that's the comments column right next door.
                maxWidth: `${effectiveMaxWidthPx - RAIL_WIDTH_PX - VIDEO_RAIL_GAP_PX}px`,
                maxHeight: "var(--clip-h)",
              }}
              muted={isMuted}
              loop={!reducedMotion}
              playsInline
              preload="metadata"
              controls={reducedMotion}
              // Reduced-motion (or any other) use of the native controls'
              // own mute/volume UI still lands here, so it stays in sync
              // with the shared flag instead of drifting from what
              // ClipMuteButton shows and what the next clip inherits.
              onVolumeChange={(event) => setClipMuted(event.currentTarget.muted)}
              // Undefined (not null — React renders a literal "null"
              // attribute otherwise) when there's no poster, e.g. an
              // upload whose client-side frame capture failed; the video
              // itself always exists here regardless; a missing poster
              // just means no image shows before it starts playing.
              poster={clip.posterUrl ?? undefined}
              aria-label={clip.title}
              // Covers the normal case: metadata still loading when this
              // attaches. The mount effect above covers the case where it
              // already finished before React got here.
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (video.videoWidth && video.videoHeight) {
                  setAspectRatio(video.videoWidth / video.videoHeight);
                }
              }}
            />

            <ClipMuteButton className="absolute right-2 top-2 z-10" />

            {/* Skipped for a reduced-motion video: it renders native
                controls, and a full-cover invisible button on top would
                swallow clicks meant for the scrubber/play button. */}
            {!reducedMotion && (
              <button
                className="absolute inset-0 flex items-center justify-center"
                aria-label={isPlaying ? "Pause clip" : "Play clip"}
                onClick={handleToggleClick}
              >
                {!isPlaying && (
                  <span className="glass flex h-14 w-14 items-center justify-center">
                    {showPauseFlash ? (
                      <Pause size={20} className="text-signal" />
                    ) : (
                      <Play size={20} className="text-signal" />
                    )}
                  </span>
                )}
              </button>
            )}

            {/* Gradient scrim so the creator/caption text reads over
                whatever's in the video, without a glass panel sitting
                between the viewer and the footage. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
            />
            {/* pointer-events-none so this doesn't sit in front of the
                tap-target button below it (the caption's bounding box
                covers a big chunk of the video's lower half) — the
                avatar/name links and follow button opt back in
                individually above. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">{metaContent}</div>
          </div>

          {/* The action rail lives outside the video now, not floating on
              top of it — absolutely positioned against this element, so
              it normally matches the video's height exactly regardless of
              the rail's own content height. "Normally": pinned at
              `top-0`, so growing past 100% only extends the box *downward*
              past the video's bottom edge, into empty space — which is
              why railMinHeightPx (a floor, not the usual height) is safe
              here. Without it, a short/landscape video gives the rail too
              little room for every icon; `justify-end` packs them against
              the bottom regardless, so the shortfall pushed the topmost
              button (Like) upward past the video, off the top of this
              positioned box entirely and behind the page header — visible
              proof: its count rendered, its icon didn't, because the
              header's opaque background painted over just the icon half
              of that button. */}
          <div
            className="absolute right-0 top-0 flex w-12 flex-col items-center justify-end gap-3 pb-1"
            style={{ height: `max(100%, ${railMinHeightPx}px)` }}
          >
            {railContent}
          </div>
        </div>
      </div>
    );
  }

  // Seeded/demo clips have no real video, so there's no meaningful aspect
  // ratio to size a box to — the generated art keeps the older fixed
  // 9:16, full-bleed treatment, with the caption glass-panel and rail
  // both floating over it same as before. Unlike the video branch, the
  // ratio here is fixed and known ahead of time, so there's no need for
  // the replaced-element dual-constraint trick — the same "whichever
  // binds first" result comes from just computing the width directly:
  // capped at effectiveMaxWidthPx, or at whatever width a 9:16 box would
  // need to reach the height budget, whichever is smaller.
  return (
    <div ref={containerRef} className="w-full">
      <div
        className={`relative mx-auto aspect-[9/16] overflow-hidden bg-ink ${HEIGHT_BUDGET_VARS}`}
        style={{ width: `min(${effectiveMaxWidthPx}px, calc(var(--clip-h) * 9 / 16))` }}
      >
        <Thumb seed={clip.slug} className="absolute inset-0 h-full w-full" />

        {onActivate && (
          <button
            className="absolute inset-0 flex items-center justify-center"
            aria-label={isActive ? "Pause clip" : "Play clip"}
            onClick={onActivate}
          >
            {!isActive && (
              <span className="glass flex h-14 w-14 items-center justify-center">
                <Play size={20} className="text-signal" />
              </span>
            )}
          </button>
        )}

        {/* Same pointer-events-none as the video branch's caption overlay
            — otherwise this panel (which sits in front of the play/pause
            button below) swallows the tap. */}
        <div className="glass pointer-events-none absolute bottom-3 left-3 right-16 p-3">{metaContent}</div>

        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-3">{railContent}</div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ClipCommentsPanel } from "@/components/clip-comments-panel";
import { ClipDeleteConfirm } from "@/components/clip-delete-confirm";
import { ClipShareSheet } from "@/components/clip-share-sheet";
import { ClipStage } from "@/components/clip-stage";
import { ReportDialog } from "@/components/report-dialog";
import { EmptyState } from "@/components/ui";
import { loadMoreClipsAction, toggleClipLikeAction, toggleClipSaveAction } from "@/lib/actions/clip";
import { toggleFollowAction } from "@/lib/actions/follow";
import type { ClipFeedCursor, FeedClip } from "@/lib/clips";

export type { FeedClip };

type ReactionState = { liked: boolean; likes: number; saved: boolean; saves: number };
type FollowState = { following: boolean; followsViewer: boolean };

// How close to the end of what's already loaded the active clip has to be
// before the next batch is fetched — small enough that it's not firing on
// every scroll, large enough that a new batch is usually there by the time
// the user actually reaches the end.
const LOAD_MORE_LOOKAHEAD = 3;

/** True while a keydown's target is a place that should own its own
 * keystrokes — a focused text input shouldn't have "j" or "k" hijacked
 * into feed navigation just because they're also shortcut letters. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Vertical clip feed. On desktop the video keeps its 9:16 frame instead of
 * being stretched, and j/k or arrow keys move between clips.
 */
export function ClipFeed({
  clips,
  viewerId,
  initialCursor,
}: {
  clips: FeedClip[];
  viewerId: string;
  initialCursor: ClipFeedCursor | null;
}) {
  // Which clip is "active" — the one that should be playing — driven
  // entirely by scroll position via the IntersectionObserver below, not by
  // whatever last moved focus. That's deliberate: mouse-wheel scrolling,
  // trackpad swipes, and j/k all just move the scroll position one way or
  // another, and the observer is the single thing that turns "this
  // section is now the one in view" into "this clip plays" — so all three
  // inputs produce identical playback behavior instead of j/k going
  // through a separate path that could disagree with where the user
  // actually scrolled to.
  const [activeClipId, setActiveClipId] = useState<string | null>(clips[0]?.id ?? null);
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [shareSheetFor, setShareSheetFor] = useState<string | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const [reportDialogFor, setReportDialogFor] = useState<string | null>(null);
  // Seeded once from the initial prop, then owned entirely client-side —
  // same "seed once, own it locally" approach as the reactions/comment-
  // count state below, so a delete can drop a clip out of the list without
  // waiting on a server round-trip to re-render with fresh props.
  const [items, setItems] = useState(clips);
  // null once the feed is exhausted; otherwise the (views, createdAt, id)
  // of the last clip currently in `items`, ready to hand straight to
  // loadMoreClipsAction. See fetchClipFeedPage in lib/clips.ts for why
  // this is a cursor and not a page number/offset.
  const [cursor, setCursor] = useState(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Synchronous guard against firing a second batch request before the
  // first one's setCursor/setIsLoadingMore have committed — the effect
  // below can re-run several times in the gap between "scrolled close to
  // the end" and "the fetch actually landed".
  const loadMoreInFlight = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  // Keyed by clip id rather than array position so a ref never goes stale
  // if `clips` is ever reordered — populated by the ref callback on each
  // <section> below, read by both the keyboard handler and scrollToClip.
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const [, startTransition] = useTransition();

  const scrollToClip = (clipId: string | undefined) => {
    sectionRefs.current.get(clipId ?? "")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // One IntersectionObserver watching every clip's snap section, scoped to
  // the scrolling container as its root (not the viewport — this list
  // scrolls internally). Whichever section has the highest intersection
  // ratio, once it clearly dominates the container (>= 0.6), becomes the
  // active clip. Multiple thresholds (rather than just one) so the
  // callback actually fires as a section crosses each of them, giving a
  // steady stream of ratio updates to compare instead of one all-or-
  // nothing signal at the end of a scroll.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.clipId;
          if (id) ratios.set(id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId && bestRatio >= 0.6) setActiveClipId(bestId);
      },
      { root, threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
    // Re-runs on `items` (not just on mount) so a delete — which drops a
    // section out of sectionRefs via its ref-callback cleanup — gets a
    // fresh observer over exactly the sections still in the DOM. That's
    // also what hands activeClipId to a deleted-clip's neighbor: nothing
    // here sets it directly (see the module comment above), it's just
    // this observer noticing, on the very next layout, that some other
    // section now dominates the viewport — the same mechanism an ordinary
    // scroll goes through.
  }, [items]);

  // Reaction state is seeded once from the initial props and never
  // re-derived from them afterward — toggleClipLikeAction/toggleClipSaveAction
  // deliberately don't revalidate the page (that would fight this
  // optimistic-with-rollback pattern), so `clips` stays stable for the
  // life of this component and there's nothing to re-sync against.
  const [reactions, setReactions] = useState<Record<string, ReactionState>>(() =>
    Object.fromEntries(
      clips.map((clip) => [clip.id, { liked: clip.liked, likes: clip.likes, saved: clip.saved, saves: clip.saves }]),
    ),
  );
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(clips.map((clip) => [clip.id, clip.comments])),
  );
  // Keyed by uploader id, not clip id — same seed-once-then-own-it
  // approach as reactions/commentCounts above, but a creator can have
  // several clips in the same feed and toggling follow on one should read
  // as followed everywhere else they show up too, not just on the card
  // that was clicked.
  const [followState, setFollowState] = useState<Record<string, FollowState>>(() =>
    Object.fromEntries(
      clips.map((clip) => [clip.userId, { following: clip.following, followsViewer: clip.followsViewer }]),
    ),
  );

  // Fetches the next batch once the active clip — the same signal the
  // autoplay observer above produces, not a separate scroll listener —
  // gets within LOAD_MORE_LOOKAHEAD of the end of what's loaded. Appending
  // to `items` is all this does to the DOM; the observer effect above
  // re-runs off that same `items` change and picks up the newly-mounted
  // sections on its own, so this never touches activeClipId or which clip
  // is playing.
  useEffect(() => {
    if (!cursor || loadMoreInFlight.current) return;
    const activeIndex = items.findIndex((clip) => clip.id === activeClipId);
    if (activeIndex === -1) return;
    if (items.length - 1 - activeIndex > LOAD_MORE_LOOKAHEAD) return;

    loadMoreInFlight.current = true;
    setIsLoadingMore(true);
    startTransition(async () => {
      const result = await loadMoreClipsAction(cursor);
      if ("error" in result) {
        // Left as-is rather than nulled out: if the active clip is still
        // within the lookahead window next time this effect runs (e.g. the
        // user nudges the scroll position again), it just retries.
        setIsLoadingMore(false);
        loadMoreInFlight.current = false;
        return;
      }

      setItems((current) => {
        const seen = new Set(current.map((clip) => clip.id));
        return [...current, ...result.clips.filter((clip) => !seen.has(clip.id))];
      });
      setReactions((state) => {
        const additions = Object.fromEntries(
          result.clips
            .filter((clip) => !(clip.id in state))
            .map((clip) => [clip.id, { liked: clip.liked, likes: clip.likes, saved: clip.saved, saves: clip.saves }]),
        );
        return { ...state, ...additions };
      });
      setCommentCounts((state) => {
        const additions = Object.fromEntries(
          result.clips.filter((clip) => !(clip.id in state)).map((clip) => [clip.id, clip.comments]),
        );
        return { ...state, ...additions };
      });
      setFollowState((state) => {
        // Keyed by uploader, not clip — a creator already seen earlier in
        // the feed keeps whatever follow state's already been toggled
        // locally rather than getting reset from this batch's snapshot.
        const additions = Object.fromEntries(
          result.clips
            .filter((clip) => !(clip.userId in state))
            .map((clip) => [clip.userId, { following: clip.following, followsViewer: clip.followsViewer }]),
        );
        return { ...state, ...additions };
      });
      setCursor(result.nextCursor);
      setIsLoadingMore(false);
      loadMoreInFlight.current = false;
    });
  }, [activeClipId, items, cursor, startTransition]);

  // j/k and the arrow keys just move the scroll position — one section
  // over from wherever the observer currently says is active — and rely
  // on that same observer to pick up the new active clip once the scroll
  // lands, exactly like a manual scroll would. Nothing here sets
  // activeClipId directly.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (!["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) return;
      const currentIndex = Math.max(
        0,
        items.findIndex((clip) => clip.id === activeClipId),
      );
      const delta = ["ArrowDown", "j"].includes(event.key) ? 1 : -1;
      const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + delta));
      scrollToClip(items[nextIndex]?.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, activeClipId]);

  const toggleLike = (clipId: string) => {
    const previous = reactions[clipId];
    setReactions((state) => ({
      ...state,
      [clipId]: { ...previous, liked: !previous.liked, likes: previous.likes + (previous.liked ? -1 : 1) },
    }));
    startTransition(async () => {
      const result = await toggleClipLikeAction(clipId);
      setReactions((state) => ({
        ...state,
        [clipId]:
          "error" in result ? previous : { ...state[clipId], liked: result.active, likes: result.count },
      }));
    });
  };

  const toggleSave = (clipId: string) => {
    const previous = reactions[clipId];
    setReactions((state) => ({
      ...state,
      [clipId]: { ...previous, saved: !previous.saved, saves: previous.saves + (previous.saved ? -1 : 1) },
    }));
    startTransition(async () => {
      const result = await toggleClipSaveAction(clipId);
      setReactions((state) => ({
        ...state,
        [clipId]:
          "error" in result ? previous : { ...state[clipId], saved: result.active, saves: result.count },
      }));
    });
  };

  const toggleFollow = (ownerId: string) => {
    const previous = followState[ownerId];
    setFollowState((state) => ({ ...state, [ownerId]: { ...previous, following: !previous.following } }));
    startTransition(async () => {
      const result = await toggleFollowAction(ownerId);
      setFollowState((state) => ({
        ...state,
        [ownerId]: "error" in result ? previous : { ...state[ownerId], following: result.following },
      }));
    });
  };

  // Drops a deleted clip out of the feed. Doesn't touch activeClipId even
  // when the deleted clip was the active one — see the observer effect's
  // comment above for why that's deliberately left to it rather than set
  // here. Any panel open for this clip closes with it, same as if the
  // clip had simply scrolled out of existence.
  const handleDeleted = (clipId: string) => {
    setItems((current) => current.filter((clip) => clip.id !== clipId));
    setDeleteConfirmFor(null);
    setCommentsOpenFor((current) => (current === clipId ? null : current));
    setShareSheetFor((current) => (current === clipId ? null : current));
  };

  const shareSheetClip = items.find((clip) => clip.id === shareSheetFor);
  const deleteConfirmClip = items.find((clip) => clip.id === deleteConfirmFor);
  const reportDialogClip = items.find((clip) => clip.id === reportDialogFor);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="No clips left"
          body="Every clip in this feed has been removed."
          action={{ href: "/clips/new", label: "Upload a clip" }}
        />
      </div>
    );
  }

  return (
    <div
      ref={container}
      className="no-scrollbar h-[calc(100dvh_-_var(--header-h)_-_var(--mobile-nav-clearance))] snap-y snap-mandatory overflow-y-auto lg:h-[calc(100dvh_-_var(--header-h))]"
    >
      {items.map((clip) => {
        const reaction = reactions[clip.id];
        const commentCount = commentCounts[clip.id];
        return (
          <section
            key={clip.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(clip.id, el);
              else sectionRefs.current.delete(clip.id);
            }}
            data-clip-id={clip.id}
            className="flex h-full snap-center items-center justify-center px-3 py-3"
            aria-roledescription="clip"
            aria-label={clip.title}
          >
            <div className="relative w-full">
              <ClipStage
                clip={clip}
                isActive={clip.id === activeClipId}
                onActivate={() => scrollToClip(clip.id)}
                isOwnClip={clip.userId === viewerId}
                following={followState[clip.userId]?.following ?? false}
                followsViewer={followState[clip.userId]?.followsViewer ?? false}
                onToggleFollow={() => toggleFollow(clip.userId)}
                reaction={reaction}
                commentCount={commentCount}
                onToggleLike={() => toggleLike(clip.id)}
                onToggleSave={() => toggleSave(clip.id)}
                onShare={() => setShareSheetFor(clip.id)}
                shareActive={shareSheetFor === clip.id}
                onDelete={() => setDeleteConfirmFor(clip.id)}
                deleteActive={deleteConfirmFor === clip.id}
                onReport={() => setReportDialogFor(clip.id)}
                reportActive={reportDialogFor === clip.id}
                commentsActive={commentsOpenFor === clip.id}
                onCommentsClick={() => {
                  scrollToClip(clip.id);
                  setCommentsOpenFor((current) => (current === clip.id ? null : clip.id));
                }}
              />

              {commentsOpenFor === clip.id && (
                <ClipCommentsPanel
                  clipId={clip.id}
                  viewerId={viewerId}
                  onClose={() => setCommentsOpenFor(null)}
                  onCountChange={(delta) =>
                    setCommentCounts((state) => ({ ...state, [clip.id]: state[clip.id] + delta }))
                  }
                />
              )}
            </div>
          </section>
        );
      })}

      {/* Trailing status block, not a clip section — no snap-* class, so it
          never becomes a snap stop of its own and doesn't feed the
          autoplay IntersectionObserver above (that one only watches
          [data-clip-id] sections). Purely a function of state; scrolling
          here doesn't trigger anything itself, the fetch already started
          once the active clip got close (see the effect above). */}
      <div className="flex h-28 shrink-0 items-center justify-center">
        {isLoadingMore ? (
          <p className="eyebrow flex items-center gap-2 text-faint">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading more…
          </p>
        ) : cursor === null ? (
          <p className="eyebrow text-faint">You&apos;re all caught up</p>
        ) : null}
      </div>

      {shareSheetClip && (
        <ClipShareSheet
          clip={{ id: shareSheetClip.id, slug: shareSheetClip.slug, title: shareSheetClip.title }}
          onClose={() => setShareSheetFor(null)}
        />
      )}

      {deleteConfirmClip && (
        <ClipDeleteConfirm
          clip={{ id: deleteConfirmClip.id, title: deleteConfirmClip.title }}
          onClose={() => setDeleteConfirmFor(null)}
          onDeleted={() => handleDeleted(deleteConfirmClip.id)}
        />
      )}

      {reportDialogClip && (
        <ReportDialog
          target="CLIP"
          targetId={reportDialogClip.id}
          label="clip"
          onClose={() => setReportDialogFor(null)}
        />
      )}
    </div>
  );
}

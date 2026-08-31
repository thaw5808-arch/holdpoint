"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ClipCommentsPanel } from "@/components/clip-comments-panel";
import { ClipDeleteConfirm } from "@/components/clip-delete-confirm";
import { ClipShareSheet } from "@/components/clip-share-sheet";
import { ClipStage } from "@/components/clip-stage";
import { ReportDialog } from "@/components/report-dialog";
import { EmptyState } from "@/components/ui";
import { toggleClipLikeAction, toggleClipSaveAction } from "@/lib/actions/clip";

export interface FeedClip {
  id: string;
  userId: string;
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
  likes: number;
  saves: number;
  comments: number;
  liked: boolean;
  saved: boolean;
}

type ReactionState = { liked: boolean; likes: number; saved: boolean; saves: number };

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
export function ClipFeed({ clips, viewerId }: { clips: FeedClip[]; viewerId: string }) {
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

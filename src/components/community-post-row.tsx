"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { Film, Flag, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ClipViewerModal } from "@/components/clip-viewer-modal";
import { ReportDialog } from "@/components/report-dialog";
import { Pill } from "@/components/ui";
import { deleteCommunityPostAction } from "@/lib/actions/community";
import { duration as formatDuration } from "@/lib/format";

/** The clip a CLIPS-channel post points at — see CommunityPost.clipId in
 * schema.prisma. Absent for a post in any other channel kind, and also
 * absent (rather than the row disappearing) when the clip itself has
 * since been deleted — `onDelete: SetNull` keeps the post and its
 * moderation trail around, and this row shows a "clip removed" stub for
 * that case instead of pretending the post never had one. */
export interface CommunityPostClipData {
  /** Needed to open the in-channel viewer (ClipViewerModal fetches by id,
   * not slug — see getClipDetailAction) — everything else here is just
   * for the card's own thumbnail. */
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  thumbnailUrl: string | undefined;
}

export interface CommunityPostRowData {
  id: string;
  body: string;
  clip: CommunityPostClipData | null | undefined;
  pinned: boolean;
  createdAt: string; // pre-formatted relative time
  authorName: string;
  authorUsername: string | undefined;
  authorAvatarUrl: string | undefined;
  canDelete: boolean;
  /** Signed in and not this post's own author — reportContentAction
   * blocks a self-report regardless, this just keeps the button from
   * showing on your own post in the first place. */
  canReport: boolean;
}

/** The clip card a CLIPS-channel post renders instead of plain body text —
 * `post.body` still shows underneath as an optional caption. Deliberately
 * its own small layout rather than reusing cards.tsx's ClipTile: ClipTile
 * carries its own byline (avatar + name), which would duplicate the row's
 * own author header right above it.
 *
 * Stays a real `<Link>` to /clips/[slug] rather than becoming a plain
 * button: a signed-in viewer's plain click is intercepted below to open
 * the in-channel viewer instead (see CommunityPostRow), but ctrl/cmd-click,
 * middle-click, and a screen reader's "open link" all still work exactly
 * as a link — the browser handles those before (or instead of) `onClick`
 * ever firing, so no special-casing is needed to keep them working. A
 * signed-out viewer isn't handed an `onOpen` at all, so their click just
 * navigates — same as before this existed, and getClipDetailAction would
 * reject an unauthenticated fetch anyway.
 */
function PostClipCard({ clip, onOpen }: { clip: CommunityPostClipData; onOpen?: () => void }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <Link
      href={`/clips/${clip.slug}`}
      onClick={handleClick}
      className="group mt-1.5 flex items-center gap-3 border border-line bg-raised p-2"
    >
      <div className="relative w-20 shrink-0">
        {clip.thumbnailUrl ? (
          // Same reasoning as ClipTile/Avatar: served through a
          // redirecting app route in front of a private bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="aspect-[9/16] w-full bg-ink object-cover" />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center bg-ink">
            <Film size={18} className="text-faint" />
          </div>
        )}
        <span className="tabular glass absolute bottom-1 right-1 px-1 py-0.5 text-[0.5625rem]">
          {formatDuration(clip.durationSec)}
        </span>
      </div>
      <p className="min-w-0 flex-1 text-[0.875rem] leading-snug group-hover:text-signal">{clip.title}</p>
    </Link>
  );
}

/**
 * One post row. Owns its own "hidden" flag so it can disappear the instant
 * its own delete succeeds, rather than copying the whole post list into
 * client state — a list copy would need re-syncing on every channel switch
 * or new post from someone else, which a plain `useState(initialProp)`
 * doesn't do on its own. A single per-post boolean has no such staleness
 * problem: it starts false, and the only way it flips is this row's own
 * delete succeeding. deleteCommunityPostAction re-checks authorship or
 * moderator standing from the DB regardless of `canDelete`.
 */
export function CommunityPostRow({
  post,
  viewerId,
}: {
  post: CommunityPostRowData;
  /** The signed-in viewer's own id, for opening this post's clip (if it
   * has one) in place instead of navigating to /clips/[slug] — see
   * PostClipCard and ClipViewerModal. Undefined for a signed-out viewer,
   * in which case the card just stays a plain link to the full page. */
  viewerId?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Whether this row's own clip is currently open in the in-channel
  // viewer. Scoped per-row rather than lifted to a shared "which clip is
  // open" id at the channel level: ClipViewerModal is a full-viewport
  // overlay that blocks interaction with everything behind it, so at most
  // one row's modal can ever actually be open at once regardless — there's
  // no shared state to coordinate for "one at a time" to hold.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (hidden) return null;

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteCommunityPostAction(post.id);
      if ("error" in result) {
        setError(result.error);
      } else {
        setHidden(true);
      }
    });
  };

  const avatar = (
    <Avatar name={post.authorName} seed={post.authorUsername} size={32} avatarUrl={post.authorAvatarUrl} />
  );

  return (
    <li className="flex gap-2.5 border border-line bg-surface p-3">
      {post.authorUsername ? (
        <Link href={`/u/${post.authorUsername}`} aria-label={post.authorName}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          {post.authorUsername ? (
            <Link href={`/u/${post.authorUsername}`} className="text-[0.875rem] hover:text-signal">
              {post.authorName}
            </Link>
          ) : (
            <span className="text-[0.875rem]">{post.authorName}</span>
          )}
          <span className="tabular text-[0.625rem] text-faint">{post.createdAt}</span>
          {post.pinned && <Pill tone="signal">pinned</Pill>}
          {(post.canDelete || post.canReport) && (
            <span className="ml-auto flex items-center gap-1">
              {post.canReport && (
                <button
                  type="button"
                  className="btn btn-ghost px-1.5 text-faint hover:text-signal"
                  onClick={() => setReportOpen(true)}
                  aria-label="Report post"
                >
                  <Flag size={12} />
                </button>
              )}
              {post.canDelete && (
                <button
                  type="button"
                  className="btn btn-ghost px-1.5 text-faint hover:text-live"
                  onClick={handleDelete}
                  disabled={isPending}
                  aria-label="Delete post"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )}
        </p>
        {post.clip ? (
          <PostClipCard clip={post.clip} onOpen={viewerId ? () => setViewerOpen(true) : undefined} />
        ) : post.clip === null ? (
          <p className="mt-1.5 border border-dashed border-line px-2.5 py-1.5 text-[0.8125rem] text-faint">
            This clip has been removed.
          </p>
        ) : null}
        {post.body && <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">{post.body}</p>}
        {error && (
          <p role="alert" className="mt-1 text-[0.6875rem] text-live">
            {error}
          </p>
        )}
      </div>

      {reportOpen && (
        <ReportDialog target="COMMUNITY_POST" targetId={post.id} label="post" onClose={() => setReportOpen(false)} />
      )}

      {viewerOpen && post.clip && viewerId && (
        <ClipViewerModal clipId={post.clip.id} onClose={() => setViewerOpen(false)} />
      )}
    </li>
  );
}

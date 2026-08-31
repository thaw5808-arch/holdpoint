"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Flag, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ReportDialog } from "@/components/report-dialog";
import { Pill } from "@/components/ui";
import { deleteCommunityPostAction } from "@/lib/actions/community";

export interface CommunityPostRowData {
  id: string;
  body: string;
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
export function CommunityPostRow({ post }: { post: CommunityPostRowData }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
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
        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">{post.body}</p>
        {error && (
          <p role="alert" className="mt-1 text-[0.6875rem] text-live">
            {error}
          </p>
        )}
      </div>

      {reportOpen && (
        <ReportDialog target="COMMUNITY_POST" targetId={post.id} label="post" onClose={() => setReportOpen(false)} />
      )}
    </li>
  );
}

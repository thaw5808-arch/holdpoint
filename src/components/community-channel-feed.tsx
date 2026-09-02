"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { CommunityPostRow, type CommunityPostRowData } from "@/components/community-post-row";
import { dayDivider } from "@/lib/format";

/** Same-author posts within this long of each other group under one
 * avatar/name — Discord's own default run length, not a value this app
 * had an existing constant for. */
const GROUP_GAP_MS = 7 * 60_000;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A channel's scrollable post list plus its composer — the Discord-shaped
 * replacement for the old "composer on top, posts descending beneath it"
 * layout. Posts arrive oldest-first (see [slug]/page.tsx, which fetches
 * the newest 20 and reverses them) and this only ever renders that order;
 * newest ends up at the bottom, right above the composer, same as a real
 * chat.
 *
 * Scroll behaviour mirrors MessageThread (message-thread.tsx) exactly
 * rather than inventing a second version: a sentinel div after the last
 * post, scrolled into view on mount and whenever the post count changes.
 * Posts and the composer aren't optimistic/local state the way
 * MessageThread's `lines` are — createCommunityPostAction and friends
 * still just revalidatePath and let the server component re-fetch — so
 * this component takes the freshly-rendered `posts` array as a prop rather
 * than seeding local state from it. The parent keys this whole component
 * by channel id (see [slug]/page.tsx) so switching channels remounts it
 * and the "opens scrolled to newest" behaviour applies there too, not just
 * on first load.
 */
export function CommunityChannelFeed({
  posts,
  viewerId,
  emptyMessage,
  composer,
}: {
  posts: CommunityPostRowData[];
  viewerId?: string;
  emptyMessage: string;
  composer: ReactNode;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [posts.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {posts.length === 0 && (
          <div className="mx-2.5 mt-3 border border-dashed border-line p-6 text-center text-sm text-muted">
            {emptyMessage}
          </div>
        )}
        {posts.map((post, index) => {
          const previous = posts[index - 1];
          const createdAt = new Date(post.createdAt);
          const previousCreatedAt = previous ? new Date(previous.createdAt) : null;
          const newDay = !previousCreatedAt || !sameDay(createdAt, previousCreatedAt);
          const grouped =
            !newDay &&
            previous !== undefined &&
            previous.authorId === post.authorId &&
            createdAt.getTime() - previousCreatedAt!.getTime() < GROUP_GAP_MS;

          return (
            <div key={post.id}>
              {newDay && (
                <div role="separator" className="my-2 flex items-center gap-3 px-2.5">
                  <span className="h-px flex-1 bg-line" />
                  <span className="tabular text-[0.6875rem] text-faint">{dayDivider(createdAt)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <CommunityPostRow
                post={post}
                compact={grouped}
                timeLabel={createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                viewerId={viewerId}
              />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="shrink-0">{composer}</div>
    </div>
  );
}

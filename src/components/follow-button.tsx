"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus } from "lucide-react";
import { toggleFollowAction } from "@/lib/actions/follow";

/**
 * The three things this button can say. Shared with WatchView's own
 * follow toggle (watch-view.tsx) so the two surfaces can't drift apart on
 * wording — "Follow back" only makes sense once you know the *other*
 * direction of the relationship too (does the person you're looking at
 * already follow you), which is why every caller has to fetch both
 * Follow rows, not just the one the button itself toggles.
 */
export function followLabel(following: boolean, followsYou: boolean): string {
  if (following) return "Following";
  return followsYou ? "Follow back" : "Follow";
}

/**
 * Follow/unfollow control for a profile page (/u/[username]) — replaces
 * what used to be a static `<button>Follow</button>` with no onClick, no
 * state, and no server call at all. Mirrors WatchView's own follow toggle
 * (watch-view.tsx): seeded once from the server (`initialFollowing`),
 * then owned locally — optimistic on click, rolled back if the action
 * reports an error.
 *
 * The header's "N followers" count sits elsewhere on the page as plain
 * server-rendered text (computed fresh from `_count.followers` on every
 * request), so on a successful toggle this calls router.refresh() to
 * pull that in — toggleFollowAction itself only ever returns the new
 * following boolean, not a count, and calling a server action directly
 * like this (rather than through a bound `<form action>`) doesn't
 * auto-refresh the page on its own, same reason admin-users-table.tsx
 * calls router.refresh() after its own mutations.
 */
export function FollowButton({
  targetUserId,
  initialFollowing,
  followsYou,
}: {
  targetUserId: string;
  initialFollowing: boolean;
  /** Does the profile being viewed already follow the signed-in user?
   * Only changes the button's label ("Follow" vs "Follow back") — never
   * refetched client-side, since only the viewer's own follow/unfollow
   * (not the other person's) can happen from this button. */
  followsYou: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const optimistic = !following;
    setError(null);
    setFollowing(optimistic);
    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId);
      if ("error" in result) {
        setFollowing(!optimistic); // roll back
        setError(result.error);
        return;
      }
      setFollowing(result.following);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={following ? "btn" : "btn btn-primary"}
        aria-pressed={following}
        disabled={isPending}
        onClick={handleClick}
      >
        {following ? <UserCheck size={14} /> : <UserPlus size={14} />}
        {followLabel(following, followsYou)}
      </button>
      {error && (
        <p role="alert" className="text-[0.6875rem] text-live">
          {error}
        </p>
      )}
    </div>
  );
}

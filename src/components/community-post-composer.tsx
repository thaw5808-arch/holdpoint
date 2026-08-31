"use client";

import { useState, useTransition } from "react";
import { JoinCommunityButton } from "@/components/join-community-button";
import { createCommunityPostAction } from "@/lib/actions/community";

/**
 * Post composer for a member of the community. Rendered only for members
 * (non-members see JoinToPostPrompt below instead) — createCommunityPostAction
 * re-derives membership and, for an announcement channel, moderator standing
 * from the DB regardless, so a direct call from a non-member or a non-mod
 * posting to #announcements is rejected the same way either way.
 */
export function CommunityPostComposer({
  channelId,
  channelName,
  canPostHere,
}: {
  channelId: string;
  channelName: string;
  canPostHere: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canPostHere) {
    return (
      <p className="mb-3 border border-dashed border-line px-3 py-2.5 text-sm text-muted">
        Only moderators can post in #{channelName}.
      </p>
    );
  }

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await createCommunityPostAction(channelId, trimmed);
      if ("error" in result) {
        setError(result.error);
      } else {
        setBody("");
      }
    });
  };

  return (
    <form
      className="mb-3 border border-line bg-surface p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={`Message #${channelName}`}
        rows={2}
        maxLength={2000}
        disabled={isPending}
        className="input w-full resize-none"
      />
      <div className="mt-2 flex items-center justify-between">
        {error ? (
          <p role="alert" className="text-[0.75rem] text-live">
            {error}
          </p>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={isPending || !body.trim()}>
          Post
        </button>
      </div>
    </form>
  );
}

/** Non-member view: a prompt to join instead of a composer. */
export function JoinToPostPrompt({ communityId }: { communityId: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-dashed border-line px-3 py-2.5 text-sm text-muted">
      <span>Join this community to post here.</span>
      <JoinCommunityButton communityId={communityId} joined={false} />
    </div>
  );
}

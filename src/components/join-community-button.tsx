"use client";

import { useState, useTransition } from "react";
import { toggleCommunityMembershipAction } from "@/lib/actions/community";

export function JoinCommunityButton({
  communityId,
  joined: initialJoined,
}: {
  communityId: string;
  joined: boolean;
}) {
  const [joined, setJoined] = useState(initialJoined);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const optimistic = !joined;
    setJoined(optimistic);
    startTransition(async () => {
      const result = await toggleCommunityMembershipAction(communityId);
      if ("error" in result) {
        setJoined(!optimistic); // roll back
      } else {
        setJoined(result.joined);
      }
    });
  };

  return (
    <button
      className={joined ? "btn" : "btn btn-primary"}
      onClick={handleClick}
      aria-pressed={joined}
      disabled={isPending}
    >
      {joined ? "Joined" : "Join community"}
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { endStreamAction, goLiveAction } from "@/lib/actions/stream";

/**
 * The Studio header's Go Live / End Stream control — previously a
 * `<button>` with no onClick at all. Seeded once from the server
 * (`initialLive`), then owned locally like every other toggle in this
 * codebase (JoinCommunityButton, FollowButton): optimistic label swap on
 * click, rolled back on error. The rest of this page (the preview's
 * Live/Offline badge, viewer count, /live, the watch page, …) is plain
 * server-rendered data, so a successful toggle calls router.refresh() to
 * pull that in — same reasoning as FollowButton's own use of it.
 */
export function StudioLiveControls({ initialLive }: { initialLive: boolean }) {
  const router = useRouter();
  const [isLive, setIsLive] = useState(initialLive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = isLive ? await endStreamAction() : await goLiveAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setIsLive(result.isLive);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn btn-primary" onClick={handleClick} disabled={isPending}>
        <Radio size={14} />
        {isPending ? (isLive ? "Ending…" : "Going live…") : isLive ? "End stream" : "Go live"}
      </button>
      {error && (
        <p role="alert" className="text-[0.6875rem] text-live">
          {error}
        </p>
      )}
    </div>
  );
}

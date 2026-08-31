"use client";

import { useState, useTransition } from "react";
import { closeLFGPostAction } from "@/lib/actions/lfg";

/** Lets the author of an LFG post close it — the schema's `open` flag
 * exists (LFGPost.open, default true) but nothing set it to false before
 * this. Closing removes it from the open-posts list on next load. */
export function CloseLFGPostButton({ postId }: { postId: string }) {
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (closed) return <span className="text-[0.6875rem] text-faint">Closed</span>;

  return (
    <span>
      <button
        type="button"
        className="text-[0.6875rem] text-faint hover:text-live"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await closeLFGPostAction(postId);
            if ("error" in result) {
              setError(result.error);
            } else {
              setClosed(true);
            }
          });
        }}
      >
        {isPending ? "Closing…" : "Close"}
      </button>
      {error && (
        <span role="alert" className="ml-1.5 text-[0.6875rem] text-live">
          {error}
        </span>
      )}
    </span>
  );
}

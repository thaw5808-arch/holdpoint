"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { clipShareCandidatesAction, type ShareCandidate } from "@/lib/actions/clip";
import { startConversationAction } from "@/lib/actions/message";

/**
 * "New message" entry point on /messages — the thing that used to not
 * exist at all (a conversation could only ever come from clip share-to-DM).
 * Reuses clipShareCandidatesAction (actions/clip.ts) for the candidate
 * list rather than writing a second "who can I reach" query: it already
 * returns exactly the people a follow relationship makes reachable, the
 * same population startConversationAction re-checks server-side on submit
 * (see usersCanMessage in lib/conversations.ts) — a clip-specific name on
 * a genuinely general "people I can DM" query, not worth a parallel one
 * just to rename it.
 */
export function NewMessageButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ShareCandidate[] | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && candidates === null) clipShareCandidatesAction().then(setCandidates);
  }, [open, candidates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const start = async (candidate: ShareCandidate) => {
    setError(null);
    setStartingId(candidate.id);
    const result = await startConversationAction(candidate.id);
    setStartingId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push(`/messages/${result.conversationId}`);
  };

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <MessageSquarePlus size={14} /> New message
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="New message"
            onClick={(event) => event.stopPropagation()}
            className="glass-strong max-h-[80dvh] w-full max-w-sm overflow-y-auto sm:max-h-[70dvh]"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line/60 bg-ink/60 px-4 py-3 backdrop-blur-md">
              <p className="eyebrow">New message</p>
              <button className="btn btn-ghost px-1.5" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-3">
              {candidates === null ? (
                <p className="py-2 text-sm text-muted">Loading…</p>
              ) : candidates.length === 0 ? (
                <p className="py-2 text-sm text-muted">
                  Follow a few people, or wait for someone to follow you — that&rsquo;s who you can message
                  directly.
                </p>
              ) : (
                <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                  {candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => start(candidate)}
                        disabled={startingId === candidate.id}
                        className="flex w-full items-center gap-2.5 px-2 py-2 text-left hover:bg-surface disabled:opacity-70"
                      >
                        <Avatar
                          name={candidate.displayName}
                          seed={candidate.username}
                          size={30}
                          avatarUrl={candidate.avatarUrl}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{candidate.displayName}</span>
                          <span className="block truncate text-[0.6875rem] text-faint">@{candidate.username}</span>
                        </span>
                        {startingId === candidate.id && (
                          <span className="shrink-0 text-[0.75rem] text-faint">Opening…</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="mt-2 text-[0.75rem] text-live">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

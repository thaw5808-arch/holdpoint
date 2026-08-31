"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Code2, Link2, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { clipShareCandidatesAction, sendClipToUserAction, type ShareCandidate } from "@/lib/actions/clip";

type CopyStatus = { tone: "success" | "error"; text: string; payload?: string } | null;

function clipUrl(slug: string) {
  return `${window.location.origin}/clips/${slug}`;
}

function embedSnippet(slug: string, title: string) {
  return `<iframe src="${clipUrl(slug)}/embed" title="${title.replace(/"/g, "&quot;")}" width="360" height="640" frameborder="0" allowfullscreen></iframe>`;
}

/** Writes to the clipboard, handling both an outright unsupported
 * (insecure-context) clipboard and a write that throws. */
async function copyText(text: string): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The app's own share sheet — never the native OS one. Two rows: people
 * the caller can send the clip to directly (drawn from follows in either
 * direction), and external actions (copy link, copy embed code). The
 * sheet stays open after a send so several people can be messaged in one
 * sitting; each row tracks its own sent/error state independently.
 */
export function ClipShareSheet({
  clip,
  onClose,
}: {
  clip: { id: string; slug: string; title: string };
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<ShareCandidate[] | null>(null);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clipShareCandidatesAction().then(setCandidates);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sendTo = async (candidate: ShareCandidate) => {
    setSendErrors((state) => ({ ...state, [candidate.id]: "" }));
    setSending((state) => new Set(state).add(candidate.id));
    const result = await sendClipToUserAction(clip.id, candidate.id);
    setSending((state) => {
      const next = new Set(state);
      next.delete(candidate.id);
      return next;
    });
    if ("error" in result) {
      setSendErrors((state) => ({ ...state, [candidate.id]: result.error }));
    } else {
      setSent((state) => new Set(state).add(candidate.id));
    }
  };

  const copyLink = async () => {
    const ok = await copyText(clipUrl(clip.slug));
    setCopyStatus(
      ok
        ? { tone: "success", text: "Link copied" }
        : { tone: "error", text: "Couldn't copy — copy manually:", payload: clipUrl(clip.slug) },
    );
  };

  const copyEmbed = async () => {
    const snippet = embedSnippet(clip.slug, clip.title);
    const ok = await copyText(snippet);
    setCopyStatus(
      ok
        ? { tone: "success", text: "Embed code copied" }
        : { tone: "error", text: "Couldn't copy — copy manually:", payload: snippet },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Share clip"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong max-h-[80dvh] w-full max-w-sm overflow-y-auto sm:max-h-[70dvh]"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line/60 bg-ink/60 px-4 py-3 backdrop-blur-md">
          <p className="eyebrow">Share clip</p>
          <button className="btn btn-ghost px-1.5" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="eyebrow mb-2">Send to</p>
          {candidates === null ? (
            <p className="py-2 text-sm text-muted">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="py-2 text-sm text-muted">
              Follow a few people, or wait for someone to follow you — that&rsquo;s who you can send clips
              to directly.
            </p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => sendTo(candidate)}
                    disabled={sending.has(candidate.id)}
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
                      {sendErrors[candidate.id] && (
                        <span className="block text-[0.6875rem] text-live">{sendErrors[candidate.id]}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[0.75rem]">
                      {sending.has(candidate.id) ? (
                        <span className="text-faint">Sending…</span>
                      ) : sent.has(candidate.id) ? (
                        <span className="flex items-center gap-1 text-signal">
                          <Check size={14} /> Sent
                        </span>
                      ) : (
                        <span className="text-faint">Send</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line/60 px-4 py-3">
          <p className="eyebrow mb-2">More</p>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={copyLink}>
              <Link2 size={14} /> Copy link
            </button>
            <button type="button" className="btn flex-1" onClick={copyEmbed}>
              <Code2 size={14} /> Copy embed
            </button>
          </div>
          {copyStatus && (
            <p
              role="status"
              className={`mt-2 text-[0.75rem] ${copyStatus.tone === "error" ? "text-muted" : "text-signal"}`}
            >
              {copyStatus.text}
              {copyStatus.payload && (
                <span className="tabular mt-0.5 block select-all break-all text-faint">
                  {copyStatus.payload}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  addClipCommentAction,
  clipCommentsAction,
  deleteClipCommentAction,
  type ClipCommentData,
} from "@/lib/actions/clip";
import { relativeTime } from "@/lib/format";

/**
 * A clip's comment thread. Two presentations of the same data-fetching and
 * posting logic: "overlay" floats over the clip and can be closed (used by
 * the feed, where the clip is still the point); "inline" renders in normal
 * page flow with no close affordance (used by the single-clip page, which
 * has no feed to fall back to).
 */
export function ClipCommentsPanel({
  clipId,
  viewerId,
  variant = "overlay",
  onClose,
  onCountChange,
}: {
  clipId: string;
  viewerId: string;
  variant?: "overlay" | "inline";
  onClose?: () => void;
  onCountChange: (delta: number) => void;
}) {
  const [comments, setComments] = useState<ClipCommentData[] | null>(null);
  const [replyTo, setReplyTo] = useState<ClipCommentData | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    setReplyTo(null);
    setError(null);
    clipCommentsAction(clipId).then((result) => {
      if (!cancelled) setComments(result);
    });
    return () => {
      cancelled = true;
    };
  }, [clipId]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await addClipCommentAction(clipId, trimmed, replyTo?.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setComments((current) => [...(current ?? []), result.comment]);
      onCountChange(1);
      setBody("");
      setReplyTo(null);
    });
  };

  const remove = (commentId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteClipCommentAction(commentId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // A deleted parent cascades its replies away too (schema-level
      // onDelete: Cascade), so drop both the comment and anything
      // threaded under it from local state in one pass.
      setComments((current) => {
        if (!current) return current;
        const toRemove = new Set([commentId, ...current.filter((c) => c.parentId === commentId).map((c) => c.id)]);
        onCountChange(-toRemove.size);
        return current.filter((c) => !toRemove.has(c.id));
      });
    });
  };

  const topLevel = comments?.filter((comment) => !comment.parentId) ?? [];
  const repliesOf = (parentId: string) => (comments ?? []).filter((comment) => comment.parentId === parentId);

  const row = (comment: ClipCommentData, indented: boolean) => (
    <li key={comment.id} className={indented ? "ml-8" : ""}>
      <div className="flex gap-2">
        <Link
          href={`/u/${comment.author.username}`}
          aria-label={comment.author.displayName}
          onClick={(event) => event.stopPropagation()}
        >
          <Avatar
            name={comment.author.displayName}
            seed={comment.author.username}
            size={26}
            avatarUrl={comment.author.avatarUrl}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5">
            <Link
              href={`/u/${comment.author.username}`}
              className="text-[0.8125rem] hover:text-signal"
              onClick={(event) => event.stopPropagation()}
            >
              {comment.author.displayName}
            </Link>
            <span className="tabular text-[0.625rem] text-faint">
              {relativeTime(new Date(comment.createdAt))}
            </span>
          </p>
          <p className="text-[0.8125rem] leading-snug text-muted">{comment.body}</p>
          <div className="mt-0.5 flex items-center gap-3">
            {!indented && (
              <button
                type="button"
                className="text-[0.6875rem] text-faint hover:text-text"
                onClick={() => {
                  setReplyTo(comment);
                  inputRef.current?.focus();
                }}
              >
                Reply
              </button>
            )}
            {comment.author.id === viewerId && (
              <button
                type="button"
                className="text-[0.6875rem] text-faint hover:text-live"
                onClick={() => remove(comment.id)}
                disabled={isPending}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );

  const inline = variant === "inline";

  return (
    <div
      className={
        inline
          ? "flex flex-col"
          : "glass-strong absolute inset-y-3 right-3 z-20 flex w-[300px] flex-col overflow-hidden"
      }
    >
      {!inline && (
        <div className="flex items-center justify-between border-b border-line/60 px-3 py-2.5">
          <p className="eyebrow">Comments</p>
          <button className="btn btn-ghost px-1.5" onClick={onClose} aria-label="Close comments">
            <X size={15} />
          </button>
        </div>
      )}

      <ul className={inline ? "space-y-3" : "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"}>
        {comments === null && <p className="text-sm text-muted">Loading…</p>}
        {comments?.length === 0 && (
          <p className="text-sm text-muted">No comments yet. Say the first thing.</p>
        )}
        {topLevel.map((comment) => (
          <ul key={comment.id} className="space-y-2">
            {row(comment, false)}
            {repliesOf(comment.id).map((reply) => row(reply, true))}
          </ul>
        ))}
      </ul>

      <div className={inline ? "pt-3" : "border-t border-line/60 p-2.5"}>
        {replyTo && (
          <p className="mb-1.5 flex items-center justify-between text-[0.6875rem] text-faint">
            Replying to {replyTo.author.displayName}
            <button type="button" className="text-faint hover:text-text" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </p>
        )}
        <textarea
          ref={inputRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={replyTo ? `Reply to ${replyTo.author.displayName}` : "Add a comment"}
          rows={2}
          maxLength={1000}
          disabled={isPending}
          className="input w-full resize-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          {error ? (
            <p role="alert" className="text-[0.6875rem] text-live">
              {error}
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={isPending || !body.trim()}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

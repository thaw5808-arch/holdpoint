"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { deleteClipAction } from "@/lib/actions/clip";

/**
 * Confirmation dialog for deleting a clip. Unlike comment deletion (a
 * single click, no confirmation), this is fronted by an explicit
 * confirm/cancel step — it's not undoable, and it takes the video down
 * with it. Shared by the feed, the detail page, and profile clip tiles;
 * each caller owns what happens after a successful delete (`onDeleted`),
 * since that differs per surface — removed from a list on the feed and on
 * a profile, a redirect away on the single-clip page.
 */
export function ClipDeleteConfirm({
  clip,
  onClose,
  onDeleted,
}: {
  clip: { id: string; title: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);

  const confirmDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteClipAction(clip.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onDeleted();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="alertdialog"
        aria-label="Delete clip"
        aria-describedby="clip-delete-warning"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong w-full max-w-sm p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Delete clip</p>
          <button
            type="button"
            className="btn btn-ghost px-1.5"
            onClick={onClose}
            aria-label="Close"
            disabled={isPending}
          >
            <X size={16} />
          </button>
        </div>
        <p id="clip-delete-warning" className="text-sm text-muted">
          Delete &ldquo;{clip.title}&rdquo;? This can&rsquo;t be undone — the video, comments, and likes all
          go with it.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-[0.75rem] text-live">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
